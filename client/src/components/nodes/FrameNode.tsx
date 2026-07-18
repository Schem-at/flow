/**
 * FrameNode - a large labeled backdrop rectangle rendered BEHIND other nodes.
 *
 * Purely visual: no ports, no execution. We do NOT use React Flow
 * parent/child reparenting — this is just a movable/resizable rectangle that
 * sits at a low z-index. Its body is pointer-events:none so it never blocks
 * nodes stacked on top, but the header bar and resize handles remain
 * interactive so the frame itself can be grabbed and resized.
 *
 * The flow-compiler treats `frame` nodes as decorative and ignores them.
 */

import { memo, useCallback, useState } from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { useFlowStore } from '../../store/flowStore';

interface FrameNodeData {
  label?: string;
  width?: number;
  height?: number;
  color?: string; // optional accent (tailwind border/bg base, e.g. 'indigo')
}

const DEFAULT_W = 360;
const DEFAULT_H = 240;

const FrameNode = memo(({ id, data, selected }: NodeProps & { data: FrameNodeData }) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const selectNode = useFlowStore((state) => state.selectNode);
  const [isHovered, setIsHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      updateNodeData(id, { width: params.width, height: params.height });
    },
    [id, updateNodeData]
  );

  return (
    <>
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={selected || isHovered}
        lineClassName="!border-indigo-400/50"
        handleClassName="!w-2 !h-2 !bg-indigo-400 !border-indigo-500"
        onResizeEnd={handleResizeEnd}
      />
      {/* Outer wrapper: header is interactive, body lets clicks fall through. */}
      <div
        className="relative flex flex-col"
        style={{ width: data?.width ?? DEFAULT_W, height: data?.height ?? DEFAULT_H }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Backdrop body — pointer-events:none so nodes on top stay clickable */}
        <div
          className={`
            absolute inset-0 rounded-lg pointer-events-none
            border-2 border-dashed transition-colors duration-150
            ${selected ? 'border-indigo-400/70 bg-indigo-500/[0.06]' : 'border-indigo-400/30 bg-indigo-500/[0.03]'}
          `}
        />
        {/* Header bar — grabbable to move/select the frame */}
        <div
          className="relative self-start max-w-full cursor-grab active:cursor-grabbing"
          onClick={() => selectNode(id)}
          onDoubleClick={() => setEditing(true)}
        >
          {editing ? (
            <input
              autoFocus
              value={data?.label ?? ''}
              onChange={(e) => updateNodeData(id, { label: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') setEditing(false);
              }}
              placeholder="Frame label"
              className="m-1.5 px-2 py-1 rounded bg-neutral-900 border border-indigo-500/50 text-xs text-white focus:outline-none nodrag"
            />
          ) : (
            <div className="m-1.5 px-2 py-1 rounded bg-indigo-500/20 border border-indigo-400/30 text-[11px] font-medium text-indigo-200 whitespace-nowrap">
              {data?.label || 'Frame'}
            </div>
          )}
        </div>
      </div>
    </>
  );
});

FrameNode.displayName = 'FrameNode';

export default FrameNode;
