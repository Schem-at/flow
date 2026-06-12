/**
 * Field — the heightfield toolkit (docs/dx-audit.md §1.2). A field is a plain
 * number[][] indexed [z][x] (row-major), the currency the worldgen blocks
 * already pass between nodes. Pure JS; the noise- and schematic-coupled
 * builders live in the field provider where the Noise/Schematic endowments
 * are in scope.
 */

export type FieldData = number[][];

export interface FieldStats {
  min: number;
  max: number;
  width: number;
  height: number;
}

function dims(field: FieldData): { width: number; height: number } {
  return { height: field.length, width: field[0]?.length ?? 0 };
}

export const FieldOps = {
  /** Create a width×height field, filled by `fn(x, z)` (or a constant). */
  create(
    width: number,
    height: number,
    fn: number | ((x: number, z: number) => number) = 0
  ): FieldData {
    const get = typeof fn === 'function' ? fn : () => fn;
    return Array.from({ length: height }, (_, z) =>
      Array.from({ length: width }, (_, x) => get(x, z))
    );
  },

  stats(field: FieldData): FieldStats {
    const { width, height } = dims(field);
    let min = Infinity;
    let max = -Infinity;
    for (const row of field) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min, max, width, height };
  },

  /** Element-wise map. */
  map(field: FieldData, fn: (value: number, x: number, z: number) => number): FieldData {
    return field.map((row, z) => row.map((v, x) => fn(v, x, z)));
  },

  /** Combine two same-size fields element-wise (default: a - b). */
  combine(
    a: FieldData,
    b: FieldData,
    fn: (a: number, b: number) => number = (x, y) => x - y
  ): FieldData {
    return a.map((row, z) => row.map((v, x) => fn(v, b[z]?.[x] ?? 0)));
  },

  add(a: FieldData, b: FieldData): FieldData {
    return FieldOps.combine(a, b, (x, y) => x + y);
  },

  subtract(a: FieldData, b: FieldData): FieldData {
    return FieldOps.combine(a, b, (x, y) => x - y);
  },

  multiply(a: FieldData, b: FieldData): FieldData {
    return FieldOps.combine(a, b, (x, y) => x * y);
  },

  /** Rescale values into [lo, hi] (default [0, 1]); flat fields map to lo. */
  normalize(field: FieldData, lo = 0, hi = 1): FieldData {
    const { min, max } = FieldOps.stats(field);
    const range = max - min;
    if (range === 0) return FieldOps.map(field, () => lo);
    return FieldOps.map(field, (v) => lo + ((v - min) / range) * (hi - lo));
  },

  /** Clamp every value into [lo, hi]. */
  clamp(field: FieldData, lo: number, hi: number): FieldData {
    return FieldOps.map(field, (v) => Math.max(lo, Math.min(hi, v)));
  },

  /** Linear blend: a * (1-t) + b * t. */
  lerp(a: FieldData, b: FieldData, t: number): FieldData {
    return FieldOps.combine(a, b, (x, y) => x + (y - x) * t);
  },

  /** Quantize into N flat steps over the field's own range (terracing). */
  terrace(field: FieldData, steps: number): FieldData {
    const { min, max } = FieldOps.stats(field);
    const range = max - min;
    if (range === 0 || steps < 1) return FieldOps.map(field, (v) => v);
    return FieldOps.map(field, (v) => {
      const t = (v - min) / range;
      const stepped = Math.min(steps - 1, Math.floor(t * steps)) / Math.max(1, steps - 1);
      return min + stepped * range;
    });
  },

  /** Bilinear sample at fractional coordinates (clamped at the edges). */
  sample(field: FieldData, x: number, z: number): number {
    const { width, height } = dims(field);
    if (!width || !height) return 0;
    const cx = Math.max(0, Math.min(width - 1, x));
    const cz = Math.max(0, Math.min(height - 1, z));
    const x0 = Math.floor(cx);
    const z0 = Math.floor(cz);
    const x1 = Math.min(width - 1, x0 + 1);
    const z1 = Math.min(height - 1, z0 + 1);
    const fx = cx - x0;
    const fz = cz - z0;
    const top = field[z0][x0] * (1 - fx) + field[z0][x1] * fx;
    const bottom = field[z1][x0] * (1 - fx) + field[z1][x1] * fx;
    return top * (1 - fz) + bottom * fz;
  },

  /** Resize to new dimensions via bilinear sampling. */
  resize(field: FieldData, width: number, height: number): FieldData {
    const { width: w0, height: h0 } = dims(field);
    return FieldOps.create(width, height, (x, z) =>
      FieldOps.sample(field, (x / Math.max(1, width - 1)) * (w0 - 1), (z / Math.max(1, height - 1)) * (h0 - 1))
    );
  },
};
