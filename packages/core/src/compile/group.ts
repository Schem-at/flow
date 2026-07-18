/**
 * Group / Subflow meta-node — collapse a selection of nodes into ONE node with
 * a nested subgraph that executes inline.
 *
 * A `group` node embeds a nested graph in `data.subgraph` ({ nodes, edges }) and
 * exposes a derived boundary contract:
 *   - data.groupInputs:  BoundaryPort[] — one per OUTSIDE→INSIDE edge crossing.
 *   - data.groupOutputs: BoundaryPort[] — one per INSIDE→OUTSIDE edge crossing.
 *
 * Crucially, boundary ports carry the REAL edge types (list / schematic / object
 * / …): they are derived from the crossing EDGES (the producing port's type),
 * NOT from `type:'input'` nodes — so a group beats the scalar-only module fold.
 *
 * Compilation inlines the subgraph as an async closure in the SAME worker (no
 * backend round-trip): the group node binds
 *     const __group_x = await (async ({ inA, inB, … }) => { …subgraph… })({ inA: <expr>, … });
 * and its outputs read `__group_x[outName]`. The subgraph is compiled by the
 * shared body emitter (see compileFlow), with boundary-fed input handles reading
 * off the closure's parameter object instead of an upstream node.
 */

import type { FlowType } from '../types/flow-type.js';

// ── shared edge / node shapes (kept structurally compatible with FlowLike) ──

export interface GroupEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface GroupNodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface GroupSubgraph {
  nodes: GroupNodeLike[];
  edges: GroupEdge[];
}

/**
 * One boundary crossing. For an INPUT: the value arrives from outside and is
 * delivered to (`internalNodeId`, `internalHandle`). For an OUTPUT: the value is
 * produced by (`internalNodeId`, `internalHandle`) and leaves the group.
 *
 * `externalNodeId`/`externalHandle` record the OUTSIDE endpoint at derivation
 * time so the boundary edges can be re-wired to the group node. `name` is the
 * group port id (also the boundary param key / output key). `type` is the real
 * FlowType carried across the boundary (best-effort; falls back to 'unknown').
 */
export interface BoundaryPort {
  name: string;
  internalNodeId: string;
  internalHandle: string | null;
  externalNodeId: string;
  externalHandle: string | null;
  type?: FlowType;
}

export interface GroupBoundary {
  inputs: BoundaryPort[];
  outputs: BoundaryPort[];
}

/** data shape carried by a `group` node. */
export interface GroupNodeData {
  label?: string;
  subgraph: GroupSubgraph;
  groupInputs: BoundaryPort[];
  groupOutputs: BoundaryPort[];
  expanded?: boolean;
  [key: string]: unknown;
}

/**
 * data shape carried by a `map` node. A Map embeds a BODY subgraph (identical
 * structure to a group's) and iterates it over a `list` input. The body's
 * boundary contract is constrained: it has a designated `item` input (and an
 * optional `index` input), and a designated `result` output. At compile time the
 * body is compiled by the SAME {@link GroupSubgraph} machinery as a group —
 * `bodyInputs`/`bodyOutputs` are reused verbatim by the compiler's
 * `compileGraph`/`compileSubgraphClosure` path. The convention is:
 *   - the body input port named `item`  receives each element,
 *   - the body input port named `index` (optional) receives the 0-based index,
 *   - the body output port named `result` is collected into the output list.
 */
export interface MapNodeData {
  label?: string;
  subgraph: GroupSubgraph;
  /** Boundary INPUTS of the body (must include `item`; may include `index`). */
  bodyInputs: BoundaryPort[];
  /** Boundary OUTPUTS of the body (the `result` port is collected). */
  bodyOutputs: BoundaryPort[];
  /** Name of the output port collected per element (defaults to `result`). */
  resultPort?: string;
  expanded?: boolean;
  [key: string]: unknown;
}

/** Type guard: does this node carry a usable map payload? */
export function isMapNodeData(data: unknown): data is MapNodeData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const sg = d.subgraph as { nodes?: unknown; edges?: unknown } | undefined;
  return (
    !!sg &&
    Array.isArray(sg.nodes) &&
    Array.isArray(sg.edges) &&
    Array.isArray(d.bodyInputs) &&
    Array.isArray(d.bodyOutputs)
  );
}

/** Type guard: does this node carry a usable group payload? */
export function isGroupNodeData(data: unknown): data is GroupNodeData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const sg = d.subgraph as { nodes?: unknown; edges?: unknown } | undefined;
  return (
    !!sg &&
    Array.isArray(sg.nodes) &&
    Array.isArray(sg.edges) &&
    Array.isArray(d.groupInputs) &&
    Array.isArray(d.groupOutputs)
  );
}

