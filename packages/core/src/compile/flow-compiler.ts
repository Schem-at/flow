/**
 * Flow folding — compile an entire flow graph into ONE v2 block.
 *
 * Each code node's (type-stripped) source is wrapped in an IIFE that returns
 * its `generate`, giving every block a private scope (helpers can't collide).
 * Edges become plain local variables, so intermediate values — including live
 * WASM schematics — pass between stages with zero serialization and no
 * per-node engine round-trips. The folded output is itself a valid block
 * (`function generate(inputs) { … }`), so it runs through the existing
 * compile + sandbox + killable-worker pipeline unchanged, and can even be
 * opened in the workbench.
 *
 * Intended for tool-mode / API execution where per-node previews aren't
 * needed. Cache by `hashFlow()`: recompile only when the graph changes.
 */

import { stripTypes, positionalInputNames } from './index.js';
import { expandFormNodes } from './form.js';
import { contractToTypeScript } from './codegen.js';
import type { BlockContract, FlowType } from '../types/flow-type.js';
import { defaultValueForType } from '../types/flow-type.js';
import { BASE64_DECODER_SOURCE } from '../utils/base64.js';
import { isAssetNodeData, type AssetNodeData } from '../utils/assets.js';
import {
  isGroupNodeData,
  isMapNodeData,
  type GroupNodeData,
  type MapNodeData,
  type BoundaryPort,
} from './group.js';

export class FlowCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowCompileError';
  }
}

interface FlowNodeLike {
  id: string;
  type: string;
  data: {
    label?: string;
    code?: string;
    value?: unknown;
    contract?: BlockContract;
    passthrough?: boolean;
    [key: string]: unknown;
  };
}

