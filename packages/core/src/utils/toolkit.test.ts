import { describe, it, expect } from 'vitest';
import { FieldOps } from './field.js';
import { FlowImage } from './image.js';
import { Random } from './random.js';
import { Table } from './table.js';
import { Mcfunction } from './mcfunction.js';
import { toolkitProvider } from '../providers/toolkit.js';

describe('FieldOps', () => {
  const ramp = FieldOps.create(4, 2, (x) => x); // rows: [0,1,2,3]

  it('create/stats/map', () => {
    expect(FieldOps.stats(ramp)).toEqual({ min: 0, max: 3, width: 4, height: 2 });
    expect(FieldOps.map(ramp, (v) => v * 2)[0]).toEqual([0, 2, 4, 6]);
  });

  it('normalize rescales into [0,1] and handles flat fields', () => {
    expect(FieldOps.normalize(ramp)[0]).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(FieldOps.normalize(FieldOps.create(2, 2, 5))[0]).toEqual([0, 0]);
  });

  it('combine defaults to subtraction; add/multiply work', () => {
    const ones = FieldOps.create(4, 2, 1);
    expect(FieldOps.combine(ramp, ones)[0]).toEqual([-1, 0, 1, 2]);
    expect(FieldOps.add(ramp, ones)[0]).toEqual([1, 2, 3, 4]);
    expect(FieldOps.multiply(ramp, ramp)[0]).toEqual([0, 1, 4, 9]);
  });

  it('terrace quantizes into N steps preserving range', () => {
    const terraced = FieldOps.terrace(ramp, 2);
    expect(terraced[0]).toEqual([0, 0, 3, 3]);
  });

  it('sample interpolates bilinearly and clamps', () => {
    expect(FieldOps.sample(ramp, 1.5, 0)).toBeCloseTo(1.5);
    expect(FieldOps.sample(ramp, -5, 0)).toBe(0);
    expect(FieldOps.sample(ramp, 99, 0)).toBe(3);
  });

  it('resize keeps corner values', () => {
    const resized = FieldOps.resize(ramp, 7, 3);
    expect(resized[0][0]).toBeCloseTo(0);
    expect(resized[0][6]).toBeCloseTo(3);
    expect(resized).toHaveLength(3);
  });
});

describe('FlowImage', () => {
  it('fromField paints normalized values through a palette', () => {
    const image = FlowImage.fromField([[0, 1]], 'grayscale');
    expect([image.width, image.height]).toEqual([2, 1]);
    expect(image.getPixel(0, 0).slice(0, 3)).toEqual([0, 0, 0]);
    expect(image.getPixel(1, 0).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it('setPixel/fill manage RGBA bytes', () => {
    const image = FlowImage.create(2, 2).fill(10, 20, 30);
    image.setPixel(1, 1, 200, 100, 50, 128);
    expect(image.getPixel(0, 0)).toEqual([10, 20, 30, 255]);
    expect(image.getPixel(1, 1)).toEqual([200, 100, 50, 128]);
    expect(() => new FlowImage(2, 2, new Uint8ClampedArray(3))).toThrow(/16 bytes/);
  });

  it('viridis/terrain palettes exist', () => {
    expect(FlowImage.palettes()).toEqual(expect.arrayContaining(['viridis', 'terrain', 'magma', 'grayscale']));
  });
});

describe('Random', () => {
  it('hash2/hash3 are deterministic, in [0,1), and position-sensitive', () => {
    expect(Random.hash2(3, 7, 42)).toBe(Random.hash2(3, 7, 42));
    expect(Random.hash2(3, 7, 42)).not.toBe(Random.hash2(7, 3, 42));
    expect(Random.hash2(3, 7, 42)).not.toBe(Random.hash2(3, 7, 43));
    expect(Random.hash3(1, 2, 3)).toBeGreaterThanOrEqual(0);
    expect(Random.hash3(1, 2, 3)).toBeLessThan(1);
  });

  it('seeded RNG reproduces sequences; string seeds work', () => {
    const a = Random.seeded(123);
    const b = Random.seeded(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const s = Random.seeded('castle');
    expect(s()).toBe(Random.seeded('castle')());
  });

  it('pick and shuffle are deterministic under a seeded rng', () => {
    const rng = Random.seeded(7);
    expect(Random.pick([1, 2, 3], Random.seeded(7))).toBe(Random.pick([1, 2, 3], Random.seeded(7)));
    const shuffled = Random.shuffle([1, 2, 3, 4], rng);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('Table', () => {
  it('toCsv escapes and orders columns', () => {
    const csv = Table.toCsv([
      { block: 'minecraft:stone', count: 25 },
      { block: 'has,comma "q"', count: 1 },
    ]);
    expect(csv.split('\n')).toEqual([
      'block,count',
      'minecraft:stone,25',
      '"has,comma ""q""",1',
    ]);
  });

  it('sortBy sorts numerically desc by default', () => {
    const rows = Table.sortBy([{ n: 1 }, { n: 9 }, { n: 4 }], 'n');
    expect(rows.map((r) => r.n)).toEqual([9, 4, 1]);
  });
});

describe('Mcfunction', () => {
  it('builds setblock/fill/display commands', () => {
    const f = Mcfunction.builder()
      .comment('hologram')
      .killTagged('holo')
      .setblock([1, 2, 3], 'minecraft:stone')
      .fill([0, 0, 0], [2, 2, 2], 'minecraft:air')
      .summonBlockDisplay({ x: 0.5, y: 1, z: 0 }, 'minecraft:gold_block', 0.1, 'holo');
    const out = f.toString();
    expect(out).toContain('# hologram');
    expect(out).toContain('kill @e[tag=holo]');
    expect(out).toContain('setblock ~1 ~2 ~3 minecraft:stone');
    expect(out).toContain('fill ~0 ~0 ~0 ~2 ~2 ~2 minecraft:air');
    expect(out).toContain('summon block_display ~ ~ ~ {block_state:{Name:"minecraft:gold_block"}');
    expect(out).toContain('scale:[0.1f,0.1f,0.1f]');
    expect(f.size()).toBe(5);
  });
});

describe('toolkitProvider (context-coupled builders)', () => {
  it('Field.fromNoise uses the Noise endowment; toTerrain paints a schematic', async () => {
    const fakeNoise = { getFractal2D_01: (x: number, z: number) => (x + z) / 10 };
    const set: string[] = [];
    class FakeSchematic {
      set_block(x: number, y: number, z: number, name: string) {
        set.push(`${x},${y},${z}:${name}`);
      }
    }
    const ctx = await toolkitProvider.create({ kind: 'node' }, { Noise: fakeNoise, Schematic: FakeSchematic });
    const Field = ctx.Field as Record<string, (...args: unknown[]) => unknown>;

    const field = Field.fromNoise(3, 2) as number[][];
    expect(field[1][2]).toBeCloseTo(0.3);

    Field.toTerrain([[0, 1]], { maxHeight: 3, surface: 's', fill: 'f' });
    // column 0 (height 1): just surface; column 1 (height 3): two fill + surface
    expect(set).toEqual(['0,0,0:s', '1,0,0:f', '1,1,0:f', '1,2,0:s']);
  });

  it('errors helpfully without the upstream providers', async () => {
    const ctx = await toolkitProvider.create({ kind: 'node' }, {});
    const Field = ctx.Field as Record<string, (...args: unknown[]) => unknown>;
    expect(() => Field.fromNoise(2, 2)).toThrow(/Noise provider/);
    expect(() => Field.toTerrain([[1]])).toThrow(/nucleation provider/);
  });
});
