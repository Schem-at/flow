/**
 * tracePlan — the pure, unit-testable core of the live canvas's SINGLE
 * execution engine.
 *
 * The editor's live canvas runs ONE path: `compileFlow(flow, { trace:true })`
 * → `executeScript(..., { returnHandles:true })` → distribute the per-node
 * `__trace` ({ value, ms, status }) back onto the canvas. This module owns the
 * NON-React, side-effect-free pieces of that path so they can be tested without
 * a worker or a DOM:
 *
 *  1. `collectFlowInputs` — gather flow-level input values keyed by the SAME
 *     name compileFlow derives (`__flowInputName`: `label || id`, de-duped with
 *     a `_2`, `_3`, … suffix). file_input nodes contribute their `fileData`.
 *
 *  2. `outputNodeName` / `collectOutputNames` — mirror compileFlow's output-node
 *     naming (`label || 'output'`, same de-dupe) so `__outputs[name]` can be
 *     mapped back to the right output/file_output node.
 *
 *  3. `traceEntryToCache` — shape a single `__trace` entry's value into the
 *     `{ …, default }` cache record the viewer / inspect / preview readers
 *     expect (they look for a named handle, then `default`, then the first key).
 *
 *  4. `flowHasSubflowNodes` — detect the one node type compileFlow does NOT
 *     support (`subflow`, which carries an embedded `flowDefinition` run via
 *     `executeSubflow`). The live engine uses this to fall back to the legacy
 *     subflow-aware executor for those (rare) flows instead of regressing them.
 *
 * Keeping these here means the live-run wiring in Editor.tsx is a thin shell
 * over tested logic. See `tracePlan.test.ts`.
 */

/** Minimal node shape this module needs — a subset of the store's FlowNode. */
export interface TracePlanNode {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

/** Input-ish node types whose value feeds the folded flow's `inputs` object. */
const INPUT_TYPE_RE = /input/;
/** Schematic inputs are NOT flow inputs (they bind their own source). */
const SCHEMATIC_RE = /schematic/;

/** True for the unified input/file_input/* nodes compileFlow treats as flow inputs. */
export function isFlowInputNode(node: TracePlanNode): boolean {
  const t = node.type ?? '';
  return INPUT_TYPE_RE.test(t) && !SCHEMATIC_RE.test(t);
}

/**
 * Collect flow-level input values keyed exactly as compileFlow's
 * `__flowInputName` derivation: `label || id`, de-duped with `_2`/`_3`/… .
 * file_input nodes contribute their stored `fileData`; everything else its
 * `value`.
 */
export function collectFlowInputs(nodes: TracePlanNode[]): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const used = new Set<string>();
  for (const node of nodes) {
    if (!isFlowInputNode(node)) continue;
    const base = (node.data.label as string) || node.id;
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    inputs[name] =
      node.type === 'file_input' ? (node.data as { fileData?: unknown }).fileData : node.data.value;
  }
  return inputs;
}

/** Output / file_output node types whose value comes from `__outputs[name]`. */
export function isFlowOutputNode(node: TracePlanNode): boolean {
  return node.type === 'output' || node.type === 'file_output';
}

/**
 * Map output/file_output node ids to the name compileFlow uses for them in
 * `__outputs` (`label || 'output'`, de-duped with `_2`/… in node order). Only
 * nodes that actually emit an output entry are kept (matches compileFlow, which
 * skips output nodes with no incoming edge — but here we keep all, the caller
 * just won't find a matching `__outputs` key for an unconnected one).
 */
export function collectOutputNames(nodes: TracePlanNode[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const node of nodes) {
    if (!isFlowOutputNode(node)) continue;
    const base = (node.data.label as string) || 'output';
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    names.set(node.id, name);
  }
  return names;
}

/**
 * Shape a resolved trace value into the cache `output` record the canvas
 * readers expect. Objects are spread so a named source-handle key resolves,
 * and a `default` alias is always added so handle-less viewers/outputs find it.
 * Primitives/arrays are wrapped as `{ output, default }`.
 */
export function traceValueToCache(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>), default: value };
  }
  return { output: value, default: value };
}

/**
 * True when the flow contains a `subflow` node — the single node type
 * compileFlow does NOT compile (it carries an embedded `flowDefinition` run via
 * the worker's `executeSubflow`). The live engine routes these flows through
 * the legacy subflow-aware executor so they aren't regressed.
 */
export function flowHasSubflowNodes(nodes: TracePlanNode[]): boolean {
  return nodes.some((n) => n.type === 'subflow');
}
