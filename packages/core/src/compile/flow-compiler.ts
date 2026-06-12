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

import { stripTypes } from './index.js';
import type { BlockContract, FlowType } from '../types/flow-type.js';
import { defaultValueForType } from '../types/flow-type.js';
import { BASE64_DECODER_SOURCE } from '../utils/base64.js';
import { isAssetNodeData, type AssetNodeData } from '../utils/assets.js';

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

/** Stable FNV-1a hash over the execution-relevant parts of the flow. */
export function hashFlow(flow: FlowLike): string {
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

export function compileFlow(flow: FlowLike): CompiledFlow {
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const codeNodes = flow.nodes.filter((n) => n.type === 'code');
  const inputNodes = flow.nodes.filter((n) => INPUT_TYPES.has(n.type));
  const assetNodes = flow.nodes.filter((n) => n.type === 'asset' && isAssetNodeData(n.data));
  const outputNodes = flow.nodes.filter((n) => OUTPUT_TYPES.has(n.type));
  const viewerNodes = new Set(
    flow.nodes.filter((n) => n.type === 'viewer').map((n) => n.id)
  );

  if (codeNodes.length === 0) {
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

  // ── topological order over code nodes (viewers are pass-through) ────────
  const indegree = new Map<string, number>(codeNodes.map((n) => [n.id, 0]));
  const downstream = new Map<string, string[]>();
  const resolveThroughViewers = (sourceId: string): string | null => {
    // Walk upward through passthrough viewers to the real producing node.
    let current = sourceId;
    for (let i = 0; i < 32 && viewerNodes.has(current); i++) {
      const incoming = flow.edges.find((e) => e.target === current);
      if (!incoming) return null;
      current = incoming.source;
    }
    return viewerNodes.has(current) ? null : current;
  };

  for (const edge of flow.edges) {
    if (!indegree.has(edge.target)) continue;
    const realSource = resolveThroughViewers(edge.source);
    if (realSource && indegree.has(realSource)) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
      downstream.set(realSource, [...(downstream.get(realSource) ?? []), edge.target]);
    }
  }
  const queue = codeNodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of downstream.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== codeNodes.length) {
    throw new FlowCompileError('Flow contains a cycle between code nodes');
  }

  // ── name registry ────────────────────────────────────────────────────────
  const used = new Set<string>();
  const blockVar = new Map<string, string>(); // node id → factory const
  const resultVar = new Map<string, string>(); // node id → result const
  for (const id of order) {
    blockVar.set(id, `__block_${sanitizeId(id, used)}`);
    resultVar.set(id, `__r_${sanitizeId(id, used)}`);
  }
  const assetVar = new Map<string, string>(); // asset node id → baked const
  for (const node of assetNodes) {
    assetVar.set(node.id, `__asset_${sanitizeId(node.id, used)}`);
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

  /** FlowType of the value flowing out of `sourceId.sourceHandle`. */
  const sourceType = (sourceId: string, sourceHandle: string | null | undefined): FlowType => {
    const real = resolveThroughViewers(sourceId);
    const node = real ? nodes.get(real) : undefined;
    if (!node) return { kind: 'unknown' };
    if (INPUT_TYPES.has(node.type)) return inputNodeFlowType(node);
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
  const sourceExpression = (sourceId: string, sourceHandle: string | null | undefined): string => {
    const real = resolveThroughViewers(sourceId);
    if (!real) throw new FlowCompileError(`Viewer chain from "${sourceId}" has no producer`);
    const node = nodes.get(real);
    if (!node) throw new FlowCompileError(`Edge references unknown node "${real}"`);

    if (INPUT_TYPES.has(node.type)) {
      return inputVar.get(real)!;
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

  for (const id of order) {
    const node = nodes.get(id)!;
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

  for (const node of inputNodes) {
    const name = (node as FlowNodeLike & { __flowInputName?: string }).__flowInputName!;
    lines.push(
      `  const ${inputVar.get(node.id)} = inputs[${literal(name)}] !== undefined ? inputs[${literal(name)}] : ${literal(node.data.value)};`
    );
  }
  lines.push('');

  order.forEach((id, index) => {
    const node = nodes.get(id)!;
    const contract = node.data.contract!;
    const incoming = flow.edges.filter((e) => e.target === id);

    const args: string[] = [];
    for (const [inputName, inputType] of Object.entries(contract.inputs)) {
      const edge = incoming.find((e) => (e.targetHandle ?? 'default') === inputName);
      if (edge) {
        args.push(`${literal(inputName)}: ${sourceExpression(edge.source, edge.sourceHandle)}`);
      } else {
        args.push(`${literal(inputName)}: ${literal(defaultValueForType(inputType as FlowType))}`);
      }
    }

    lines.push(`  // node: ${node.data.label || id}`);
    lines.push(
      `  Progress.report(${Math.round((index / order.length) * 100)}, ${literal(node.data.label || id)});`
    );
    lines.push(`  const ${resultVar.get(id)} = await ${blockVar.get(id)}({ ${args.join(', ')} });`);
    lines.push('');
  });

  const outputs: string[] = [];
  const outputEntries: string[] = [];
  const usedOutputNames = new Set<string>();
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
    const terminals = order.filter((id) => !(downstream.get(id) ?? []).length);
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
  lines.push(`  return { ${outputEntries.join(', ')} };`);
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
    const terminals = order.filter((id) => !(downstream.get(id) ?? []).length);
    for (const id of terminals) {
      const node = nodes.get(id)!;
      for (const [key, type] of Object.entries(node.data.contract!.outputs)) {
        if (outputs.includes(key)) contract.outputs[key] = type;
      }
    }
  }

  return {
    source: lines.join('\n'),
    hash: hashFlow(flow),
    inputs: flowInputs,
    outputs,
    nodeOrder: order.map((id) => nodes.get(id)!.data.label || id),
    contract,
  };
}
