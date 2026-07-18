/**
 * FlowImage — the runtime `Image` ambient (docs/dx-audit.md §1.3). A real
 * class for the { width, height, data } RGBA shape the viewers already
 * render, with builders so blocks stop hand-rolling byte loops.
 */

import type { FieldData } from './field.js';
import { FieldOps } from './field.js';

export type PaletteName = 'grayscale' | 'viridis' | 'terrain' | 'magma';

type Stop = [t: number, r: number, g: number, b: number];

const PALETTES: Record<PaletteName, Stop[]> = {
  grayscale: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
  viridis: [
    [0, 68, 1, 84],
    [0.25, 59, 82, 139],
    [0.5, 33, 145, 140],
    [0.75, 94, 201, 98],
    [1, 253, 231, 37],
  ],
  terrain: [
    [0, 18, 49, 89],     // deep water
    [0.35, 60, 110, 160], // shallow water
    [0.45, 194, 178, 128],// sand
    [0.6, 76, 140, 74],   // grass
    [0.8, 110, 95, 80],   // rock
    [1, 245, 245, 245],   // snow
  ],
  magma: [
    [0, 0, 0, 4],
    [0.33, 87, 16, 110],
    [0.66, 222, 73, 104],
    [1, 252, 253, 191],
  ],
};

function paletteColor(stops: Stop[], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (clamped <= stops[i][0]) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const [t1, r1, g1, b1] = stops[i];
      const f = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export class FlowImage {
  width: number;
  height: number;
  /** Raw RGBA bytes, length = width * height * 4. */
  data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
    if (this.data.length !== width * height * 4) {
      throw new Error(`Image: data must be ${width * height * 4} bytes for ${width}×${height}`);
    }
  }

  static create(width: number, height: number): FlowImage {
    return new FlowImage(width, height);
  }

  /** A small transparent placeholder — for early-return paths that must emit an Image. */
  static blank(width = 1, height = 1): FlowImage {
    return new FlowImage(Math.max(1, width), Math.max(1, height));
  }

  /** Sample an array of [r,g,b] stops at t in [0,1] with linear interpolation. */
  static ramp(stops: Array<[number, number, number]>, t: number): [number, number, number] {
    if (stops.length === 0) return [0, 0, 0];
    if (stops.length === 1) return stops[0];
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const scaled = clamped * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const f = scaled - i;
    const [r0, g0, b0] = stops[i];
    const [r1, g1, b1] = stops[i + 1];
    return [Math.round(r0 + (r1 - r0) * f), Math.round(g0 + (g1 - g0) * f), Math.round(b0 + (b1 - b0) * f)];
  }

  /**
   * Render a heightfield (number[][]) through a palette. Values are
   * auto-normalized over the field's own range unless normalize: false.
   */
  static fromField(
    field: FieldData,
    palette: PaletteName = 'viridis',
    options: { normalize?: boolean } = {}
  ): FlowImage {
    const stops = PALETTES[palette] ?? PALETTES.viridis;
    const source = options.normalize === false ? field : FieldOps.normalize(field);
    const height = source.length;
    const width = source[0]?.length ?? 0;
    const image = new FlowImage(Math.max(1, width), Math.max(1, height));
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = paletteColor(stops, source[z][x]);
        image.setPixel(x, z, r, g, b);
      }
    }
    return image;
  }

  setPixel(x: number, y: number, r: number, g: number, b: number, a = 255): this {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
    return this;
  }

  getPixel(x: number, y: number): [number, number, number, number] {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(r: number, g: number, b: number, a = 255): this {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
    return this;
  }

  /** Names of the built-in palettes for fromField. */
  static palettes(): PaletteName[] {
    return Object.keys(PALETTES) as PaletteName[];
  }
}
