/**
 * Pure (elk-free) geometry helpers for the tidy/auto-arrange layout.
 *
 * Frames and comments are DECORATIVE — they are excluded from the ELK graph (see
 * layout.ts) so they don't get laid out as ordinary boxes. This module holds the
 * pure logic that runs AFTER elk: it refits each frame around its (now-moved)
 * member nodes and nudges comments to follow their nearest cluster. Kept free of
 * the elkjs import so it can be unit-tested in isolation.
 */
import type { Node } from '@xyflow/react';

export const DEFAULT_WIDTH = 280;
export const DEFAULT_HEIGHT = 160;

// Frame/comment fall-back sizes (mirror FrameNode / CommentNode defaults).
const FRAME_DEFAULT_W = 360;
const FRAME_DEFAULT_H = 240;
const COMMENT_DEFAULT_W = 220;
const COMMENT_DEFAULT_H = 140;

/** Padding kept between a refit frame's edge and its bounded members. */
const FRAME_PADDING = 48;
/** Extra room at the top so the frame's label bar doesn't overlap a member. */
const FRAME_HEADER_PAD = 28;

/** Node types that are decorative and excluded from the ELK graph. */
export const DECORATIVE_TYPES = new Set(['frame', 'comment']);

/**
 * Padding inside a frame CONTAINER (handed to elk as `elk.padding`). Big top to
 * clear the frame's header label; generous sides/bottom for breathing room.
 */
export const CONTAINER_PADDING = { top: 64, left: 40, bottom: 40, right: 40 };

export function isFrame(n: Node): boolean {
  return n.type === 'frame';
}
export function isComment(n: Node): boolean {
  return n.type === 'comment';
}
export function isLayoutNode(n: Node): boolean {
  return !DECORATIVE_TYPES.has(n.type ?? '');
}

