/**
 * CommentNode - a resizable sticky-note for annotating the canvas.
 *
 * Purely visual: no ports, no execution. The flow-compiler treats `comment`
 * nodes as decorative and ignores them entirely.
 */

import { memo, useCallback, useState } from 'react';
import { type NodeProps, NodeResizer } from '@xyflow/react';
import { useFlowStore } from '../../store/flowStore';

interface CommentNodeData {
  label?: string;
  width?: number;
  height?: number;
}

const DEFAULT_W = 220;
const DEFAULT_H = 140;

const CommentNode = memo(({ id, data, selected }: NodeProps & { data: CommentNodeData }) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const selectNode = useFlowStore((state) => state.selectNode);
  const [isHovered, setIsHovered] = useState(false);

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      updateNodeData(id, { width: params.width, height: params.height });
    },
    [id, updateNodeData]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { label: e.target.value });
    },
    [id, updateNodeData]
  );

  return (
    <>
      <NodeResizer
        minWidth={140}
        minHeight={80}
        isVisible={selected || isHovered}
        lineClassName="!border-amber-400/60"
        handleClassName="!w-2 !h-2 !bg-amber-400 !border-amber-500"
        onResizeEnd={handleResizeEnd}
      />
      <div
        className={`
          flex flex-col rounded-md overflow-hidden
          bg-amber-200/90 text-amber-950 shadow-md
          border transition-colors duration-150
          ${selected ? 'border-amber-500' : 'border-amber-300/70'}
        `}
        style={{ width: data?.width ?? DEFAULT_W, height: data?.height ?? DEFAULT_H }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => selectNode(id)}
      >
        {/* Drag handle strip (no nodrag here, so the whole header can move the node) */}
        <div className="h-3 shrink-0 bg-amber-300/70 cursor-grab active:cursor-grabbing" />
        <textarea
          value={data?.label ?? ''}
          onChange={handleTextChange}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Write a note..."
          spellCheck={false}
          className="flex-1 w-full resize-none bg-transparent px-3 py-2 text-xs leading-snug text-amber-950 placeholder:text-amber-800/50 focus:outline-none nodrag nowheel"
        />
      </div>
    </>
  );
});

CommentNode.displayName = 'CommentNode';

export default CommentNode;
