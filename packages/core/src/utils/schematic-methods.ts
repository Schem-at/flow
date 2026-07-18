/**
 * Ergonomic schematic methods, installed onto the nucleation Schematic prototype
 * (and constructor) by the nucleation provider. Kept separate from the provider so
 * they can be unit-tested against a lightweight in-memory fake without loading WASM.
 *
 * Every method here is a thin convenience over the primitive `set_block` /
 * `blocks()` / `get_dimensions()` surface — this is the DX layer that stops node
 * authors hand-rolling fill loops, copy loops, heightmaps and mosaics.
 */

export interface SchematicCore {
  set_block(x: number, y: number, z: number, name: string): void;
  get_block(x: number, y: number, z: number): string | null;
  blocks(options?: { includeAir?: boolean }): Array<{ x: number; y: number; z: number; name: string }>;
  get_dimensions(): number[] | Int32Array;
  from_data?(data: Uint8Array): void;
}

export const AIR = 'minecraft:air';

type Ctor = { new (): SchematicCore; prototype: Record<string, unknown> } & Record<string, unknown>;

function dims(s: SchematicCore): { w: number; h: number; d: number } {
  const raw = s.get_dimensions();
  return { w: raw[0] | 0, h: raw[1] | 0, d: raw[2] | 0 };
}

