import { describe, it, expect } from 'vitest';
import { Calculator } from './calculator.js';
import { GridOps } from './grid.js';
import { Combinatorics } from './combinatorics.js';
import { FlowImage } from './image.js';
import { createNoiseProvider } from './noise.js';

describe('Calculator additions', () => {
  it('quantize snaps into steps', () => {
    expect(Calculator.quantize(0.37, 4)).toBe(0.25);
    expect(Calculator.quantize(0.9, 1)).toBe(1);
  });
  it('roundTo rounds to digits', () => {
    expect(Calculator.roundTo(3.14159, 2)).toBe(3.14);
    expect(Calculator.roundTo(12.4, 0)).toBe(12);
  });
});

describe('GridOps', () => {
  it('create with value and fn', () => {
    expect(GridOps.create(2, 3, 0)).toEqual([[0, 0, 0], [0, 0, 0]]);
    const g = GridOps.create(2, 2, (x, z) => x * 10 + z);
    expect(g[1][1]).toBe(11);
  });
  it('inBounds + neighbors4 respect edges', () => {
    const g = GridOps.create(3, 3, 0);
    expect(GridOps.inBounds(g, 2, 2)).toBe(true);
    expect(GridOps.inBounds(g, 3, 0)).toBe(false);
    expect(GridOps.neighbors4(g, 0, 0)).toHaveLength(2); // corner
    expect(GridOps.neighbors4(g, 1, 1)).toHaveLength(4); // center
  });
  it('bfs finds a path around a wall', () => {
    // 3x3 open except a wall column at x=1 for z=0,1 (gap at z=2)
    const wall = new Set(['1,0', '1,1']);
    const g = GridOps.create(3, 3, 0);
    const path = GridOps.bfs(g, { x: 0, z: 0 }, { x: 2, z: 0 }, (x, z) => !wall.has(`${x},${z}`));
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, z: 0 });
    expect(path![path!.length - 1]).toEqual({ x: 2, z: 0 });
    // must detour through z=2 since z=0/1 are walled at x=1
    expect(path!.some((c) => c.z === 2)).toBe(true);
  });
  it('bfs returns null when unreachable', () => {
    const g = GridOps.create(3, 1, 0);
    const blocked = GridOps.bfs(g, { x: 0, z: 0 }, { x: 2, z: 0 }, (x) => x !== 1);
    expect(blocked).toBeNull();
  });
});

describe('Combinatorics', () => {
  it('booleanCombos enumerates 2^n rows', () => {
    expect(Combinatorics.booleanCombos(1)).toEqual([[false], [true]]);
    expect(Combinatorics.booleanCombos(2)).toHaveLength(4);
    expect(Combinatorics.booleanCombos(3)).toHaveLength(8);
  });
  it('cartesian general form', () => {
    expect(Combinatorics.cartesian([0, 1, 2], 2)).toHaveLength(9);
  });
});

describe('Image additions', () => {
  it('blank makes a >=1x1 image', () => {
    expect(FlowImage.blank().width).toBe(1);
    expect(FlowImage.blank(4, 2).data.length).toBe(4 * 2 * 4);
  });
  it('ramp interpolates between stops', () => {
    const stops: Array<[number, number, number]> = [[0, 0, 0], [255, 255, 255]];
    expect(FlowImage.ramp(stops, 0)).toEqual([0, 0, 0]);
    expect(FlowImage.ramp(stops, 1)).toEqual([255, 255, 255]);
    expect(FlowImage.ramp(stops, 0.5)).toEqual([128, 128, 128]);
  });
});

describe('Noise.worley', () => {
  it('is deterministic for a seed and in [0,1]', () => {
    const a = createNoiseProvider('abc');
    const b = createNoiseProvider('abc');
    const va = a.worley(3.3, 7.1, { frequency: 0.5 });
    expect(va).toBe(b.worley(3.3, 7.1, { frequency: 0.5 }));
    expect(va).toBeGreaterThanOrEqual(0);
    expect(va).toBeLessThanOrEqual(1);
  });
  it('differs across seeds', () => {
    const a = createNoiseProvider('seed-a');
    const b = createNoiseProvider('seed-b');
    const sampleSum = (n: ReturnType<typeof createNoiseProvider>) => {
      let s = 0;
      for (let i = 0; i < 20; i++) s += n.worley(i * 0.7, i * 0.3);
      return s;
    };
    expect(sampleSum(a)).not.toBe(sampleSum(b));
  });
});
