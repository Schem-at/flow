import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  refitFrames,
  computeMembership,
  applyHierarchicalLayout,
  type HierarchicalElkResult,
} from './frameLayout';

/** Build a node with a measured size so geometry is deterministic. */
function node(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Record<string, unknown> = {}
): Node {
  return {
    id,
    type,
    position: { x, y },
    data,
    measured: { width, height },
  } as Node;
}

describe('refitFrames', () => {
  it('re-bounds a frame around its 2 members after they move', () => {
    // Frame originally spans (0,0)..(400,400). Two members inside it.
    const frame = node('fr', 'frame', 0, 0, 400, 400, { width: 400, height: 400, zIndex: -1 });
    const a = node('a', 'default', 50, 50, 100, 60);   // center (100,80) ∈ frame
    const b = node('b', 'default', 200, 200, 100, 60);  // center (250,230) ∈ frame

    // Members move far to the right/down.
    const laidOut = new Map([
      ['a', { x: 600, y: 500 }],
      ['b', { x: 800, y: 700 }],
    ]);

    const out = refitFrames([frame, a, b], laidOut);
    const outFrame = out.find((n) => n.id === 'fr')!;
    const fdata = outFrame.data as { width: number; height: number; zIndex: number };

    // a now (600,500)+100x60 → right edge 700, bottom 560
    // b now (800,700)+100x60 → right edge 900, bottom 760
    // members bbox: x 600..900, y 500..760
    // PADDING=48, HEADER_PAD=28
    expect(outFrame.position.x).toBe(600 - 48);
    expect(outFrame.position.y).toBe(500 - 48 - 28);
    expect(fdata.width).toBe(900 - 600 + 48 * 2);
    expect(fdata.height).toBe(760 - 500 + 48 * 2 + 28);

    // The frame must actually contain both moved members.
    expect(outFrame.position.x).toBeLessThanOrEqual(600);
    expect(outFrame.position.x + fdata.width).toBeGreaterThanOrEqual(900);
    expect(outFrame.position.y).toBeLessThanOrEqual(500);
    expect(outFrame.position.y + fdata.height).toBeGreaterThanOrEqual(760);

    // zIndex backdrop ordering preserved.
    expect(fdata.zIndex).toBe(-1);
  });

  it('leaves a frame with no members untouched', () => {
    const frame = node('fr', 'frame', 1000, 1000, 300, 200, { width: 300, height: 200 });
    const a = node('a', 'default', 0, 0, 100, 60); // center (50,30) NOT in frame

    const laidOut = new Map([['a', { x: 10, y: 10 }]]);
    const out = refitFrames([frame, a], laidOut);
    const outFrame = out.find((n) => n.id === 'fr')!;

    // Position and size unchanged (object identity preserved → no members).
    expect(outFrame).toBe(frame);
    expect(outFrame.position).toEqual({ x: 1000, y: 1000 });
    expect((outFrame.data as { width: number }).width).toBe(300);
  });

  it('moves real members to their laid-out positions', () => {
    const a = node('a', 'default', 0, 0, 100, 60);
    const laidOut = new Map([['a', { x: 333, y: 444 }]]);
    const out = refitFrames([a], laidOut);
    expect(out.find((n) => n.id === 'a')!.position).toEqual({ x: 333, y: 444 });
  });

  it('comments are not part of the laid-out map (excluded from elk) and stay on-screen', () => {
    // A comment that was inside the frame should follow the cluster's avg delta,
    // never receiving an elk position of its own.
    const frame = node('fr', 'frame', 0, 0, 400, 400, { width: 400, height: 400 });
    const a = node('a', 'default', 50, 50, 100, 60); // member, center (100,80)
    const cm = node('cm', 'comment', 150, 150, 120, 80, { width: 120, height: 80 });

    // Only the REAL node 'a' is in the laidOut map (comment excluded from elk).
    const laidOut = new Map([['a', { x: 250, y: 50 }]]); // dx=+200, dy=0

    const out = refitFrames([frame, a, cm], laidOut);
    const outCm = out.find((n) => n.id === 'cm')!;

    // Comment nudged by the nearest cluster's avg delta (dx=+200, dy=0).
    expect(outCm.position).toEqual({ x: 350, y: 150 });
    // Still finite / on-screen-ish, not NaN.
    expect(Number.isFinite(outCm.position.x)).toBe(true);
    expect(Number.isFinite(outCm.position.y)).toBe(true);
  });
});

describe('computeMembership', () => {
  it('assigns real nodes to the frame containing their center; others unframed', () => {
    const f1 = node('f1', 'frame', 0, 0, 400, 400, { width: 400, height: 400 });
    const f2 = node('f2', 'frame', 1000, 0, 400, 400, { width: 400, height: 400 });
    const a = node('a', 'default', 50, 50, 100, 60); // center (100,80) ∈ f1
    const b = node('b', 'default', 1050, 50, 100, 60); // center (1100,80) ∈ f2
    const c = node('c', 'default', 600, 600, 100, 60); // center (650,630) unframed

    const { membership, unframed } = computeMembership([f1, f2, a, b, c]);
    expect(membership.get('f1')).toEqual(['a']);
    expect(membership.get('f2')).toEqual(['b']);
    expect(unframed).toEqual(['c']);
  });

  it('picks the smallest (innermost) frame when frames nest', () => {
    const outer = node('outer', 'frame', 0, 0, 800, 800, { width: 800, height: 800 });
    const inner = node('inner', 'frame', 100, 100, 200, 200, { width: 200, height: 200 });
    const a = node('a', 'default', 150, 150, 40, 40); // center (170,170) ∈ both

    const { membership } = computeMembership([outer, inner, a]);
    expect(membership.get('inner')).toEqual(['a']);
    expect(membership.get('outer')).toEqual([]);
  });
});

