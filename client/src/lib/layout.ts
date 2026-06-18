/**
 * Auto-layout for the node graph using ELK (elkjs). Produces a clean left-to-right
 * layered arrangement from the current nodes + edges. Returns new nodes with updated
 * positions; sizes come from each node's measured dimensions when available so the
 * spacing matches what's actually on screen.
 *
 * Frames and comments are DECORATIVE — they are excluded from the ELK graph so
 * they don't get laid out as ordinary boxes (which would shred a frame's
 * backdrop role and scatter its cluster). Instead the pure `refitFrames` helper
 * (frameLayout.ts) runs AFTER elk to re-bound each frame around its (now-moved)
 * members and nudge comments toward their nearest cluster.
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import { isLayoutNode, nodeSize, refitFrames } from './frameLayout';

const elk = new ELK();

export type LayoutDirection = 'RIGHT' | 'DOWN';

// Re-export the pure helper so callers/tests can reach it from either module.
export { refitFrames } from './frameLayout';

export async function layoutWithElk<N extends Node>(
  nodes: N[],
  edges: Edge[],
  direction: LayoutDirection = 'RIGHT'
): Promise<N[]> {
  if (nodes.length === 0) return nodes;

  // Lay out ONLY the real (non-decorative) nodes; frames + comments are refit
  // afterwards so they keep their backdrop/annotation role.
  const layoutNodes = nodes.filter(isLayoutNode);
  if (layoutNodes.length === 0) return nodes;

  const layoutIds = new Set(layoutNodes.map((n) => n.id));

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      // Preserve the author's rough ordering so the result feels familiar.
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    },
    children: layoutNodes.map((n) => {
      const { width, height } = nodeSize(n);
      return { id: n.id, width, height };
    }),
    edges: edges
      // Only edges between real nodes participate (decorative nodes have no ports).
      .filter((e) => e.source && e.target && layoutIds.has(e.source) && layoutIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const laid = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>(
    (laid.children ?? []).map(
      (c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }] as [string, { x: number; y: number }]
    )
  );

  // Refit frames around moved members and nudge comments (pure, testable).
  return refitFrames(nodes, positions);
}
