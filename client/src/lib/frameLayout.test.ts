import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { refitFrames } from './frameLayout';

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