/** Patch the ergonomic instance methods + static factories onto a Schematic class. */
export function installSchematicMethods(SchematicClass: Ctor): void {
  const proto = SchematicClass.prototype as Record<string, unknown>;
  const make = () => new SchematicClass();

  // ── Region fills ─────────────────────────────────────────────────────────
  proto.fill = function (this: SchematicCore, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string) {
    const [minX, maxX] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [minY, maxY] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [minZ, maxZ] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++) this.set_block(x, y, z, block);
    return this;
  };

  proto.fillColumn = function (this: SchematicCore & { fill: any }, x: number, z: number, y0: number, y1: number, block: string) {
    return this.fill(x, y0, z, x, y1, z, block);
  };

  proto.fillPlane = function (this: SchematicCore & { fill: any }, x0: number, z0: number, x1: number, z1: number, y: number, block: string) {
    return this.fill(x0, y, z0, x1, y, z1, block);
  };

  // ── Outlines / shells ────────────────────────────────────────────────────
  proto.hollowBox = function (this: SchematicCore, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string) {
    const [minX, maxX] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [minY, maxY] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [minZ, maxZ] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++) {
          if (x === minX || x === maxX || y === minY || y === maxY || z === minZ || z === maxZ)
            this.set_block(x, y, z, block);
        }
    return this;
  };

  /** Four vertical walls (no floor or roof). */
  proto.walls = function (this: SchematicCore, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string) {
    const [minX, maxX] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [minY, maxY] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [minZ, maxZ] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++) {
          if (x === minX || x === maxX || z === minZ || z === maxZ) this.set_block(x, y, z, block);
        }
    return this;
  };

  /** Single-Y rectangle perimeter. */
  proto.rectOutline = function (this: SchematicCore, x0: number, z0: number, x1: number, z1: number, y: number, block: string) {
    const [minX, maxX] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [minZ, maxZ] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        if (x === minX || x === maxX || z === minZ || z === maxZ) this.set_block(x, y, z, block);
      }
    return this;
  };

  // ── Line (3D Bresenham) ──────────────────────────────────────────────────
  proto.line = function (this: SchematicCore, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string) {
    let [x, y, z] = [x0 | 0, y0 | 0, z0 | 0];
    const [ex, ey, ez] = [x1 | 0, y1 | 0, z1 | 0];
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y), dz = Math.abs(ez - z);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1, sz = z < ez ? 1 : -1;
    const dm = Math.max(dx, dy, dz);
    let px = dm / 2, py = dm / 2, pz = dm / 2;
    this.set_block(x, y, z, block);
    for (let i = 0; i < dm; i++) {
      px -= dx; if (px < 0) { px += dm; x += sx; }
      py -= dy; if (py < 0) { py += dm; y += sy; }
      pz -= dz; if (pz < 0) { pz += dm; z += sz; }
      this.set_block(x, y, z, block);
    }
    return this;
  };

  // ── Primitives ───────────────────────────────────────────────────────────
  proto.sphere = function (this: SchematicCore, cx: number, cy: number, cz: number, radius: number, block: string, hollow = false) {
    const r2 = radius * radius, inner = hollow ? (radius - 1) * (radius - 1) : 0;
    for (let x = -radius; x <= radius; x++)
      for (let y = -radius; y <= radius; y++)
        for (let z = -radius; z <= radius; z++) {
          const d2 = x * x + y * y + z * z;
          if (d2 <= r2 && (!hollow || d2 >= inner)) this.set_block(cx + x, cy + y, cz + z, block);
        }
    return this;
  };

  proto.cylinder = function (this: SchematicCore, cx: number, cy: number, cz: number, radius: number, height: number, block: string, hollow = false) {
    const r2 = radius * radius, inner = hollow ? (radius - 1) * (radius - 1) : 0;
    for (let x = -radius; x <= radius; x++)
      for (let z = -radius; z <= radius; z++) {
        const d2 = x * x + z * z;
        if (d2 <= r2 && (!hollow || d2 >= inner))
          for (let y = 0; y < height; y++) this.set_block(cx + x, cy + y, cz + z, block);
      }
    return this;
  };

  // ── Copy / compose ───────────────────────────────────────────────────────
  /** Copy another schematic's blocks into this one at an offset. */
  proto.paste = function (this: SchematicCore, other: SchematicCore, dx = 0, dy = 0, dz = 0) {
    for (const b of other.blocks()) this.set_block(b.x + dx, b.y + dy, b.z + dz, b.name);
    return this;
  };

  /** Paste with options — `at` offset and `skipAir` (default true). */
  proto.merge = function (this: SchematicCore, other: SchematicCore, options: { at?: [number, number, number]; skipAir?: boolean } = {}) {
    const [ax, ay, az] = options.at ?? [0, 0, 0];
    const skipAir = options.skipAir !== false;
    for (const b of other.blocks({ includeAir: !skipAir })) {
      if (skipAir && b.name === AIR) continue;
      this.set_block(b.x + ax, b.y + ay, b.z + az, b.name);
    }
    return this;
  };

  /** A fresh copy of this schematic (non-air blocks). */
  proto.clone = function (this: SchematicCore) {
    const out = make();
    for (const b of this.blocks()) out.set_block(b.x, b.y, b.z, b.name);
    return out;
  };

  /** Repeat `other` `count` times, each offset by [dx,dy,dz] from the last. */
  proto.stack = function (this: SchematicCore, other: SchematicCore, count: number, offset: [number, number, number]) {
    const [dx, dy, dz] = offset;
    const src = other.blocks();
    for (let i = 0; i < count; i++)
      for (const b of src) this.set_block(b.x + dx * i, b.y + dy * i, b.z + dz * i, b.name);
    return this;
  };

  proto.repeatY = function (this: SchematicCore & { stack: any }, other: SchematicCore, count: number, step: number) {
    return this.stack(other, count, [0, step, 0]);
  };

  // ── Transforms (return new schematics) ───────────────────────────────────
  proto.mirror = function (this: SchematicCore, axis: 'x' | 'y' | 'z') {
    const { w, h, d } = dims(this);
    const out = make();
    for (const b of this.blocks()) {
      let { x, y, z } = b;
      if (axis === 'x') x = w - 1 - x;
      else if (axis === 'y') y = h - 1 - y;
      else z = d - 1 - z;
      out.set_block(x, y, z, b.name);
    }
    return out;
  };

  /** Rotate about the vertical (Y) axis by 90/180/270 degrees clockwise. */
  proto.rotate = function (this: SchematicCore, degrees: number) {
    const turns = (((degrees / 90) | 0) % 4 + 4) % 4;
    const { w, d } = dims(this);
    const out = make();
    for (const b of this.blocks()) {
      let nx = b.x, nz = b.z;
      for (let t = 0; t < turns; t++) {
        const px = nx, pz = nz;
        // 90deg CW within current footprint: (x,z) -> (depth-1-z, x)
        const curDepth = t % 2 === 0 ? d : w;
        nx = curDepth - 1 - pz;
        nz = px;
      }
      out.set_block(nx, b.y, nz, b.name);
    }
    return out;
  };

  // ── Queries ──────────────────────────────────────────────────────────────
  proto.blockCounts = function (this: SchematicCore) {
    const counts = new Map<string, number>();
    for (const b of this.blocks()) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
    return counts;
  };

  /** Top non-air block per column → { height[x][z], surface[x][z] }. */
  proto.heightmap = function (this: SchematicCore) {
    const { w, d } = dims(this);
    const height: number[][] = Array.from({ length: w }, () => new Array(d).fill(-1));
    const surface: string[][] = Array.from({ length: w }, () => new Array(d).fill(''));
    for (const b of this.blocks()) {
      if (b.x < 0 || b.z < 0 || b.x >= w || b.z >= d) continue;
      if (b.y > height[b.x][b.z]) { height[b.x][b.z] = b.y; surface[b.x][b.z] = b.name; }
    }
    return { height, surface };
  };

  Object.defineProperty(proto, 'bounds', {
    configurable: true,
    get(this: SchematicCore) {
      const { w, h, d } = dims(this);
      return { width: w, height: h, depth: d, min: [0, 0, 0], max: [Math.max(0, w - 1), Math.max(0, h - 1), Math.max(0, d - 1)] };
    },
  });

  // ── Static factories ─────────────────────────────────────────────────────
  SchematicClass.fromData = function (data: Uint8Array) {
    const s = make();
    s.from_data?.(data);
    return s;
  };

  SchematicClass.isSchematic = function (value: unknown) {
    return value instanceof SchematicClass;
  };

  /** Arrange a 2D grid of schematics into one mosaic. */
  SchematicClass.tileGrid = function (
    rows: SchematicCore[][],
    options: { spacing?: number; mode?: 'uniform' | 'packed' } = {}
  ) {
    const spacing = options.spacing ?? 0;
    const mode = options.mode ?? 'uniform';
    const out = make() as SchematicCore & { merge: any };
    const valid = rows.map((row) => row.filter((t) => t && typeof t.blocks === 'function'));

    if (mode === 'uniform') {
      let cellW = 0, cellD = 0;
      for (const row of valid)
        for (const t of row) { const dd = dims(t); cellW = Math.max(cellW, dd.w); cellD = Math.max(cellD, dd.d); }
      valid.forEach((row, rz) =>
        row.forEach((t, cx) => out.merge(t, { at: [cx * (cellW + spacing), 0, rz * (cellD + spacing)] }))
      );
    } else {
      let offsetZ = 0;
      for (const row of valid) {
        let offsetX = 0, rowDepth = 0;
        for (const t of row) {
          const dd = dims(t);
          out.merge(t, { at: [offsetX, 0, offsetZ] });
          offsetX += dd.w + spacing;
          rowDepth = Math.max(rowDepth, dd.d);
        }
        offsetZ += rowDepth + spacing;
      }
    }
    return out;
  };
}