/**
 * Derive the boundary contract for a SELECTION of nodes within a parent flow.
 *
 * Given the parent's full edge list and the set of selected node ids:
 *   - OUTSIDE→INSIDE edges  → group INPUTS  (one port per distinct external
 *     producer port; fan-in to several internal handles from the SAME producer
 *     port collapses to one input).
 *   - INSIDE→OUTSIDE edges  → group OUTPUTS (one port per distinct internal
 *     producer port; fan-out to several external consumers from the same
 *     internal port collapses to one output).
 *   - INSIDE→INSIDE         → internal, stays in the subgraph.
 *   - OUTSIDE→OUTSIDE       → untouched (not part of the group).
 *
 * `typeOf(nodeId, handle)` resolves a producing port's FlowType (optional; used
 * only to label boundary ports). Names are unique, derived from the handle.
 */
export function deriveBoundary(
  selectedIds: Set<string>,
  edges: GroupEdge[],
  typeOf?: (nodeId: string, handle: string | null | undefined) => FlowType
): GroupBoundary {
  const inputs: BoundaryPort[] = [];
  const outputs: BoundaryPort[] = [];
  const usedInNames = new Set<string>();
  const usedOutNames = new Set<string>();
  // Distinct producer port → input port (collapse fan-in from one source port).
  const inByProducer = new Map<string, BoundaryPort>();
  // Distinct internal producer port → output port (collapse fan-out).
  const outByProducer = new Map<string, BoundaryPort>();

  const uniqueName = (base: string, used: Set<string>): string => {
    let name = base && base.length ? base : 'port';
    name = name.replace(/[^a-zA-Z0-9_$]/g, '_') || 'port';
    let candidate = name;
    let i = 2;
    while (used.has(candidate)) candidate = `${name}_${i++}`;
    used.add(candidate);
    return candidate;
  };

  for (const e of edges) {
    const sourceInside = selectedIds.has(e.source);
    const targetInside = selectedIds.has(e.target);

    if (!sourceInside && targetInside) {
      // OUTSIDE → INSIDE: an input crossing.
      const key = `${e.source}::${e.sourceHandle ?? ''}`;
      const existing = inByProducer.get(key);
      if (existing) continue; // same producer port already mapped to an input
      const base = (e.sourceHandle ?? e.targetHandle ?? 'in') || 'in';
      const port: BoundaryPort = {
        name: uniqueName(`in_${base}`, usedInNames),
        internalNodeId: e.target,
        internalHandle: e.targetHandle ?? null,
        externalNodeId: e.source,
        externalHandle: e.sourceHandle ?? null,
        type: typeOf?.(e.source, e.sourceHandle),
      };
      inByProducer.set(key, port);
      inputs.push(port);
    } else if (sourceInside && !targetInside) {
      // INSIDE → OUTSIDE: an output crossing.
      const key = `${e.source}::${e.sourceHandle ?? ''}`;
      const existing = outByProducer.get(key);
      if (existing) continue; // same internal port already mapped to an output
      const base = (e.sourceHandle ?? 'out') || 'out';
      const port: BoundaryPort = {
        name: uniqueName(`out_${base}`, usedOutNames),
        internalNodeId: e.source,
        internalHandle: e.sourceHandle ?? null,
        externalNodeId: e.target,
        externalHandle: e.targetHandle ?? null,
        type: typeOf?.(e.source, e.sourceHandle),
      };
      outByProducer.set(key, port);
      outputs.push(port);
    }
  }

  return { inputs, outputs };
}

let __groupSeq = 0;
/** Deterministic-ish unique id for synthesized group nodes (test-stable seed). */
export function nextGroupId(): string {
  return `group_${(++__groupSeq).toString(36)}_${Date.now().toString(36)}`;
}

export interface GroupResult {
  /** The new group node (type 'group') replacing the selection. */
  groupNode: GroupNodeLike;
  /** Nodes that remain in the parent (selection removed, group added). */
  nodes: GroupNodeLike[];
  /** Edges in the parent after rewiring boundary edges to the group node. */
  edges: GroupEdge[];
}

/**
 * Pure graph transform: collapse `selectedIds` into one group node.
 *
 * - Selected nodes + their internal (INSIDE→INSIDE) edges move into the group's
 *   subgraph (and boundary edges are recorded too, so ungroup can restore them).
 * - The group node replaces them in the parent; boundary edges are rewired:
 *     OUTSIDE→INSIDE  becomes OUTSIDE→group(inputPort)
 *     INSIDE→OUTSIDE  becomes group(outputPort)→OUTSIDE
 * - `position`/extent of the group can be set by the caller (UI concern).
 */
