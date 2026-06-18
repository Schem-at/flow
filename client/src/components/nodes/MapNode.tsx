/**
 * MapNode — iterate a BODY subgraph over a `list`, collecting a `list` of results.
 *
 * Structurally identical to the Group meta-node: it embeds a nested subgraph in
 * `data.subgraph` and a boundary contract (`data.bodyInputs` / `data.bodyOutputs`).
 * The body's boundary is CONSTRAINED by convention:
 *   - input  `item`   — receives each element (required),
 *   - input  `index`  — receives the 0-based index (optional),
 *   - output `result` — collected into the output list (`data.resultPort`).
 *
 * Node ports:
 *   - left  `list`   — the collection to iterate,
 *   - right `output` — the mapped list.
 *
 * The compiler reuses the SAME `compileGraph` boundary machinery as Group
 * (`compileMapBodyClosure`) and emits:
 *   const __map = await Promise.all((<list> ?? []).map(async (item, index) =>
 *     (await body({ item, index }))[resultPort]));
 *
 * v1 editing affordance: like Group, double-click reveals a READ-ONLY view of
 * the body subgraph (node list + boundary contract). A full nested visual editor
 * is deferred — see MORNING-REVIEW. Editing the body means ungroup-style flows
 * are TODO; for now bodies are authored programmatically (`makeMap`).
 */

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Repeat, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import type { MapNodeData } from '@flow/core';

type MapData = Partial<MapNodeData> & { label?: string };

const MapNode = memo(({ id, data, selected }: NodeProps & { data: MapData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const cache = useFlowStore((s) => s.nodeCache[id]);
  const executingNodeId = useFlowStore((s) => s.executingNodeId);
  const updateNodeInternals = useUpdateNodeInternals();

  const [expanded, setExpanded] = useState(false);

  // Guard every boundary/subgraph collection with Array.isArray: a present-but-
  // non-array value (malformed/legacy/pasted flow) would pass `?? []` and then
  // crash the `.map()`/`.some()` below, blanking the node.
  const bodyInputs = useMemo(() => (Array.isArray(data?.bodyInputs) ? data.bodyInputs : []), [data?.bodyInputs]);
  const bodyOutputs = useMemo(() => (Array.isArray(data?.bodyOutputs) ? data.bodyOutputs : []), [data?.bodyOutputs]);
  const subNodes = Array.isArray(data?.subgraph?.nodes) ? data.subgraph!.nodes : [];
  const subEdges = Array.isArray(data?.subgraph?.edges) ? data.subgraph!.edges : [];
  const resultPort = typeof data?.resultPort === 'string' ? data.resultPort : 'result';

  // The body boundary contract drives the node's effective port surface and the
  // expand/collapse toggle changes the node height; re-measure handle bounds so
  // edges stay attached to the correct positions.
  const boundarySig = `${bodyInputs.length}:${bodyOutputs.length}`;
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, boundarySig, expanded]);

  const status = cache?.status ?? 'idle';
  const isExecuting = executingNodeId === id;

  const connected = useFlowStore((s) =>
    s.edges.some((e) => e.target === id && (e.targetHandle ?? '') === 'list')
  );

  const handleClick = useCallback(() => selectNode(id), [id, selectNode]);

  const border = isExecuting
    ? 'border-amber-500/70 shadow-lg shadow-amber-500/20'
    : selected
      ? 'border-cyan-500/70 ring-1 ring-cyan-500/40'
      : status === 'completed'
        ? 'border-green-500/40'
        : status === 'error'
          ? 'border-red-500/50'
          : 'border-neutral-700';

  return (
    <div
      onClick={handleClick}
      onDoubleClick={() => setExpanded((v) => !v)}
      className={`relative rounded-xl border bg-neutral-900/95 backdrop-blur min-w-[220px] ${border} transition-colors`}
    >
      {/* List input (left) */}
      <Handle
        id="list"
        type="target"
        position={Position.Left}
        style={{ top: '50%' }}
        className={`!w-3 !h-3 !border-2 !border-neutral-900 ${connected ? '!bg-cyan-500' : '!bg-neutral-600'}`}
        title="list"
      />
      {/* Mapped-list output (right) */}
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        style={{ top: '50%' }}
        className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-cyan-400"
        title="mapped list"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
          <Repeat className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-white truncate">{data?.label || 'Map'}</div>
          <div className="text-[10px] text-neutral-500">
            {subNodes.length} body node{subNodes.length === 1 ? '' : 's'} · list → list
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-400"
          title={expanded ? 'Collapse' : 'Expand body (read-only)'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Port summary */}
      <div className="px-3 py-2 flex gap-4 justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-neutral-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> list
        </div>
        <div className="flex items-center gap-1.5 text-neutral-300">
          {resultPort}[] <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </div>
      </div>

      {/* Expanded read-only view of the body subgraph */}
      {expanded && (
        <div className="px-3 py-2 border-t border-neutral-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Body (read-only)</div>
          <ul className="text-[11px] text-neutral-300 space-y-0.5">
            {subNodes.map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span className="truncate">{String((n.data as { label?: string })?.label ?? n.id)}</span>
                <span className="text-neutral-600">{n.type}</span>
              </li>
            ))}
          </ul>
          <div className="text-[10px] text-neutral-600">
            {subEdges.length} internal edge{subEdges.length === 1 ? '' : 's'} · item:{' '}
            {bodyInputs.some((p) => p.name === 'item') ? 'yes' : 'no'}, index:{' '}
            {bodyInputs.some((p) => p.name === 'index') ? 'yes' : 'no'}
          </div>
          <details className="text-[11px]">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">Boundary JSON</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-neutral-950/60 p-2 text-[10px] font-mono text-neutral-400">
{JSON.stringify({ bodyInputs, bodyOutputs, resultPort }, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {status === 'error' && cache?.error && (
        <div className="px-3 pb-2">
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono">
            {cache.error.message}
          </div>
        </div>
      )}
    </div>
  );
});

MapNode.displayName = 'MapNode';

export default MapNode;
