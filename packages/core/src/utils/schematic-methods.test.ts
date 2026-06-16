import { describe, it, expect, beforeEach } from 'vitest';
import { installSchematicMethods, AIR, type SchematicCore } from './schematic-methods.js';

/** Minimal in-memory Schematic implementing the primitive surface. */
class FakeSchematic implements SchematicCore {
  store = new Map<string, string>();
  set_block(x: number, y: number, z: number, name: string) { this.store.set(`${x},${y},${z}`, name); }
  get_block(x: number, y: number, z: number) { return this.store.get(`${x},${y},${z}`) ?? null; }
  blocks(options?: { includeAir?: boolean }) {
    const out: Array<{ x: number; y: number; z: number; name: string }> = [];
    for (const [k, name] of this.store) {
      if (!options?.includeAir && name === AIR) continue;
      const [x, y, z] = k.split(',').map(Number);
      out.push({ x, y, z, name });
    }
    return out;
  }
  get_dimensions() {
    let w = 0, h = 0, d = 0;
    for (const k of this.store.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      w = Math.max(w, x + 1); h = Math.max(h, y + 1); d = Math.max(d, z + 1);
    }
    return [w, h, d];
  }
  from_data() { /* no-op for the fake */ }
}

installSchematicMethods(FakeSchematic as any);
type S = FakeSchematic & Record<string, any>;
const mk = () => new FakeSchematic() as S;

describe('schematic fills', () => {
  let s: S;
  beforeEach(() => { s = mk(); });

  it('fill makes a solid box and is order-independent', () => {
    s.fill(2, 0, 0, 0, 1, 1, 'stone');
    expect(s.blocks()).toHaveLength(3 * 2 * 2);
    expect(s.get_block(1, 1, 1)).toBe('stone');
  });

  it('fillColumn / fillPlane', () => {
    mk().fillColumn(0, 0, 0, 4, 'dirt');
    s.fillColumn(0, 0, 0, 4, 'dirt');
    expect(s.blocks()).toHaveLength(5);
    const p = mk(); p.fillPlane(0, 0, 2, 2, 3, 'grass');
    expect(p.blocks()).toHaveLength(9);
    expect(p.get_block(1, 3, 1)).toBe('grass');
  });

  it('hollowBox leaves the interior empty', () => {
    s.hollowBox(0, 0, 0, 2, 2, 2, 'glass');
    expect(s.get_block(1, 1, 1)).toBeNull();          // center hollow
    expect(s.get_block(0, 0, 0)).toBe('glass');        // corner present
    expect(s.blocks()).toHaveLength(27 - 1);
  });

  it('walls has no roof or floor interior', () => {
    s.walls(0, 0, 0, 2, 1, 2, 'brick');
    expect(s.get_block(1, 0, 1)).toBeNull();           // floor interior open
    expect(s.get_block(0, 0, 1)).toBe('brick');        // wall
  });

  it('rectOutline draws a single-Y perimeter', () => {
    s.rectOutline(0, 0, 2, 2, 5, 'fence');
    expect(s.blocks()).toHaveLength(8);                // 3x3 perimeter
    expect(s.get_block(1, 5, 1)).toBeNull();
  });

  it('line connects two points contiguously', () => {
    s.line(0, 0, 0, 5, 0, 0, 'wire');
    expect(s.blocks()).toHaveLength(6);
    const diag = mk(); diag.line(0, 0, 0, 3, 3, 3, 'wire');
    expect(diag.get_block(0, 0, 0)).toBe('wire');
    expect(diag.get_block(3, 3, 3)).toBe('wire');
  });

  it('sphere and cylinder place blocks', () => {
    s.sphere(5, 5, 5, 3, 'wool');
    expect(s.get_block(5, 5, 5)).toBe('wool');
    const c = mk(); c.cylinder(0, 0, 0, 2, 4, 'log');
    expect(c.get_block(0, 3, 0)).toBe('log');
  });
});