describe('applyHierarchicalLayout', () => {
  // Two frames whose members would interleave in a FLAT layout. With the
  // container approach elk gives each frame a disjoint container rect; the
  // mapper must produce non-overlapping frame rects with padding around members.
  const f1 = node('f1', 'frame', 0, 0, 400, 400, { width: 400, height: 400, zIndex: -1 });
  const f2 = node('f2', 'frame', 50, 50, 400, 400, { width: 400, height: 400 });
  const a = node('a', 'default', 10, 10, 100, 60); // center (60,40) ∈ f1
  const b = node('b', 'default', 60, 60, 100, 60); // center (110,90) ∈ f2 (smaller? equal area → first wins)
  const cm = node('cm', 'comment', 200, 200, 120, 80, { width: 120, height: 80 });

  // Build a synthetic elk result: two disjoint containers, each holding 1 member
  // with the 64/40/40/40 padding baked into container size and child offset.
  const result: HierarchicalElkResult = {
    frames: new Map([
      ['f1', { x: 0, y: 0, width: 180, height: 164 }], // padding 40+40 around 100x60, top 64
      ['f2', { x: 400, y: 0, width: 180, height: 164 }],
    ]),
    members: new Map([
      ['a', { frameId: 'f1', box: { x: 40, y: 64, width: 100, height: 60 } }],
      ['b', { frameId: 'f2', box: { x: 40, y: 64, width: 100, height: 60 } }],
    ]),
    unframed: new Map(),
  };

  it('maps members to absolute positions = container origin + child offset', () => {
    const out = applyHierarchicalLayout([f1, f2, a, b, cm], result);
    const oa = out.find((n) => n.id === 'a')!;
    const ob = out.find((n) => n.id === 'b')!;
    expect(oa.position).toEqual({ x: 0 + 40, y: 0 + 64 });
    expect(ob.position).toEqual({ x: 400 + 40, y: 0 + 64 });
  });

  it('produces NON-OVERLAPPING frame rects with padding around members', () => {
    const out = applyHierarchicalLayout([f1, f2, a, b, cm], result);
    const of1 = out.find((n) => n.id === 'f1')!;
    const of2 = out.find((n) => n.id === 'f2')!;
    const d1 = of1.data as { width: number; height: number; zIndex: number };
    const d2 = of2.data as { width: number; height: number };

    // Frame node takes the container's position + size.
    expect(of1.position).toEqual({ x: 0, y: 0 });
    expect(of2.position).toEqual({ x: 400, y: 0 });
    expect(d1.width).toBe(180);
    expect(d2.width).toBe(180);

    // The two frame rects do NOT overlap on the x-axis.
    const f1Right = of1.position.x + d1.width; // 180
    expect(f1Right).toBeLessThanOrEqual(of2.position.x); // 180 <= 400

    // Padding: member 'a' sits inside f1 with 40px left and 64px top inset.
    const oa = out.find((n) => n.id === 'a')!;
    expect(oa.position.x - of1.position.x).toBe(40);
    expect(oa.position.y - of1.position.y).toBe(64);

    // zIndex preserved.
    expect(d1.zIndex).toBe(-1);
  });

  it("keeps a cross-frame edge's endpoints inside their own containers", () => {
    const out = applyHierarchicalLayout([f1, f2, a, b, cm], result);
    const of1 = out.find((n) => n.id === 'f1')!;
    const of2 = out.find((n) => n.id === 'f2')!;
    const oa = out.find((n) => n.id === 'a')!; // edge source in f1
    const ob = out.find((n) => n.id === 'b')!; // edge target in f2
    const d1 = of1.data as { width: number; height: number };
    const d2 = of2.data as { width: number; height: number };

    const within = (frame: typeof of1, w: number, h: number, n: typeof oa, nw: number, nh: number) =>
      n.position.x >= frame.position.x &&
      n.position.x + nw <= frame.position.x + w &&
      n.position.y >= frame.position.y &&
      n.position.y + nh <= frame.position.y + h;

    expect(within(of1, d1.width, d1.height, oa, 100, 60)).toBe(true);
    expect(within(of2, d2.width, d2.height, ob, 100, 60)).toBe(true);
  });

  it('nudges a comment by its nearest cluster delta', () => {
    const out = applyHierarchicalLayout([f1, f2, a, b, cm], result);
    const ocm = out.find((n) => n.id === 'cm')!;
    // Comment moved (not left at origin) and stays finite.
    expect(Number.isFinite(ocm.position.x)).toBe(true);
    expect(Number.isFinite(ocm.position.y)).toBe(true);
    expect(ocm.position).not.toEqual({ x: 200, y: 200 });
  });

  it('leaves a member-less frame untouched (identity preserved)', () => {
    const lonely = node('lonely', 'frame', 2000, 2000, 300, 200, { width: 300, height: 200 });
    const out = applyHierarchicalLayout([f1, f2, a, b, lonely], result);
    const ol = out.find((n) => n.id === 'lonely')!;
    expect(ol).toBe(lonely);
    expect(ol.position).toEqual({ x: 2000, y: 2000 });
  });
});