interface FlowEdgeLike {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowLike {
  nodes: FlowNodeLike[];
  edges: FlowEdgeLike[];
}

export interface CompiledFlow {
  /** A v2 block source running the whole graph: `function generate(inputs)`. */
  source: string;
  /** Stable content hash of everything that affects execution. */
  hash: string;
  /** Flow-level inputs (from input nodes): name → baked default. */
  inputs: Record<string, unknown>;
  /** Output names (from output nodes). */
  outputs: string[];
  /** Execution order of code nodes (labels), for diagnostics. */
  nodeOrder: string[];
  /**
   * FlowType contract for the folded flow — inputs derived from the input
   * nodes' widgets, outputs from the producing ports. This is what makes a
   * folded flow publishable as a MODULE (a reusable typed block).
   */
  contract: BlockContract;
}

/** Derive the FlowType of an input node from its widget configuration. */
function inputNodeFlowType(node: FlowNodeLike): FlowType {
  const data = node.data as {
    dataType?: string;
    widgetType?: string;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    value?: unknown;
  };
  if (data.dataType === 'number') {
    return {
      kind: 'number',
      widget: data.widgetType === 'slider' ? 'slider' : 'input',
      min: data.min,
      max: data.max,
      step: data.step,
      default: typeof data.value === 'number' ? data.value : undefined,
    };
  }
  if (data.dataType === 'boolean') {
    return { kind: 'boolean', default: data.value === true ? true : undefined };
  }
  if (data.options && data.options.length) {
    return {
      kind: 'enum',
      options: data.options,
      default: typeof data.value === 'string' ? data.value : undefined,
    };
  }
  return { kind: 'string', default: typeof data.value === 'string' ? data.value : undefined };
}

const INPUT_TYPES = new Set([
  'input',
  'static_input',
  'number_input',
  'text_input',
  'boolean_input',
  'select_input',
]);
const OUTPUT_TYPES = new Set(['output', 'file_output', 'schematic_output']);

/**
 * Node types that are transparent in the data graph: an edge passing through
 * one behaves as a direct connection to the upstream producer. `viewer` is a
 * live preview; `reroute` is a wire-tidying dot; `inspect` is a value tap that
 * renders a small preview in the UI. All pass their single input straight to
 * their single output and compile away to nothing.
 */
const PASSTHROUGH_TYPES = new Set(['viewer', 'reroute', 'inspect']);

/**
 * Field descriptor shared by bundle (input fields → object) and unbundle
 * (object → output fields) meta-nodes. `name` becomes the object key / port id.
 */
interface MetaField {
  name: string;
  type?: FlowType;
}

/** Read a meta-node's configured fields, tolerating partially-formed data. */
function metaFields(node: FlowNodeLike): MetaField[] {
  const raw = (node.data as { bundleFields?: unknown; fields?: unknown }).bundleFields
    ?? (node.data as { fields?: unknown }).fields;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((f) =>
      typeof f === 'string'
        ? { name: f }
        : f && typeof f === 'object' && typeof (f as MetaField).name === 'string'
          ? { name: (f as MetaField).name, type: (f as MetaField).type }
          : null
    )
    .filter((f): f is MetaField => f !== null && f.name.length > 0)
    // Drop blank names (above) and duplicates: a duplicate bundle key would
    // silently overwrite (object literal last-wins) and a duplicate unbundle
    // output would emit two ports with the same handle id. First occurrence
    // wins, so editing a name to clash is a no-op until it's made unique.
    .filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
}

/**
 * How many `case` input ports a switch node exposes. Stored in
 * `data.caseCount` (defaults to 2). The handles are `case0`..`case{n-1}` plus a
 * fixed `selector` (number index) and optional `default`.
 */
function switchCaseCount(node: FlowNodeLike): number {
  const raw = (node.data as { caseCount?: unknown }).caseCount;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 2;
  return Math.max(1, n);
}

// NOTE: purely-visual node types ('frame', 'comment') are handled by omission —
// no filter or registry matches them, so they contribute no ports/edges/errors.

/** Derive the FlowType emitted by a constant node from its data. */
function constantNodeFlowType(node: FlowNodeLike): FlowType {
  const data = node.data as { dataType?: string; value?: unknown };
  if (data.dataType === 'number' || typeof data.value === 'number') {
    return { kind: 'number' };
  }
  if (data.dataType === 'boolean' || typeof data.value === 'boolean') {
    return { kind: 'boolean' };
  }
  if (data.dataType === 'vec3') return { kind: 'vec3' };
  if (data.dataType === 'block') return { kind: 'block' };
  return { kind: 'string' };
}

/** Stable FNV-1a hash over the execution-relevant parts of the flow. */
export function hashFlow(flow: FlowLike): string {
  flow = expandFormNodes(flow);
  const relevant = {
    nodes: [...flow.nodes]
      .map((n) => ({
        id: n.id,
        type: n.type,
        code: n.data.code ?? null,
        value: n.data.value ?? null,
        label: n.data.label ?? null,
        contract: n.data.contract ?? null,
        passthrough: n.data.passthrough ?? false,
        // bundle/unbundle field config changes the emitted object shape
        bundleFields: (n.data as { bundleFields?: unknown }).bundleFields ?? null,
        // group nodes: subgraph + boundary contract are execution-relevant
        group: isGroupNodeData(n.data)
          ? {
              subgraph: n.data.subgraph,
              groupInputs: n.data.groupInputs,
              groupOutputs: n.data.groupOutputs,
            }
          : null,
        // switch nodes: the case count changes the emitted ternary
        caseCount: n.type === 'switch' ? ((n.data as { caseCount?: unknown }).caseCount ?? null) : null,
        // map nodes: body subgraph + boundary contract are execution-relevant
        map: isMapNodeData(n.data)
          ? {
              subgraph: n.data.subgraph,
              bodyInputs: n.data.bodyInputs,
              bodyOutputs: n.data.bodyOutputs,
              resultPort: n.data.resultPort ?? null,
            }
          : null,
        // bundled assets are execution-relevant content
        asset: isAssetNodeData(n.data)
          ? { kind: n.data.assetKind, format: n.data.format, base64: n.data.base64 }
          : null,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    edges: [...flow.edges]
      .map((e) => `${e.source}:${e.sourceHandle ?? ''}>${e.target}:${e.targetHandle ?? ''}`)
      .sort(),
  };
  const text = JSON.stringify(relevant);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + '_' + text.length.toString(36);
}

function sanitizeId(id: string, used: Set<string>): string {
  let base = id.replace(/[^a-zA-Z0-9_$]/g, '_');
  if (/^[0-9]/.test(base)) base = '_' + base;
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}_${i++}`;
  used.add(name);
  return name;
}

function literal(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value) ?? 'null';
}

/**
 * Boundary-input bindings for a SUBGRAPH compile: each entry maps an internal
 * (nodeId, handle) crossing to the closure-parameter key it should read off
 * `inputs[...]`. Present only when compiling a group's nested subgraph.
 */
interface BoundaryInputBinding {
  /** internal node receiving the boundary value */
  internalNodeId: string;
  /** internal target handle (port) receiving it */
  internalHandle: string | null;
  /** closure-param key to read (`inputs[name]`) */
  name: string;
  /** carried FlowType, for the subgraph contract */
  type?: FlowType;
}

interface CompileOptions {
  /** When set, this graph is a group subgraph: boundary inputs read off params. */
  boundaryInputs?: BoundaryInputBinding[];
  /** Boundary outputs to return from the subgraph (instead of output-nodes). */
  boundaryOutputs?: BoundaryPort[];
  /**
   * TRACE MODE. When true, the generated `generate()` records a per-node trace
   * (`{ value, ms, status }` keyed by node id) and RETURNS `{ __outputs, __trace }`
   * instead of the bare outputs object. Used by the LIVE editor canvas so meta
   * nodes (switch/map/group/bundle/unbundle/constant/reroute/code) produce live
   * per-node previews + timing — the exact values compileFlow already computes.
   *
   * Non-trace mode is byte-for-byte unchanged (run-as-tool / headless / modules
   * read the bare outputs object). Trace is opt-in via {@link compileFlow}'s
   * second argument.
   *
   * NOTE: trace is applied only at the TOP level — nested group/map subgraph
   * closures are always compiled WITHOUT trace (their internal nodes' values
   * aren't surfaced on the outer canvas; the group/map node itself is traced as
   * a whole). This keeps the closure shape (`return generate`) intact.
   */
  trace?: boolean;
}

export interface CompileFlowOptions {
  /** Emit a per-node trace and return `{ __outputs, __trace }`. Default: false. */
  trace?: boolean;
}

/** One node's trace record, surfaced on `result.__trace[nodeId]`. */
export interface NodeTraceEntry {
  /** The value bound for this node (object for bundle/group, selected value for switch, etc.). */
  value: unknown;
  /** Wall-clock milliseconds spent producing the value (0 for baked literals). */
  ms: number;
  /** 'ok' when the binding produced a value; 'error' when it threw. */
  status: 'ok' | 'error';
  /** Error message when `status === 'error'`. */
  message?: string;
}

/** Shape of `result.result` when a flow is compiled with `{ trace: true }`. */
export interface TracedResult {
  __outputs: Record<string, unknown>;
  __trace: Record<string, NodeTraceEntry>;
}

export function compileFlow(flow: FlowLike, options?: CompileFlowOptions): CompiledFlow {
  flow = expandFormNodes(flow);
  return compileGraph(flow, { trace: options?.trace });
}

/**
 * Compile a nested subgraph into a self-contained async closure EXPRESSION:
 * `(function () { …block factories…; async function generate(inputs) { … };
 * return generate; })()`. Calling it with the boundary-input object runs the
 * subgraph inline in the SAME worker and returns the boundary outputs.
 *
 * Reuses the full {@link compileGraph} machinery (code/bundle/unbundle/nested
 * groups/switch/map, isolated block scopes) with the boundary bindings supplied,
 * so a group/map inside a group/map composes recursively. Both the Group node
 * and the Map BODY use this — they differ ONLY in which boundary port arrays
 * they pass (group: `groupInputs`/`groupOutputs`; map body: `bodyInputs`/
 * `bodyOutputs`), so the closure body is generated identically.
 */
function compileBoundaryClosure(
  subgraph: GroupNodeData['subgraph'],
  boundaryPorts: BoundaryPort[],
  boundaryOutputs: BoundaryPort[]
): string {
  const boundaryInputs: BoundaryInputBinding[] = boundaryPorts.map((p) => ({
    internalNodeId: p.internalNodeId,
    internalHandle: p.internalHandle,
    name: p.name,
    type: p.type,
  }));
  const compiled = compileGraph(
    { nodes: subgraph.nodes as FlowNodeLike[], edges: subgraph.edges },
    { boundaryInputs, boundaryOutputs }
  );
  // `compiled.source` is `<type decls>\n\n<body>`. The body always opens with
  // the fixed banner comment; slice from there so the closure carries only the
  // executable part (block factory consts + `generate`). Any TS type aliases
  // that remain are stripped by the OUTER fold's stripTypes pass.
  const banner = '// Folded flow';
  const idx = compiled.source.indexOf(banner);
  const body = idx >= 0 ? compiled.source.slice(idx) : compiled.source;
  return `function () {\n${body}\nreturn generate;\n}()`;
}

/** Group node: inline its `groupInputs`/`groupOutputs` boundary subgraph. */
function compileSubgraphClosure(data: GroupNodeData): string {
  return compileBoundaryClosure(data.subgraph, data.groupInputs, data.groupOutputs);
}

/**
 * Map node BODY: inline its `bodyInputs`/`bodyOutputs` boundary subgraph. The
 * closure takes the per-element boundary object — `{ item, index }` (only the
 * body inputs that exist) — and the Map node calls it once per list element via
 * `Promise.all(list.map(...))`.
 */
function compileMapBodyClosure(data: MapNodeData): string {
  return compileBoundaryClosure(data.subgraph, data.bodyInputs, data.bodyOutputs);
}

function compileGraph(flow: FlowLike, options: CompileOptions): CompiledFlow {
  // TRACE MODE applies only at the top level (subgraph closures are compiled
  // without it — see CompileOptions.trace). A subgraph compile is identified by
  // the presence of boundary bindings.
  const trace = !!options.trace && !options.boundaryInputs && !options.boundaryOutputs;
  const boundaryByTarget = new Map<string, BoundaryInputBinding>();
  for (const b of options.boundaryInputs ?? []) {
    boundaryByTarget.set(`${b.internalNodeId}::${b.internalHandle ?? ''}`, b);
  }
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const codeNodes = flow.nodes.filter((n) => n.type === 'code');
  const inputNodes = flow.nodes.filter((n) => INPUT_TYPES.has(n.type));
  const assetNodes = flow.nodes.filter((n) => n.type === 'asset' && isAssetNodeData(n.data));
  const outputNodes = flow.nodes.filter((n) => OUTPUT_TYPES.has(n.type));
  const constantNodes = flow.nodes.filter((n) => n.type === 'constant');
  // Bundle/unbundle are value transformers: they participate in execution order
  // (a bundle can read a code node's result; a code node can read an unbundled
  // field) and each binds one `const` inside generate().
  const bundleNodes = flow.nodes.filter((n) => n.type === 'bundle');
  const unbundleNodes = flow.nodes.filter((n) => n.type === 'unbundle');
  // Group nodes embed a nested subgraph; each binds one `const` (the awaited
  // result object of the inlined subgraph closure) inside generate().
  const groupNodes = flow.nodes.filter((n) => n.type === 'group' && isGroupNodeData(n.data));
  // Switch nodes are value transformers: a `selector` index picks one of N case
  // inputs (or a `default`). Each binds one `const` inside generate().
  const switchNodes = flow.nodes.filter((n) => n.type === 'switch');
  // Map nodes embed a BODY subgraph (like group) and iterate it over a `list`
  // input, binding one awaited `const` (the mapped list) inside generate().
  const mapNodes = flow.nodes.filter((n) => n.type === 'map' && isMapNodeData(n.data));
  // Viewers AND reroutes are transparent: edges through them resolve to the
  // upstream producer (see resolveThroughViewers).
  const viewerNodes = new Set(
    flow.nodes.filter((n) => PASSTHROUGH_TYPES.has(n.type)).map((n) => n.id)
  );

  const isSubgraph = !!options.boundaryInputs || !!options.boundaryOutputs;
  // A top-level flow must have code; a group subgraph may legitimately wrap only
  // transformer/meta nodes (e.g. a lone bundle) and still be compilable.
  if (
    codeNodes.length === 0 &&
    !isSubgraph &&
    bundleNodes.length === 0 &&
    unbundleNodes.length === 0 &&
    groupNodes.length === 0 &&
    switchNodes.length === 0 &&
    mapNodes.length === 0
  ) {
    throw new FlowCompileError('Flow has no code nodes');
  }
  for (const node of codeNodes) {
    if (!node.data.code) {
      throw new FlowCompileError(`Code node "${node.data.label || node.id}" has no source`);
    }
    if (!node.data.contract) {
      throw new FlowCompileError(
        `Code node "${node.data.label || node.id}" has no contract — open it in the editor once to parse it`
      );
    }
  }

  // ── topological order over code + meta nodes (viewers are pass-through) ──
  // Code, bundle and unbundle nodes are all "evaluated" in dependency order:
  // each is bound to a local inside generate(), so an edge between any two of
  // them imposes an ordering constraint.
  const orderNodes = [...codeNodes, ...bundleNodes, ...unbundleNodes, ...groupNodes, ...switchNodes, ...mapNodes];
  const indegree = new Map<string, number>(orderNodes.map((n) => [n.id, 0]));
  const downstream = new Map<string, string[]>();
  const resolveThroughViewers = (
    sourceId: string,
    sourceHandle?: string | null
  ): { node: string; handle: string | null | undefined } | null => {
    // Walk upward through passthrough viewers/reroutes/inspects to the real
    // producing node, carrying the handle of the edge that ACTUALLY produced the
    // value — a passthrough's single `output` handle is NOT the upstream's output
    // name (e.g. a reroute fed by asm.bytes must resolve to (asm, 'bytes')).
    let current = sourceId;
    let handle: string | null | undefined = sourceHandle;
    for (let i = 0; i < 32 && viewerNodes.has(current); i++) {
      const incoming = flow.edges.find((e) => e.target === current);
      if (!incoming) return null;
      current = incoming.source;
      handle = incoming.sourceHandle;
    }
    return viewerNodes.has(current) ? null : { node: current, handle };
  };

  for (const edge of flow.edges) {
    if (!indegree.has(edge.target)) continue;
    const realSource = resolveThroughViewers(edge.source)?.node ?? null;
    if (realSource && indegree.has(realSource)) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
      downstream.set(realSource, [...(downstream.get(realSource) ?? []), edge.target]);
    }
  }
  const queue = orderNodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of downstream.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== orderNodes.length) {
    throw new FlowCompileError('Flow contains a cycle between nodes');
  }

  // ── name registry ────────────────────────────────────────────────────────
  const used = new Set<string>();
  const blockVar = new Map<string, string>(); // node id → factory const
  const resultVar = new Map<string, string>(); // node id → result const
  for (const node of codeNodes) {
    blockVar.set(node.id, `__block_${sanitizeId(node.id, used)}`);
    resultVar.set(node.id, `__r_${sanitizeId(node.id, used)}`);
  }
  const bundleVar = new Map<string, string>(); // bundle node id → object const
  for (const node of bundleNodes) {
    bundleVar.set(node.id, `__bundle_${sanitizeId(node.id, used)}`);
  }
  const unbundleVar = new Map<string, string>(); // unbundle node id → input-object const
  for (const node of unbundleNodes) {
    unbundleVar.set(node.id, `__unbundle_${sanitizeId(node.id, used)}`);
  }
  const groupVar = new Map<string, string>(); // group node id → awaited subgraph-result const
  for (const node of groupNodes) {
    groupVar.set(node.id, `__group_${sanitizeId(node.id, used)}`);
  }
  const switchVar = new Map<string, string>(); // switch node id → selected-value const
  for (const node of switchNodes) {
    switchVar.set(node.id, `__sw_${sanitizeId(node.id, used)}`);
  }
  const mapVar = new Map<string, string>(); // map node id → awaited mapped-list const
  for (const node of mapNodes) {
    mapVar.set(node.id, `__map_${sanitizeId(node.id, used)}`);
  }
  const assetVar = new Map<string, string>(); // asset node id → baked const
  for (const node of assetNodes) {
    assetVar.set(node.id, `__asset_${sanitizeId(node.id, used)}`);
  }
  const constantVar = new Map<string, string>(); // constant node id → baked const
  for (const node of constantNodes) {
    constantVar.set(node.id, `__const_${sanitizeId(node.id, used)}`);
  }
  const inputVar = new Map<string, string>(); // input node id → local var
  const flowInputs: Record<string, unknown> = {};
  const usedInputNames = new Set<string>();
  for (const node of inputNodes) {
    let name = node.data.label || node.id;
    let i = 2;
    while (usedInputNames.has(name)) name = `${node.data.label || node.id}_${i++}`;
    usedInputNames.add(name);
    inputVar.set(node.id, `__in_${sanitizeId(node.id, used)}`);
    flowInputs[name] = node.data.value;
    (node as FlowNodeLike & { __flowInputName?: string }).__flowInputName = name;
  }

  /**
   * The `{kind:'object'}` FlowType produced by a bundle node. Each field's type
   * is inferred from its connected source when present, else falls back to the
   * field's configured type, else `unknown`.
   */
  const bundleObjectType = (node: FlowNodeLike): FlowType => {
    const fields: Record<string, FlowType> = {};
    for (const field of metaFields(node)) {
      const edge = flow.edges.find(
        (e) => e.target === node.id && (e.targetHandle ?? '') === field.name
      );
      fields[field.name] = edge
        ? sourceType(edge.source, edge.sourceHandle)
        : field.type ?? { kind: 'unknown' };
    }
    return { kind: 'object', fields };
  };

  /** FlowType of the object flowing INTO an unbundle node (if resolvable). */
  const unbundleInputType = (node: FlowNodeLike): FlowType => {
    const edge = flow.edges.find((e) => e.target === node.id);
    return edge ? sourceType(edge.source, edge.sourceHandle) : { kind: 'unknown' };
  };

  /** FlowType of the value flowing out of `sourceId.sourceHandle`. */
  const sourceType = (sourceId: string, rawHandle: string | null | undefined): FlowType => {
    const resolved = resolveThroughViewers(sourceId, rawHandle);
    const real = resolved?.node;
    const sourceHandle = resolved?.handle;
    const node = real ? nodes.get(real) : undefined;
    if (!node) return { kind: 'unknown' };
    if (INPUT_TYPES.has(node.type)) return inputNodeFlowType(node);
    if (node.type === 'constant') return constantNodeFlowType(node);
    if (node.type === 'bundle') return bundleObjectType(node);
    if (node.type === 'unbundle') {
      const objType = unbundleInputType(node);
      if (objType.kind === 'object' && sourceHandle && objType.fields[sourceHandle]) {
        return objType.fields[sourceHandle];
      }
      return { kind: 'unknown' };
    }
    if (node.type === 'group' && isGroupNodeData(node.data)) {
      const out = node.data.groupOutputs.find((p) => p.name === sourceHandle);
      return out?.type ?? { kind: 'unknown' };
    }
    if (node.type === 'switch') {
      // Union of case types: if every connected case shares one kind, use it;
      // otherwise fall back to unknown (the value is still selected at runtime).
      const caseTypes: FlowType[] = [];
      const count = switchCaseCount(node);
      for (let i = 0; i < count; i++) {
        const edge = flow.edges.find(
          (e) => e.target === node.id && (e.targetHandle ?? '') === `case${i}`
        );
        if (edge) caseTypes.push(sourceType(edge.source, edge.sourceHandle));
      }
      const def = flow.edges.find(
        (e) => e.target === node.id && (e.targetHandle ?? '') === 'default'
      );
      if (def) caseTypes.push(sourceType(def.source, def.sourceHandle));
      const kinds = new Set(caseTypes.map((t) => t.kind));
      return kinds.size === 1 ? caseTypes[0] : { kind: 'unknown' };
    }
    if (node.type === 'map' && isMapNodeData(node.data)) {
      const resultPort = node.data.resultPort ?? 'result';
      const out = node.data.bodyOutputs.find((p) => p.name === resultPort) ?? node.data.bodyOutputs[0];
      return { kind: 'list', of: out?.type ?? { kind: 'unknown' } };
    }
    if (node.type === 'asset' && isAssetNodeData(node.data)) {
      return node.data.assetKind === 'image'
        ? { kind: 'image' }
        : node.data.assetKind === 'schematic'
          ? { kind: 'schematic' }
          : { kind: 'unknown' };
    }
    if (node.type === 'code') {
      const outputs = node.data.contract!.outputs;
      const keys = Object.keys(outputs);
      const key = sourceHandle && keys.includes(sourceHandle) ? sourceHandle : keys.length === 1 ? keys[0] : sourceHandle;
      return (key && outputs[key]) || { kind: 'unknown' };
    }
    return { kind: 'unknown' };
  };

  /** Expression that yields the value flowing out of `sourceId.sourceHandle`. */
  const sourceExpression = (sourceId: string, rawHandle: string | null | undefined): string => {
    const resolved = resolveThroughViewers(sourceId, rawHandle);
    if (!resolved) throw new FlowCompileError(`Viewer chain from "${sourceId}" has no producer`);
    const real = resolved.node;
    const sourceHandle = resolved.handle;
    const node = nodes.get(real);
    if (!node) throw new FlowCompileError(`Edge references unknown node "${real}"`);

    if (INPUT_TYPES.has(node.type)) {
      return inputVar.get(real)!;
    }
    if (node.type === 'constant') {
      return constantVar.get(real)!;
    }
    if (node.type === 'bundle') {
      return bundleVar.get(real)!;
    }
    if (node.type === 'unbundle') {
      const field = sourceHandle;
      if (!field) {
        throw new FlowCompileError(
          `Edge from unbundle "${node.data.label || real}" needs a field handle`
        );
      }
      // Safe property access via bracket + JSON-quoted key (handles any name).
      return `${unbundleVar.get(real)!}?.[${literal(field)}]`;
    }
    if (node.type === 'group' && isGroupNodeData(node.data)) {
      const out = node.data.groupOutputs.find((p) => p.name === sourceHandle);
      if (!out) {
        throw new FlowCompileError(
          `Edge from group "${node.data.label || real}" needs a known output handle`
        );
      }
      return `${groupVar.get(real)!}?.[${literal(out.name)}]`;
    }
    if (node.type === 'switch') {
      // The switch binds the already-selected value; the single output reads it.
      return switchVar.get(real)!;
    }
    if (node.type === 'map' && isMapNodeData(node.data)) {
      // The map binds the awaited mapped list; the single output reads it.
      return mapVar.get(real)!;
    }
    if (node.type === 'asset') {
      const name = assetVar.get(real);
      if (!name) throw new FlowCompileError(`Asset node "${node.data.label || real}" has no data`);
      return name;
    }
    if (node.type === 'code') {
      const contract = node.data.contract!;
      const outputs = Object.keys(contract.outputs);
      let key = sourceHandle ?? undefined;
      if (!key || !outputs.includes(key)) {
        if (outputs.length === 1) key = outputs[0];
        else if (key && outputs.includes(key)) {
          /* keep */
        } else {
          throw new FlowCompileError(
            `Edge from "${node.data.label || real}" needs a source handle (outputs: ${outputs.join(', ')})`
          );
        }
      }
      return `${resultVar.get(real)!}[${literal(key)}]`;
    }
    throw new FlowCompileError(`Unsupported source node type "${node.type}"`);
  };

  /**
   * Boundary-input expression: when compiling a group subgraph, an internal
   * node's input handle may be fed from OUTSIDE the group. Such crossings have
   * no edge inside the subgraph; instead they read off the closure's params:
   * `inputs[<boundary name>]`. Returns null when there is no boundary binding.
   */
  const boundaryExprFor = (nodeId: string, handle: string | null | undefined): string | null => {
    const b = boundaryByTarget.get(`${nodeId}::${handle ?? ''}`);
    return b ? `inputs[${literal(b.name)}]` : null;
  };

  // ── trace helpers ──────────────────────────────────────────────────────────
  // In trace mode every value-producing binding is wrapped so it records
  // `{ value, ms, status }` into `__trace` keyed by the node id, inside a
  // try/catch so a failing node records `status:'error'` and binds `undefined`
  // (downstream continues — best-effort live preview) instead of aborting.
  //
  // `traceBind` emits the binding line(s). When trace is off it emits the
  // original `const <var> = <expr>;` unchanged (back-compat / subgraphs).
  //   - awaited: prefix the expr with `await` (group/map/code).
  //   - The recorded value is the bound value itself.
  const traceBind = (
    nodeId: string,
    varName: string,
    expr: string,
    awaited: boolean
  ): void => {
    if (!trace) {
      lines.push(`  const ${varName} = ${awaited ? 'await ' : ''}${expr};`);
      return;
    }
    // Bind via a traced thunk: time it, store value, swallow+record errors.
    // `__trace_run` is async, so the binding is ALWAYS awaited — awaiting a
    // non-promise yields the value, so sync exprs (bundle/switch/unbundle) are
    // unaffected. The thunk is `async` so it can hold awaited (group/map/code)
    // exprs uniformly.
    lines.push(`  const ${varName} = await __trace_run(${literal(nodeId)}, async () => (${expr}));`);
  };
  // Record a cheap, already-evaluated value (constants/assets/inputs) with ms:0.
  const traceLiteral = (nodeId: string, valueExpr: string): void => {
    if (!trace) return;
    lines.push(`  __trace[${literal(nodeId)}] = { value: ${valueExpr}, ms: 0, status: 'ok' };`);
  };

  // ── emit ──────────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('// Folded flow — compiled from the node graph. Each block keeps its own');
  lines.push('// scope via an IIFE; edges are plain variables (no serialization).');
  lines.push('');

  // ── bundled assets, baked as self-contained literals ────────────────────
  if (assetNodes.length) {
    lines.push(BASE64_DECODER_SOURCE);
    lines.push('');
    for (const node of assetNodes) {
      const asset = node.data as unknown as AssetNodeData;
      lines.push(`// ── asset: ${node.data.label || asset.name || node.id} ──`);
      if (asset.assetKind === 'image') {
        lines.push(
          `const ${assetVar.get(node.id)} = (function () { const b = __b64(${literal(asset.base64)}); return { width: ${literal(asset.width)}, height: ${literal(asset.height)}, data: new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength) }; })();`
        );
      } else if (asset.assetKind === 'schematic') {
        // Rehydrate to a live wrapper using the ambient Schematic class —
        // baked consts never pass through processInputSchematics.
        lines.push(
          `const ${assetVar.get(node.id)} = (function () { const s = new Schematic(); s.from_data(__b64(${literal(asset.base64)})); return s; })();`
        );
      } else {
        lines.push(
          `const ${assetVar.get(node.id)} = { format: ${literal(asset.format)}, data: __b64(${literal(asset.base64)}), metadata: { name: ${literal(asset.name ?? node.data.label ?? 'asset')} } };`
        );
      }
      lines.push('');
    }
  }

  // ── constant nodes, baked as plain literals ─────────────────────────────
  if (constantNodes.length) {
    for (const node of constantNodes) {
      lines.push(
        `const ${constantVar.get(node.id)} = ${literal(node.data.value)}; // const: ${node.data.label || node.id}`
      );
    }
    lines.push('');
  }

  for (const id of order) {
    const node = nodes.get(id)!;
    // Bundle/unbundle nodes have no block source — they emit inline inside
    // generate() (below), not as a factory IIFE.
    if (node.type !== 'code') continue;
    const stripped = stripTypes(node.data.code!).trim();
    if (/^\s*(import|export)\s/m.test(stripped)) {
      throw new FlowCompileError(
        `Block "${node.data.label || id}" contains import/export statements`
      );
    }
    lines.push(`// ── block: ${node.data.label || id} ──`);
    lines.push(`const ${blockVar.get(id)} = (function () {`);
    lines.push(stripped);
    lines.push('return generate;');
    lines.push('})();');
    lines.push('');
  }

  lines.push('async function generate(inputs) {');

  if (trace) {
    // Per-node trace store + timed/guarded thunk runner. `performance.now` may
    // be absent in some compartments — fall back to Date.now.
    lines.push('  const __trace = {};');
    // Timing source. SES/secure compartments TAME both Date.now and
    // performance.now (calling them throws), so `ms` would degrade to 0 there.
    // The HOST endows a read-only `__hostNow()` clock as a compartment global
    // (see providers/standard.ts) — prefer it so `ms` is REAL under SES. When
    // it is absent (e.g. minimal/bare contexts) probe performance/Date and
    // ultimately fall back to 0; trace stays correct, only `ms` degrades.
    lines.push('  const __now = (function () {');
    lines.push('    try { if (typeof __hostNow === "function") { __hostNow(); return () => { try { return __hostNow(); } catch (e) { return 0; } }; } } catch (e) {}');
    lines.push('    try { if (typeof performance !== "undefined" && performance.now) { performance.now(); return () => { try { return performance.now(); } catch (e) { return 0; } }; } } catch (e) {}');
    lines.push('    try { Date.now(); return () => { try { return Date.now(); } catch (e) { return 0; } }; } catch (e) {}');
    lines.push('    return () => 0;');
    lines.push('  })();');
    lines.push('  const __trace_run = async (__id, __thunk) => {');
    lines.push('    const __t0 = __now();');
    lines.push('    try {');
    lines.push('      const __v = await __thunk();');
    lines.push('      __trace[__id] = { value: __v, ms: __now() - __t0, status: "ok" };');
    lines.push('      return __v;');
    lines.push('    } catch (__e) {');
    lines.push('      __trace[__id] = { value: undefined, ms: __now() - __t0, status: "error", message: (__e && __e.message) ? String(__e.message) : String(__e) };');
    lines.push('      return undefined;');
    lines.push('    }');
    lines.push('  };');
    lines.push('');
  }

  for (const node of inputNodes) {
    const name = (node as FlowNodeLike & { __flowInputName?: string }).__flowInputName!;
    lines.push(
      `  const ${inputVar.get(node.id)} = inputs[${literal(name)}] !== undefined ? inputs[${literal(name)}] : ${literal(node.data.value)};`
    );
    traceLiteral(node.id, inputVar.get(node.id)!);
  }
  // Constants and bundled assets are baked OUTSIDE generate() but are in scope
  // here; record their (cheap) values into the trace so the canvas shows them.
  for (const node of constantNodes) traceLiteral(node.id, constantVar.get(node.id)!);
  for (const node of assetNodes) traceLiteral(node.id, assetVar.get(node.id)!);
  lines.push('');

  const codeOrderCount = order.filter((id) => nodes.get(id)!.type === 'code').length;
  let codeIndex = 0;
  order.forEach((id) => {
    const node = nodes.get(id)!;

    // ── bundle: pack connected inputs into one object literal ──────────────
    if (node.type === 'bundle') {
      const entries: string[] = [];
      for (const field of metaFields(node)) {
        const edge = flow.edges.find(
          (e) => e.target === id && (e.targetHandle ?? '') === field.name
        );
        const boundary = boundaryExprFor(id, field.name);
        // Unconnected fields are omitted (caller reads them as undefined).
        if (edge) {
          entries.push(`${literal(field.name)}: ${sourceExpression(edge.source, edge.sourceHandle)}`);
        } else if (boundary) {
          entries.push(`${literal(field.name)}: ${boundary}`);
        }
      }
      lines.push(`  // bundle: ${node.data.label || id}`);
      traceBind(id, bundleVar.get(id)!, `{ ${entries.join(', ')} }`, false);
      lines.push('');
      return;
    }

    // ── unbundle: bind the incoming object so fields can be plucked off it ──
    if (node.type === 'unbundle') {
      const edge = flow.edges.find((e) => e.target === id);
      const boundary = boundaryExprFor(id, edge?.targetHandle ?? 'input');
      const expr = edge
        ? sourceExpression(edge.source, edge.sourceHandle)
        : boundary ?? '{}';
      lines.push(`  // unbundle: ${node.data.label || id}`);
      traceBind(id, unbundleVar.get(id)!, expr, false);
      lines.push('');
      return;
    }

    // ── group: inline the nested subgraph as an awaited async closure ──────
    if (node.type === 'group' && isGroupNodeData(node.data)) {
      const gdata = node.data as GroupNodeData;
      const closure = compileSubgraphClosure(gdata);
      // Build the boundary-input argument object from outer edges/bindings.
      const argEntries: string[] = [];
      for (const port of gdata.groupInputs) {
        const edge = flow.edges.find(
          (e) => e.target === id && (e.targetHandle ?? '') === port.name
        );
        if (edge) {
          argEntries.push(`${literal(port.name)}: ${sourceExpression(edge.source, edge.sourceHandle)}`);
        } else {
          const boundary = boundaryExprFor(id, port.name);
          if (boundary) argEntries.push(`${literal(port.name)}: ${boundary}`);
        }
      }
      lines.push(`  // group: ${node.data.label || id}`);
      traceBind(id, groupVar.get(id)!, `(${closure})({ ${argEntries.join(', ')} })`, true);
      lines.push('');
      return;
    }

    // ── switch: select one of N case inputs by a `selector` index ───────────
    // EAGER-EVAL SEMANTICS: every upstream branch is already computed (this is a
    // pure dataflow graph — all producers run regardless of selection). The
    // switch is a pure SELECTOR over those already-bound expressions, emitted as
    // a chained ternary `(sel === 0 ? <case0> : sel === 1 ? <case1> : <default>)`.
    if (node.type === 'switch') {
      const exprFor = (handle: string): string | null => {
        const edge = flow.edges.find(
          (e) => e.target === id && (e.targetHandle ?? '') === handle
        );
        if (edge) return sourceExpression(edge.source, edge.sourceHandle);
        const boundary = boundaryExprFor(id, handle);
        return boundary ?? null;
      };
      const selExpr = exprFor('selector') ?? '0';
      const defaultExpr = exprFor('default') ?? 'undefined';
      const count = switchCaseCount(node);
      let ternary = defaultExpr;
      // Build from the last case backwards so case0 is the outermost test.
      for (let i = count - 1; i >= 0; i--) {
        const caseExpr = exprFor(`case${i}`) ?? 'undefined';
        ternary = `(__sel === ${i} ? ${caseExpr} : ${ternary})`;
      }
      lines.push(`  // switch: ${node.data.label || id}`);
      traceBind(
        id,
        switchVar.get(id)!,
        `(function () {\n    const __sel = ${selExpr};\n    return ${ternary};\n  })()`,
        false
      );
      lines.push('');
      return;
    }

    // ── map: iterate the BODY subgraph over a `list` input ──────────────────
    // Compiles the body via the SAME compileGraph/boundary machinery as a group
    // (see compileMapBodyClosure), then runs it per element:
    //   const __map = await Promise.all((<list> ?? []).map(async (item, index) =>
    //     (await body({ item, index }))[resultPort]));
    if (node.type === 'map' && isMapNodeData(node.data)) {
      const mdata = node.data as MapNodeData;
      const closure = compileMapBodyClosure(mdata);
      const listEdge = flow.edges.find(
        (e) => e.target === id && (e.targetHandle ?? '') === 'list'
      );
      const listExpr = listEdge
        ? sourceExpression(listEdge.source, listEdge.sourceHandle)
        : boundaryExprFor(id, 'list') ?? '[]';
      // Which boundary params the body actually declares (item / index / …).
      const hasItem = mdata.bodyInputs.some((p) => p.name === 'item');
      const hasIndex = mdata.bodyInputs.some((p) => p.name === 'index');
      const argParts: string[] = [];
      if (hasItem) argParts.push('item: __item');
      if (hasIndex) argParts.push('index: __index');
      const resultPort = mdata.resultPort ?? 'result';
      lines.push(`  // map: ${node.data.label || id}`);
      const mapExpr =
        `Promise.all(((${listExpr}) ?? []).map(async (__item, __index) => {\n` +
        `    const __res = await (${closure})({ ${argParts.join(', ')} });\n` +
        `    return __res?.[${literal(resultPort)}];\n` +
        `  }))`;
      traceBind(id, mapVar.get(id)!, mapExpr, true);
      lines.push('');
      return;
    }

    // ── code node ──────────────────────────────────────────────────────────
    const contract = node.data.contract!;
    const incoming = flow.edges.filter((e) => e.target === id);

    // The value expression feeding each input, keyed by input name. The order
    // of `contract.inputs` is the declared input order — which is exactly the
    // positional-parameter order for a positional `generate(a, b, c)` block.
    const valueExprFor = (inputName: string, inputType: FlowType): string => {
      const edge = incoming.find((e) => (e.targetHandle ?? 'default') === inputName);
      const boundary = boundaryExprFor(id, inputName);
      if (edge) return sourceExpression(edge.source, edge.sourceHandle);
      // Fed across the group boundary — read off the closure params.
      if (boundary) return boundary;
      return literal(defaultValueForType(inputType));
    };
    const inputEntries = Object.entries(contract.inputs) as [string, FlowType][];

    // Both execution paths must AGREE on how `generate` is invoked. The per-node
    // runner (`compileBlock`/`buildBody`) spreads positional params in declared
    // order and passes the object form a single arg. Mirror that here so a block
    // authored with positional params (`function generate(a, b, c)`) is folded
    // correctly for headless / module / distributed-worker execution instead of
    // receiving the whole inputs object as its first parameter.
    const positional = node.data.code ? positionalInputNames(node.data.code) : null;
    let callArgs: string;
    if (positional) {
      // Spread by declared parameter order; unknown params (not in the contract)
      // fall through as `undefined`, matching the per-node runner's lookup.
      const byName = new Map(inputEntries.map(([n, t]) => [n, valueExprFor(n, t)]));
      callArgs = positional
        .map((name) => byName.get(name) ?? 'undefined')
        .join(', ');
    } else {
      callArgs = `{ ${inputEntries
        .map(([name, type]) => `${literal(name)}: ${valueExprFor(name, type)}`)
        .join(', ')} }`;
    }

    lines.push(`  // node: ${node.data.label || id}`);
    lines.push(
      `  Progress.report(${Math.round((codeIndex / Math.max(codeOrderCount, 1)) * 100)}, ${literal(node.data.label || id)});`
    );
    traceBind(id, resultVar.get(id)!, `${blockVar.get(id)}(${callArgs})`, true);
    lines.push('');
    codeIndex++;
  });

  const outputs: string[] = [];
  const outputEntries: string[] = [];
  const usedOutputNames = new Set<string>();

  // ── group subgraph: return the boundary outputs (by internal endpoint) ──
  if (options.boundaryOutputs) {
    for (const port of options.boundaryOutputs) {
      outputs.push(port.name);
      // resolveThroughViewers handles reroutes/viewers; sourceExpression covers
      // code/bundle/unbundle/group/constant/asset/input internal producers.
      outputEntries.push(
        `${literal(port.name)}: ${sourceExpression(port.internalNodeId, port.internalHandle)}`
      );
    }
    const subContract: BlockContract = { inputs: {}, outputs: {} };
    for (const b of options.boundaryInputs ?? []) {
      subContract.inputs[b.name] = b.type ?? { kind: 'unknown' };
    }
    for (const port of options.boundaryOutputs) {
      subContract.outputs[port.name] =
        port.type ?? sourceType(port.internalNodeId, port.internalHandle);
    }
    lines.push('  Progress.report(100, "done");');
    lines.push(`  return { ${outputEntries.join(', ')} };`);
    lines.push('}');
    return {
      source: `${contractToTypeScript(subContract)}\n\n${lines.join('\n')}`,
      hash: hashFlow(flow),
      inputs: {},
      outputs,
      nodeOrder: order.map((id) => nodes.get(id)!.data.label || id),
      contract: subContract,
    };
  }

  for (const node of outputNodes) {
    const edge = flow.edges.find((e) => e.target === node.id);
    if (!edge) continue;
    let name = node.data.label || 'output';
    let i = 2;
    while (usedOutputNames.has(name)) name = `${node.data.label || 'output'}_${i++}`;
    usedOutputNames.add(name);
    outputs.push(name);
    outputEntries.push(`${literal(name)}: ${sourceExpression(edge.source, edge.sourceHandle)}`);
  }
  if (outputEntries.length === 0) {
    // No output nodes: expose the terminal code nodes' full results.
    const terminals = order.filter(
      (id) => nodes.get(id)!.type === 'code' && !(downstream.get(id) ?? []).length
    );
    for (const id of terminals) {
      const node = nodes.get(id)!;
      for (const key of Object.keys(node.data.contract!.outputs)) {
        let name = key;
        let i = 2;
        while (usedOutputNames.has(name)) name = `${key}_${i++}`;
        usedOutputNames.add(name);
        outputs.push(name);
        outputEntries.push(`${literal(name)}: ${resultVar.get(id)!}[${literal(key)}]`);
      }
    }
  }

  lines.push('  Progress.report(100, "done");');
  if (trace) {
    // Trace pass-through nodes (viewer/reroute/inspect) and output nodes as the
    // resolved upstream value — cheap, lets the canvas preview them live. Each is
    // guarded so a broken wire records an error rather than aborting the return.
    for (const node of flow.nodes) {
      if (!PASSTHROUGH_TYPES.has(node.type)) continue;
      const incoming = flow.edges.find((e) => e.target === node.id);
      if (!incoming) continue;
      let expr: string;
      try {
        expr = sourceExpression(incoming.source, incoming.sourceHandle);
      } catch {
        continue;
      }
      lines.push(
        `  try { __trace[${literal(node.id)}] = { value: ${expr}, ms: 0, status: 'ok' }; } catch (__e) { __trace[${literal(node.id)}] = { value: undefined, ms: 0, status: 'error', message: String(__e && __e.message || __e) }; }`
      );
    }
    for (const node of outputNodes) {
      const edge = flow.edges.find((e) => e.target === node.id);
      if (!edge) continue;
      let expr: string;
      try {
        expr = sourceExpression(edge.source, edge.sourceHandle);
      } catch {
        continue;
      }
      lines.push(
        `  try { __trace[${literal(node.id)}] = { value: ${expr}, ms: 0, status: 'ok' }; } catch (__e) { __trace[${literal(node.id)}] = { value: undefined, ms: 0, status: 'error', message: String(__e && __e.message || __e) }; }`
      );
    }
    lines.push(`  return { __outputs: { ${outputEntries.join(', ')} }, __trace };`);
  } else {
    lines.push(`  return { ${outputEntries.join(', ')} };`);
  }
  lines.push('}');

  // ── contract for the folded flow (publishable as a module) ──────────────
  const contract: BlockContract = { inputs: {}, outputs: {} };
  for (const node of inputNodes) {
    const name = (node as FlowNodeLike & { __flowInputName?: string }).__flowInputName!;
    contract.inputs[name] = inputNodeFlowType(node);
  }
  for (const node of outputNodes) {
    const edge = flow.edges.find((e) => e.target === node.id);
    if (!edge) continue;
    const name = outputs.find(
      (n) => n === (node.data.label || 'output') || n.startsWith(`${node.data.label || 'output'}_`)
    );
    if (name) contract.outputs[name] = sourceType(edge.source, edge.sourceHandle);
  }
  if (Object.keys(contract.outputs).length === 0) {
    const terminals = order.filter(
      (id) => nodes.get(id)!.type === 'code' && !(downstream.get(id) ?? []).length
    );
    for (const id of terminals) {
      const node = nodes.get(id)!;
      for (const [key, type] of Object.entries(node.data.contract!.outputs)) {
        if (outputs.includes(key)) contract.outputs[key] = type;
      }
    }
  }

  return {
    // Type declarations first: the folded source is a canonical v2 block, so
    // the parser (and therefore module insertion / the workbench) can derive
    // the full contract — widgets, defaults and all — from the code alone.
    source: `${contractToTypeScript(contract)}\n\n${lines.join('\n')}`,
    hash: hashFlow(flow),
    inputs: flowInputs,
    outputs,
    nodeOrder: order.map((id) => nodes.get(id)!.data.label || id),
    contract,
  };
}
