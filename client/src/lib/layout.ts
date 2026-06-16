/**
 * Auto-layout for the node graph using ELK (elkjs). Produces a clean left-to-right
 * layered arrangement from the current nodes + edges. Returns new nodes with updated
 * positions; sizes come from each node's measured dimensions when available so the
 * spacing matches what's actually on screen.
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 160;

export type LayoutDirection = 'RIGHT' | 'DOWN';

export async function layoutWithElk<N extends Node>(
  nodes: N[],
  edges: Edge[],
  direction: LayoutDirection = 'RIGHT'
): Promise<N[]> {
  if (nodes.length === 0) return nodes;

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
    children: nodes.map((n) => ({
      id: n.id,
      width: (n.measured?.width ?? n.width ?? DEFAULT_WIDTH) as number,
      height: (n.measured?.height ?? n.height ?? DEFAULT_HEIGHT) as number,
    })),
    edges: edges
      .filter((e) => e.source && e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const laid = await elk.layout(graph);
  const positions = new Map(
    (laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])
  );

  return nodes.map((n) => {
    const p = positions.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}