interface Size {
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Effective on-screen size of a node (measured > explicit > type default). */
export function nodeSize(n: Node): Size {
  const data = (n.data ?? {}) as { width?: number; height?: number };
  if (isFrame(n)) {
    return {
      width: (n.measured?.width ?? data.width ?? FRAME_DEFAULT_W) as number,
      height: (n.measured?.height ?? data.height ?? FRAME_DEFAULT_H) as number,
    };
  }
  if (isComment(n)) {
    return {
      width: (n.measured?.width ?? data.width ?? COMMENT_DEFAULT_W) as number,
      height: (n.measured?.height ?? data.height ?? COMMENT_DEFAULT_H) as number,
    };
  }
  return {
    width: (n.measured?.width ?? n.width ?? DEFAULT_WIDTH) as number,
    height: (n.measured?.height ?? n.height ?? DEFAULT_HEIGHT) as number,
  };
}

/** Axis-aligned bounding box of a node at a given (possibly new) position. */
function rectAt(n: Node, pos: { x: number; y: number }): Rect {
  const { width, height } = nodeSize(n);
  return { x: pos.x, y: pos.y, width, height };
}

/** Center point of a rect. */
function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Is point `p` inside rect `r` (inclusive)? */
function contains(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * PURE helper: given the ORIGINAL nodes and a map of new positions for the
 * laid-out (non-decorative) nodes, recompute frame positions/sizes so each
 * frame bounds its (now-moved) members, and translate comments by the average
 * delta of their nearest cluster.
 *
 * - Frame membership is computed from ORIGINAL geometry: a non-frame,
 *   non-comment node whose CENTER lies within the frame's original bounds.
 * - A frame with no members is left exactly as-is (object identity preserved).
 * - Decorative nodes are never in the ELK graph, so `laidOut` only carries the
 *   real nodes' new positions; everything else keeps its original position.
 *
 * Returns a NEW array of nodes (same order) with updated positions and frame
 * `data.width`/`data.height` where the FrameNode reads them. Frame `data.zIndex`
 * (backdrop ordering) is preserved untouched.
 */
/**
 * PURE geometry: compute, from ORIGINAL node positions, which real (non-frame,
 * non-comment) nodes belong to which frame. A node belongs to a frame if its
 * CENTER lies within the frame's current bounds. If a node's center is inside
 * more than one frame, the SMALLEST (innermost) frame wins so nested frames
 * behave sensibly. Nodes in no frame are "unframed".
 *
 * Returns:
 *  - `membership`: frameId -> ordered member ids (input order preserved)
 *  - `unframed`: ids of real nodes in no frame
 */
export function computeMembership<N extends Node>(
  nodes: N[]
): { membership: Map<string, string[]>; unframed: string[] } {
  const frames = nodes.filter(isFrame);
  const realNodes = nodes.filter(isLayoutNode);

  const frameRects = new Map<string, Rect>();
  for (const frame of frames) frameRects.set(frame.id, rectAt(frame, frame.position));

  const membership = new Map<string, string[]>();
  for (const frame of frames) membership.set(frame.id, []);
  const unframed: string[] = [];

  for (const n of realNodes) {
    const c = centerOf(rectAt(n, n.position));
    // Choose the smallest-area frame whose bounds contain this node's center.
    let bestId: string | null = null;
    let bestArea = Infinity;
    for (const frame of frames) {
      const r = frameRects.get(frame.id)!;
      if (!contains(r, c)) continue;
      const area = r.width * r.height;
      if (area < bestArea) {
        bestArea = area;
        bestId = frame.id;
      }
    }
    if (bestId) membership.get(bestId)!.push(n.id);
    else unframed.push(n.id);
  }

  return { membership, unframed };
}

/** A laid-out box: position + size. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Result of a hierarchical elk layout, normalized for the pure mapper below.
 * `frames`: frameId -> the container's box (position is RELATIVE to root).
 * `members`: nodeId -> child box (position RELATIVE to its container frame).
 * `unframed`: nodeId -> top-level box (position RELATIVE to root).
 */
export interface HierarchicalElkResult {
  frames: Map<string, LayoutBox>;
  members: Map<string, { frameId: string; box: LayoutBox }>;
  unframed: Map<string, LayoutBox>;
}

/**
 * PURE mapper: translate a hierarchical elk result back into ABSOLUTE node
 * positions for React-Flow.
 *
 * - For each frame container: the frame node gets `position = {container.x,y}`
 *   and `data.width/height = {container.width,height}`.
 * - Each member's absolute position = container origin + child's relative pos.
 * - Unframed top-level nodes get their root-relative position directly.
 * - Comments (decorative, never in elk) are nudged by the average old→new delta
 *   of their nearest cluster so they follow it.
 * - Member-less frames (not in `result.frames`) are left untouched (identity).
 */
export function applyHierarchicalLayout<N extends Node>(
  nodes: N[],
  result: HierarchicalElkResult
): N[] {
  // Absolute new position for each real node we laid out (member or unframed).
  const absolute = new Map<string, { x: number; y: number }>();
  for (const [id, box] of result.unframed) absolute.set(id, { x: box.x, y: box.y });
  for (const [id, { frameId, box }] of result.members) {
    const container = result.frames.get(frameId);
    if (!container) continue;
    absolute.set(id, { x: container.x + box.x, y: container.y + box.y });
  }

  // Reuse refitFrames' comment-nudge by feeding it the absolute real positions:
  // it recomputes frame bounds, but we OVERRIDE frame geometry from elk below,
  // so we only borrow its comment handling. To keep things explicit and avoid
  // double work, compute the comment nudge here directly.
  const frames = nodes.filter(isFrame);
  const realNodes = nodes.filter(isLayoutNode);

  const realDeltas = realNodes
    .map((n) => {
      const p = absolute.get(n.id);
      if (!p) return null;
      return { dx: p.x - n.position.x, dy: p.y - n.position.y, node: n };
    })
    .filter((d): d is { dx: number; dy: number; node: N } => d !== null);

  const globalAvg = realDeltas.length
    ? {
        dx: realDeltas.reduce((s, d) => s + d.dx, 0) / realDeltas.length,
        dy: realDeltas.reduce((s, d) => s + d.dy, 0) / realDeltas.length,
      }
    : { dx: 0, dy: 0 };

  // frameId -> member ids (from ORIGINAL geometry) so we can pick a comment's
  // nearest cluster and average that cluster's deltas.
  const { membership } = computeMembership(nodes);

  function commentDelta(comment: N): { dx: number; dy: number } {
    const cCenter = centerOf(rectAt(comment, comment.position));
    let best: { frameId: string; score: number } | null = null;
    for (const frame of frames) {
      const fRect = rectAt(frame, frame.position);
      const fCenter = centerOf(fRect);
      const dist = Math.hypot(cCenter.x - fCenter.x, cCenter.y - fCenter.y);
      const inside = contains(fRect, cCenter);
      const score = inside ? dist - 1e6 : dist;
      if (!best || score < best.score) best = { frameId: frame.id, score };
    }
    if (best) {
      const memberIds = membership.get(best.frameId) ?? [];
      const memberDeltas = realDeltas.filter((d) => memberIds.includes(d.node.id));
      if (memberDeltas.length) {
        return {
          dx: memberDeltas.reduce((s, d) => s + d.dx, 0) / memberDeltas.length,
          dy: memberDeltas.reduce((s, d) => s + d.dy, 0) / memberDeltas.length,
        };
      }
    }
    return globalAvg;
  }

  return nodes.map((n) => {
    if (isFrame(n)) {
      const box = result.frames.get(n.id);
      if (!box) return n; // member-less frame → untouched (identity)
      return {
        ...n,
        position: { x: box.x, y: box.y },
        // FrameNode reads its box from data.width/height (loadFlow drops
        // top-level RF props); keep zIndex backdrop ordering intact.
        data: { ...n.data, width: box.width, height: box.height },
      };
    }
    if (isComment(n)) {
      const d = commentDelta(n);
      if (d.dx === 0 && d.dy === 0) return n;
      return { ...n, position: { x: n.position.x + d.dx, y: n.position.y + d.dy } };
    }
    const p = absolute.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}

export function refitFrames<N extends Node>(
  nodes: N[],
  laidOut: Map<string, { x: number; y: number }>
): N[] {
  // New position for any node = laid-out position if present, else original.
  const newPos = (n: Node) => laidOut.get(n.id) ?? n.position;

  const frames = nodes.filter(isFrame);
  const realNodes = nodes.filter(isLayoutNode);

  // frameId -> member node ids (computed from ORIGINAL geometry).
  const membership = new Map<string, string[]>();
  for (const frame of frames) {
    const frameRect = rectAt(frame, frame.position);
    const members = realNodes
      .filter((n) => contains(frameRect, centerOf(rectAt(n, n.position))))
      .map((n) => n.id);
    membership.set(frame.id, members);
  }

  // frameId -> recomputed { position, width, height } bounding moved members.
  const refit = new Map<
    string,
    { position: { x: number; y: number }; width: number; height: number }
  >();
  for (const frame of frames) {
    const memberIds = membership.get(frame.id) ?? [];
    if (memberIds.length === 0) continue; // no members → leave frame as-is

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of memberIds) {
      const member = nodes.find((n) => n.id === id);
      if (!member) continue;
      const r = rectAt(member, newPos(member));
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    if (!Number.isFinite(minX)) continue;

    const position = {
      x: minX - FRAME_PADDING,
      y: minY - FRAME_PADDING - FRAME_HEADER_PAD,
    };
    const width = maxX - minX + FRAME_PADDING * 2;
    const height = maxY - minY + FRAME_PADDING * 2 + FRAME_HEADER_PAD;
    refit.set(frame.id, { position, width, height });
  }

  // For comments: nudge by the average delta of the nearest cluster, falling
  // back to the global average delta so a comment never jumps off-screen.
  const realDeltas = realNodes
    .map((n) => {
      const p = laidOut.get(n.id);
      if (!p) return null;
      return { dx: p.x - n.position.x, dy: p.y - n.position.y, node: n };
    })
    .filter((d): d is { dx: number; dy: number; node: N } => d !== null);

  const globalAvg = realDeltas.length
    ? {
        dx: realDeltas.reduce((s, d) => s + d.dx, 0) / realDeltas.length,
        dy: realDeltas.reduce((s, d) => s + d.dy, 0) / realDeltas.length,
      }
    : { dx: 0, dy: 0 };

  /** Average delta of the members of the frame nearest this comment. */
  function commentDelta(comment: N): { dx: number; dy: number } {
    const cCenter = centerOf(rectAt(comment, comment.position));
    let best: { frameId: string; score: number } | null = null;
    for (const frame of frames) {
      const fRect = rectAt(frame, frame.position);
      const fCenter = centerOf(fRect);
      const dist = Math.hypot(cCenter.x - fCenter.x, cCenter.y - fCenter.y);
      const inside = contains(fRect, cCenter);
      const score = inside ? dist - 1e6 : dist; // strongly prefer containment
      if (!best || score < best.score) best = { frameId: frame.id, score };
    }
    if (best) {
      const memberIds = membership.get(best.frameId) ?? [];
      const memberDeltas = realDeltas.filter((d) => memberIds.includes(d.node.id));
      if (memberDeltas.length) {
        return {
          dx: memberDeltas.reduce((s, d) => s + d.dx, 0) / memberDeltas.length,
          dy: memberDeltas.reduce((s, d) => s + d.dy, 0) / memberDeltas.length,
        };
      }
    }
    return globalAvg;
  }

  return nodes.map((n) => {
    if (isFrame(n)) {
      const r = refit.get(n.id);
      if (!r) return n; // no members → unchanged
      return {
        ...n,
        position: r.position,
        // FrameNode reads its box from data.width / data.height; loadFlow drops
        // top-level RF props, so size + zIndex live in data. Keep zIndex intact.
        data: { ...n.data, width: r.width, height: r.height },
      };
    }
    if (isComment(n)) {
      const d = commentDelta(n);
      if (d.dx === 0 && d.dy === 0) return n;
      return { ...n, position: { x: n.position.x + d.dx, y: n.position.y + d.dy } };
    }
    const p = laidOut.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}