describe('schematic compose', () => {
  it('paste copies at an offset', () => {
    const a = mk(); a.set_block(0, 0, 0, 'stone');
    const b = mk(); b.paste(a, 5, 0, 0);
    expect(b.get_block(5, 0, 0)).toBe('stone');
  });

  it('merge skips air by default', () => {
    const a = mk(); a.set_block(0, 0, 0, 'stone'); a.set_block(1, 0, 0, AIR);
    const b = mk(); b.merge(a);
    expect(b.get_block(0, 0, 0)).toBe('stone');
    expect(b.get_block(1, 0, 0)).toBeNull();
    const c = mk(); c.merge(a, { skipAir: false });
    expect(c.get_block(1, 0, 0)).toBe(AIR);
  });

  it('clone produces an independent copy', () => {
    const a = mk(); a.fill(0, 0, 0, 2, 0, 0, 'stone');
    const b = a.clone();
    b.set_block(0, 0, 0, 'gold');
    expect(a.get_block(0, 0, 0)).toBe('stone');
    expect(b.get_block(0, 0, 0)).toBe('gold');
    expect(b.get_block(2, 0, 0)).toBe('stone');
  });

  it('stack / repeatY repeat with offset', () => {
    const tile = mk(); tile.set_block(0, 0, 0, 'a');
    const s = mk(); s.stack(tile, 3, [2, 0, 0]);
    expect(s.get_block(0, 0, 0)).toBe('a');
    expect(s.get_block(2, 0, 0)).toBe('a');
    expect(s.get_block(4, 0, 0)).toBe('a');
    const y = mk(); y.repeatY(tile, 2, 5);
    expect(y.get_block(0, 5, 0)).toBe('a');
  });
});

describe('schematic transforms', () => {
  it('mirror twice is identity (and preserves block count)', () => {
    const a = mk(); a.set_block(0, 0, 0, 'stone'); a.set_block(2, 0, 0, 'gold');
    const back = a.mirror('x').mirror('x');
    expect(back.get_block(0, 0, 0)).toBe('stone');
    expect(back.get_block(2, 0, 0)).toBe('gold');
  });

  it('rotate 4x90 is identity', () => {
    const a = mk(); a.set_block(0, 0, 0, 'stone'); a.set_block(3, 0, 1, 'gold');
    let r: S = a;
    for (let i = 0; i < 4; i++) r = r.rotate(90);
    expect(r.get_block(0, 0, 0)).toBe('stone');
    expect(r.get_block(3, 0, 1)).toBe('gold');
  });
});

describe('schematic queries', () => {
  it('blockCounts tallies by name', () => {
    const s = mk(); s.fill(0, 0, 0, 2, 0, 0, 'stone'); s.set_block(0, 1, 0, 'gold');
    const counts = s.blockCounts();
    expect(counts.get('stone')).toBe(3);
    expect(counts.get('gold')).toBe(1);
  });

  it('heightmap reports top non-air per column', () => {
    const s = mk(); s.fillColumn(0, 0, 0, 4, 'dirt'); s.set_block(0, 4, 0, 'grass');
    const { height, surface } = s.heightmap();
    expect(height[0][0]).toBe(4);
    expect(surface[0][0]).toBe('grass');
  });

  it('bounds exposes named dimensions', () => {
    const s = mk(); s.set_block(3, 1, 2, 'stone');
    expect(s.bounds).toMatchObject({ width: 4, height: 2, depth: 3 });
  });
});

describe('schematic statics', () => {
  it('isSchematic recognises instances', () => {
    expect((FakeSchematic as any).isSchematic(mk())).toBe(true);
    expect((FakeSchematic as any).isSchematic({})).toBe(false);
  });

  it('tileGrid uniform spaces by the largest cell', () => {
    const t1 = mk(); t1.set_block(0, 0, 0, 'a');
    const t2 = mk(); t2.fill(0, 0, 0, 1, 0, 1, 'b'); // 2x2 footprint
    const grid = (FakeSchematic as any).tileGrid([[t1, t2]], { spacing: 1, mode: 'uniform' }) as S;
    // cellW = cellD = 2, spacing 1 → second tile starts at x = 3
    expect(grid.get_block(0, 0, 0)).toBe('a');
    expect(grid.get_block(3, 0, 0)).toBe('b');
  });

  it('tileGrid packed advances by each tile width', () => {
    const t1 = mk(); t1.set_block(0, 0, 0, 'a');           // width 1
    const t2 = mk(); t2.set_block(0, 0, 0, 'b');           // width 1
    const grid = (FakeSchematic as any).tileGrid([[t1, t2]], { spacing: 0, mode: 'packed' }) as S;
    expect(grid.get_block(0, 0, 0)).toBe('a');
    expect(grid.get_block(1, 0, 0)).toBe('b');
  });
});
