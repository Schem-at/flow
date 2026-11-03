/**
 * GroupSubgraphPreview — a READ-ONLY render of a group/subflow's nested subgraph
 * using the SAME React Flow + node types as the main canvas, so the hover peek
 * looks like the group physically contains the graph. Nodes can't be dragged,
 * selected or connected, but the view itself pans (drag) and zooms (wheel/pinch).
 * It's mounted only while hovering, so the cost is bounded. Wrapped in its own
 * ReactFlowProvider to isolate it from the parent canvas's store/viewport.
 *
 * Wheel isolation: the wrapper must NOT carry React Flow's `nowheel` class,
 * because the inner flow's own zoom filter rejects any wheel event whose target
 * sits inside `.nowheel` (that made "scroll to zoom" dead). Instead, a native
 * wheel listener on the wrapper stops propagation after the inner flow has
 * handled the event, so the outer canvas never zooms/pans with it.
 */

import { memo, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import { nodeTypes } from './index';

interface PreviewNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}
interface PreviewEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export const GroupSubgraphPreview = memo(function GroupSubgraphPreview({
  nodes,
  edges,
  width = 360,
  height = 240,
}: {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  width?: number;
  height?: number;
}) {
  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n, i) => ({
        id: n.id,
        type: n.type ?? 'default',
        position: n.position ?? { x: (i % 3) * 240, y: Math.floor(i / 3) * 160 },
        data: (n.data ?? {}) as Record<string, unknown>,
        draggable: false,
        selectable: false,
        connectable: false,
      })),
    [nodes]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => ({
        id: e.id ?? `e${i}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    [edges]
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    // Native (not React) listener: the outer canvas's d3-zoom listens natively,
    // and React's synthetic stopPropagation runs too late to stop it.
    const stop = (event: WheelEvent) => event.stopPropagation();
    el.addEventListener('wheel', stop);
    return () => el.removeEventListener('wheel', stop);
  }, [rfNodes.length]);

  if (!rfNodes.length) return null;

  return (
    <div
      ref={wrapperRef}
      style={{ width, height }}
      className="nodrag overflow-hidden rounded-md border border-neutral-800 bg-neutral-950"
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.05}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnScroll={false}
          preventScrolling
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#27272a" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
});
