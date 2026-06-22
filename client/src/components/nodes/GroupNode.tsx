/**
 * GroupNode — a collapsed meta-node embedding a nested subgraph.
 *
 * Renders as ONE node exposing its DERIVED boundary ports (left = inputs,
 * right = outputs). The boundary contract lives in `data.groupInputs` /
 * `data.groupOutputs` (see @flow/core `deriveBoundary`); each port carries the
 * real edge type, so list/schematic/object values cross the boundary.
 *
 * v1 editing affordance: double-click (or the expand chevron) reveals a
 * READ-ONLY view of the nested subgraph (node list + boundary contract + JSON).
 * A full nested visual editor is intentionally deferred — see MORNING-REVIEW.
 * The "Ungroup" button inlines the subgraph back via the store action.
 */

import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Boxes, ChevronDown, ChevronRight, Ungroup } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useNodeResizeInternals } from '../../hooks/useNodeResizeInternals';
import type { GroupNodeData } from '@flow/core';

type GroupData = Partial<GroupNodeData> & { label?: string; expanded?: boolean };

/** Map a FlowType kind to a port dot colour (mirrors the other nodes). */
function kindColor(kind?: string): string {
  switch (kind) {
    case 'number': return 'bg-blue-500';
    case 'string': return 'bg-green-500';
    case 'boolean': return 'bg-amber-500';
    case 'schematic': return 'bg-pink-500';
    case 'image': return 'bg-fuchsia-500';
    case 'list': return 'bg-cyan-500';
    case 'object': return 'bg-violet-500';
    case 'vec3': return 'bg-orange-500';
    case 'block': return 'bg-red-500';
    default: return 'bg-neutral-400';
  }
}

const GroupNode = memo(({ id, data, selected }: NodeProps & { data: GroupData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const ungroupNode = useFlowStore((s) => s.ungroupNode);
  const cache = useFlowStore((s) => s.nodeCache[id]);
  const executingNodeId = useFlowStore((s) => s.executingNodeId);
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  // Boundary handles are anchored to their per-port label ROWS; re-measure when
  // the node's height changes (expand / error / footer) so edges stay on the dots.
  useNodeResizeInternals(id, rootRef);

  const [expanded, setExpanded] = useState(false);

  // Guard every boundary/subgraph collection with Array.isArray: a present-but-
  // non-array value (malformed/legacy/pasted flow) would pass `?? []` and then
  // crash the `.map()` below, blanking the node.
  const inputs = useMemo(() => (Array.isArray(data?.groupInputs) ? data.groupInputs : []), [data?.groupInputs]);
  const outputs = useMemo(() => (Array.isArray(data?.groupOutputs) ? data.groupOutputs : []), [data?.groupOutputs]);
  const subNodes = Array.isArray(data?.subgraph?.nodes) ? data.subgraph!.nodes : [];
  const subEdges = Array.isArray(data?.subgraph?.edges) ? data.subgraph!.edges : [];

  // Boundary handle positions (rowY) depend on the in/out port counts, and the
  // expand toggle changes the node height — re-measure so edges stay attached.
  const boundarySig = `${inputs.length}:${outputs.length}`;
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, boundarySig, expanded]);

  const status = cache?.status ?? 'idle';
  const isExecuting = executingNodeId === id;

  const handleClick = useCallback(() => selectNode(id), [id, selectNode]);
  const handleUngroup = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      ungroupNode(id);
    },
    [id, ungroupNode]
  );

  const border = isExecuting
    ? 'border-amber-500/70 shadow-lg shadow-amber-500/20'
    : selected
      ? 'border-indigo-500/70 ring-1 ring-indigo-500/40'
      : status === 'completed'
        ? 'border-green-500/40'
        : status === 'error'
          ? 'border-red-500/50'
          : 'border-neutral-700';

  return (
    <div
      ref={rootRef}
      onClick={handleClick}
      onDoubleClick={() => setExpanded((v) => !v)}
      className={`relative rounded-xl border bg-neutral-900/95 backdrop-blur min-w-[220px] ${border} transition-colors`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
          <Boxes className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-white truncate">{data?.label || 'Group'}</div>
          <div className="text-[10px] text-neutral-500">
            {subNodes.length} node{subNodes.length === 1 ? '' : 's'} · {inputs.length} in · {outputs.length} out
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-400"
          title={expanded ? 'Collapse' : 'Expand (read-only)'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Port labels — each row OWNS its boundary handle (anchored to the row's
          vertical centre, mirroring CodeNode) so the visible dot IS the handle and
          stays aligned regardless of node height. */}
      <div className="px-3 py-2 flex gap-4 justify-between">
        <div className="space-y-1">
          {inputs.map((port) => (
            <div key={port.name} className="relative flex items-center gap-1.5 text-[11px] text-neutral-300">
              <Handle
                id={port.name}
                type="target"
                position={Position.Left}
                style={{ top: '50%', left: '-18px', transform: 'translateY(-50%)' }}
                className={`!w-3 !h-3 !border-2 !border-neutral-900 ${kindColor(port.type?.kind)}`}
                title={`${port.name}: ${port.type?.kind ?? 'unknown'}`}
              />
              <span className={`w-1.5 h-1.5 rounded-full ${kindColor(port.type?.kind)}`} />
              {port.name}
            </div>
          ))}
        </div>
        <div className="space-y-1 text-right">
          {outputs.map((port) => (
            <div key={port.name} className="relative flex items-center gap-1.5 justify-end text-[11px] text-neutral-300">
              {port.name}
              <span className={`w-1.5 h-1.5 rounded-full ${kindColor(port.type?.kind)}`} />
              <Handle
                id={port.name}
                type="source"
                position={Position.Right}
                style={{ top: '50%', right: '-18px', transform: 'translateY(-50%)' }}
                className={`!w-3 !h-3 !border-2 !border-neutral-900 ${kindColor(port.type?.kind)}`}
                title={`${port.name}: ${port.type?.kind ?? 'unknown'}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Expanded read-only view of the nested subgraph */}
      {expanded && (
        <div className="px-3 py-2 border-t border-neutral-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">Subgraph (read-only)</div>
          <ul className="text-[11px] text-neutral-300 space-y-0.5">
            {subNodes.map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span className="truncate">{String((n.data as { label?: string })?.label ?? n.id)}</span>
                <span className="text-neutral-600">{n.type}</span>
              </li>
            ))}
          </ul>
          <div className="text-[10px] text-neutral-600">{subEdges.length} internal edge{subEdges.length === 1 ? '' : 's'}</div>
          <details className="text-[11px]">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">Boundary JSON</summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-neutral-950/60 p-2 text-[10px] font-mono text-neutral-400">
{JSON.stringify({ groupInputs: inputs, groupOutputs: outputs }, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-neutral-800 flex justify-end">
        <button
          onClick={handleUngroup}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          title="Inline the subgraph back into the flow"
        >
          <Ungroup className="w-3.5 h-3.5" />
          Ungroup
        </button>
      </div>

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

GroupNode.displayName = 'GroupNode';

export default GroupNode;