export function groupNodes(
  allNodes: GroupNodeLike[],
  allEdges: GroupEdge[],
  selectedIds: string[],
  opts: {
    groupId?: string;
    label?: string;
    typeOf?: (nodeId: string, handle: string | null | undefined) => FlowType;
  } = {}
): GroupResult {
  const selected = new Set(selectedIds);
  const inside = allNodes.filter((n) => selected.has(n.id));
  if (inside.length === 0) {
    throw new Error('groupNodes: no selected nodes found in the graph');
  }
  const groupId = opts.groupId ?? nextGroupId();

  const boundary = deriveBoundary(selected, allEdges, opts.typeOf);

  // Edges fully inside the selection live in the subgraph.
  const internalEdges = allEdges.filter(
    (e) => selected.has(e.source) && selected.has(e.target)
  );
  // Boundary edges, rewired to point at the group node's ports, live in the
  // SUBGRAPH too (so ungroup can splice them straight back), encoded as edges
  // touching the boundary ports' internal endpoints from synthetic markers is
  // unnecessary — instead we keep the boundary descriptors and re-derive on
  // ungroup. The subgraph stores only internal nodes + internal edges.
  const subgraph: GroupSubgraph = {
    nodes: inside.map((n) => ({ ...n })),
    edges: internalEdges.map((e) => ({ ...e })),
  };

  const groupNode: GroupNodeLike = {
    id: groupId,
    type: 'group',
    data: {
      label: opts.label ?? 'Group',
      subgraph,
      groupInputs: boundary.inputs,
      groupOutputs: boundary.outputs,
      expanded: false,
    },
  };

  // Parent nodes: drop the selection, add the group.
  const nodes = allNodes.filter((n) => !selected.has(n.id)).concat(groupNode);

  // Rewire edges.
  const edges: GroupEdge[] = [];
  for (const e of allEdges) {
    const si = selected.has(e.source);
    const ti = selected.has(e.target);
    if (si && ti) continue; // internal — now lives in the subgraph
    if (!si && ti) {
      // OUTSIDE → INSIDE: redirect to the matching group input port.
      const key = `${e.source}::${e.sourceHandle ?? ''}`;
      const port = boundary.inputs.find(
        (p) => `${p.externalNodeId}::${p.externalHandle ?? ''}` === key
      );
      if (!port) continue;
      edges.push({
        ...e,
        target: groupId,
        targetHandle: port.name,
      });
    } else if (si && !ti) {
      // INSIDE → OUTSIDE: redirect to come from the group output port.
      const key = `${e.source}::${e.sourceHandle ?? ''}`;
      const port = boundary.outputs.find(
        (p) => `${p.internalNodeId}::${p.internalHandle ?? ''}` === key
      );
      if (!port) continue;
      edges.push({
        ...e,
        source: groupId,
        sourceHandle: port.name,
      });
    } else {
      edges.push({ ...e }); // outside ↔ outside: untouched
    }
  }

  return { groupNode, nodes, edges };
}

export interface UngroupResult {
  nodes: GroupNodeLike[];
  edges: GroupEdge[];
}

/**
 * Inverse of {@link groupNodes}: inline a group node's subgraph back into the
 * parent. Boundary edges (which currently touch the group node) are reconnected
 * to the original internal endpoints recorded in the boundary descriptors.
 */
export function ungroup(
  allNodes: GroupNodeLike[],
  allEdges: GroupEdge[],
  groupId: string
): UngroupResult {
  const group = allNodes.find((n) => n.id === groupId);
  if (!group || group.type !== 'group' || !isGroupNodeData(group.data)) {
    throw new Error(`ungroup: "${groupId}" is not a group node`);
  }
  const data = group.data;
  const inputByName = new Map(data.groupInputs.map((p) => [p.name, p]));
  const outputByName = new Map(data.groupOutputs.map((p) => [p.name, p]));

  // Re-insert the subgraph nodes (minus any id clash with existing parent).
  const existingIds = new Set(allNodes.map((n) => n.id));
  existingIds.delete(groupId);
  const nodes = allNodes
    .filter((n) => n.id !== groupId)
    .concat(data.subgraph.nodes.map((n) => ({ ...n })));

  const edges: GroupEdge[] = [];
  // Internal edges come straight back.
  for (const e of data.subgraph.edges) edges.push({ ...e });
  // Parent edges: rewire the ones that touched the group node.
  for (const e of allEdges) {
    if (e.target === groupId) {
      const port = inputByName.get(e.targetHandle ?? '');
      if (!port) continue;
      edges.push({
        ...e,
        target: port.internalNodeId,
        targetHandle: port.internalHandle,
      });
    } else if (e.source === groupId) {
      const port = outputByName.get(e.sourceHandle ?? '');
      if (!port) continue;
      edges.push({
        ...e,
        source: port.internalNodeId,
        sourceHandle: port.internalHandle,
      });
    } else {
      edges.push({ ...e });
    }
  }

  void existingIds; // (reserved for future id-collision remapping)
  return { nodes, edges };
}
