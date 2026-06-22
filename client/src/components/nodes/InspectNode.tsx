/**
 * InspectNode — a transparent value TAP (1 input → 1 output).
 *
 * Compiles away to nothing: the flow-compiler lists `inspect` in
 * PASSTHROUGH_TYPES, so an edge through it resolves straight to the upstream
 * producer (exactly like `reroute`/`viewer`). It exists only to surface a small
 * live preview of the value travelling along the wire.
 *
 * Live value: passthrough nodes are never executed, but the UPSTREAM node's
 * result lives in `nodeCache[sourceId].output`. We read that (same hook the
 * ViewerNode uses) and render a compact preview. When nothing has executed yet,
 * we show a "no value yet" placeholder rather than faking data.
 */

import { memo, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { ScanEye } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useNodeResizeInternals } from '../../hooks/useNodeResizeInternals';

interface InspectNodeData {
  label?: string;
}

/** Best-effort compact preview of an arbitrary runtime value. */
function previewValue(value: unknown): { text: string; kind: string } {
  if (value === undefined || value === null) return { text: '—', kind: 'empty' };

  // Domain objects (live WASM schematics, image buffers) — describe, don't dump.
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('_schematicHandle' in v || typeof (v as { get_dimensions?: unknown }).get_dimensions === 'function') {
      return { text: 'Schematic', kind: 'schematic' };
    }
    if ('width' in v && 'height' in v && 'data' in v) {
      return { text: `Image ${v.width}×${v.height}`, kind: 'image' };
    }
    if (Array.isArray(value)) {
      return { text: `Array(${value.length})`, kind: 'array' };
    }
    try {
      const json = JSON.stringify(value);
      return { text: json.length > 80 ? json.slice(0, 77) + '…' : json, kind: 'object' };
    } catch {
      return { text: '[object]', kind: 'object' };
    }
  }

  if (typeof value === 'string') {
    return { text: value.length > 60 ? `"${value.slice(0, 57)}…"` : `"${value}"`, kind: 'string' };
  }
  return { text: String(value), kind: typeof value };
}

const InspectNode = memo(({ id, data, selected }: NodeProps & { data: InspectNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);

  // The input/output handles are anchored to the header row; force a re-measure
  // on mount and whenever the body height changes (value populates → multi-line)
  // so edges stay attached to the visible dots.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);
  useNodeResizeInternals(id, rootRef);

  // The value on the wire = the upstream producer's cached output.
  const { value, status, hasInput } = useFlowStore(
    useShallow((state) => {
      const inputEdge = state.edges.find((e) => e.target === id);
      if (!inputEdge) return { value: undefined, status: 'idle', hasInput: false };
      const sourceCache = state.nodeCache[inputEdge.source];
      return {
        value: sourceCache?.output,
        status: sourceCache?.status ?? 'idle',
        hasInput: true,
      };
    })
  );

  const preview = previewValue(value);
  const hasValue = value !== undefined && value !== null;

  return (
    <div
      className={`
        relative min-w-[150px] max-w-[230px] rounded-lg overflow-visible
        bg-neutral-900/80 backdrop-blur-sm border transition-colors duration-150
        ${selected ? 'border-teal-500 shadow-lg shadow-teal-500/10' : 'border-neutral-700/60'}
      `}
      ref={rootRef}
      onClick={() => selectNode(id)}
    >
      {/* Header — input/output handles are anchored to THIS fixed-height row so
          they stay on their dots when the body grows (value populates). */}
      <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 border-b border-neutral-800/50">
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{ top: '50%', left: '-6px', transform: 'translateY(-50%)' }}
          className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-teal-400"
          title="input"
        />
        <ScanEye className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-[11px] font-medium text-white truncate flex-1">
          {data?.label || 'Inspect'}
        </span>
        {hasValue && (
          <span className="text-[9px] text-teal-400/70 font-mono uppercase">{preview.kind}</span>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ top: '50%', right: '-6px', transform: 'translateY(-50%)' }}
          className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-teal-400"
          title="output (pass-through)"
        />
      </div>

      <div className="px-2.5 py-2">
        {!hasInput ? (
          <div className="text-[10px] text-neutral-600 italic">connect a value</div>
        ) : hasValue ? (
          <div
            className="text-[11px] font-mono text-teal-200 break-all whitespace-pre-wrap leading-snug"
            title={preview.text}
          >
            {preview.text}
          </div>
        ) : (
          <div className="text-[10px] text-neutral-500 italic">
            {status === 'running' || status === 'pending' ? 'running…' : 'no value yet — run the flow'}
          </div>
        )}
      </div>
    </div>
  );
});

InspectNode.displayName = 'InspectNode';

export default InspectNode;
