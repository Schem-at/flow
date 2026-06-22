/**
 * RerouteNode - a tiny pass-through dot for tidying wires.
 *
 * One input handle, one output handle, no UI. The flow-compiler treats
 * `reroute` like a viewer: an edge through it resolves to the upstream
 * producer, so it behaves as a direct connection (transparent pass-through).
 */

import { memo, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useNodeResizeInternals } from '../../hooks/useNodeResizeInternals';

interface RerouteNodeData {
  label?: string;
}

const RerouteNode = memo(({ id, selected }: NodeProps & { data: RerouteNodeData }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);

  // The node IS its dot — the in/out handles sit at the dot's centre. Re-measure
  // on mount and on any size change so edges attach to the correct bounds.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);
  useNodeResizeInternals(id, rootRef);

  return (
    <div
      ref={rootRef}
      className={`
        relative w-3.5 h-3.5 rounded-full
        bg-neutral-400 border-2 transition-colors duration-150
        ${selected ? 'border-pink-400 ring-2 ring-pink-400/30' : 'border-neutral-700'}
      `}
      title="Reroute"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-2 !h-2 !min-w-0 !min-h-0 !bg-transparent !border-0"
        style={{ left: -2, top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-2 !h-2 !min-w-0 !min-h-0 !bg-transparent !border-0"
        style={{ right: -2, top: '50%' }}
      />
    </div>
  );
});

RerouteNode.displayName = 'RerouteNode';

export default RerouteNode;
