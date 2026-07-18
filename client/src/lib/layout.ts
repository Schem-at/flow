/**
 * Auto-layout for the node graph using ELK (elkjs). Produces a clean layered
 * arrangement from the current nodes + edges.
 *
 * FRAMES are respected as CONTAINERS: each frame that has members becomes an elk
 * container whose member nodes are laid out INSIDE it (with padding), and elk
 * arranges the frame containers relative to each other so they DON'T OVERLAP.
 * Unframed real nodes are laid out as ordinary top-level nodes. Comments are
 * decorative — excluded from the elk graph and nudged toward their nearest
 * cluster afterwards (see applyHierarchicalLayout in frameLayout.ts).
 *
 * elk gives container positions relative to root and each child's position
 * relative to its container; the pure `applyHierarchicalLayout` helper maps
 * those back to ABSOLUTE React-Flow positions.
 */
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import {
  isLayoutNode,
  nodeSize,
  computeMembership,
  applyHierarchicalLayout,
  CONTAINER_PADDING,
  type HierarchicalElkResult,
  type LayoutBox,
} from './frameLayout';

const elk = new ELK();

export type LayoutDirection = 'RIGHT' | 'DOWN';

// Re-export the pure helpers so callers/tests can reach them from either module.
export { refitFrames, applyHierarchicalLayout, computeMembership } from './frameLayout';

const PAD = CONTAINER_PADDING;
const PADDING_STR = `[top=${PAD.top},left=${PAD.left},bottom=${PAD.bottom},right=${PAD.right}]`;

export async function layoutWithElk<N extends Node>(
  nodes: N[],
  edges: Edge[],
  direction: LayoutDirection = 'RIGHT'
): Promise<N[]> {
  if (nodes.length === 0) return nodes;

  // Only real (non-decorative) nodes are laid out; frames become containers and
  // comments are nudged afterwards.
  const layoutNodes = nodes.filter(isLayoutNode);
  if (layoutNodes.length === 0) return nodes;

  const layoutIds = new Set(layoutNodes.map((n) => n.id));
  const sizeById = new Map(layoutNodes.map((n) => [n.id, nodeSize(n)] as const));

  // Geometry-based membership from CURRENT positions.
  const { membership, unframed } = computeMembership(nodes);

  // Build one elk container per frame THAT HAS members.
  const frameContainers: ElkNode[] = [];
  const containerFrameIds: string[] = [];
  for (const [frameId, memberIds] of membership) {
    if (memberIds.length === 0) continue;
    containerFrameIds.push(frameId);
    frameContainers.push({
      id: frameId,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        'elk.padding': PADDING_STR,
        'elk.spacing.nodeNode': '48',
        'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      },
      children: memberIds.map((id) => {
        const s = sizeById.get(id) ?? { width: 280, height: 160 };
        return { id, width: s.width, height: s.height };
      }),
    });
  }

  // Unframed real nodes are top-level siblings of the frame containers.
  const unframedNodes: ElkNode[] = unframed.map((id) => {
    const s = sizeById.get(id) ?? { width: 280, height: 160 };
    return { id, width: s.width, height: s.height };
  });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      // Route cross-frame edges through the hierarchy.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // Preserve the author's rough ordering so the result feels familiar.
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Clear separation BETWEEN frame containers / top-level nodes.
      'elk.spacing.nodeNode': '120',
      'elk.layered.spacing.nodeNodeBetweenLayers': '160',
    },
    children: [...frameContainers, ...unframedNodes],
    // All edges between real nodes live at the ROOT level; INCLUDE_CHILDREN
    // lets elk route them across containers.
    edges: edges
      .filter((e) => e.source && e.target && layoutIds.has(e.source) && layoutIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const laid = await elk.layout(graph);

  // Normalize elk's nested result into the shape the pure mapper expects.
  const frames = new Map<string, LayoutBox>();
  const members = new Map<string, { frameId: string; box: LayoutBox }>();
  const unframedBoxes = new Map<string, LayoutBox>();
  const containerSet = new Set(containerFrameIds);

  for (const child of laid.children ?? []) {
    const box: LayoutBox = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 0,
      height: child.height ?? 0,
    };
    if (containerSet.has(child.id)) {
      frames.set(child.id, box);
      for (const member of child.children ?? []) {
        members.set(member.id, {
          frameId: child.id,
          box: {
            x: member.x ?? 0,
            y: member.y ?? 0,
            width: member.width ?? 0,
            height: member.height ?? 0,
          },
        });
      }
    } else {
      unframedBoxes.set(child.id, box);
    }
  }

  const result: HierarchicalElkResult = { frames, members, unframed: unframedBoxes };
  return applyHierarchicalLayout(nodes, result);
}
