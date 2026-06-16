/**
 * Source of truth for `flow-runtime.d.ts` — the ambient declarations a node
 * author sees in the editor. Each provider returns its slice via
 * `declarations()`; the codegen (scripts/gen-runtime-dts.ts) concatenates them
 * in registry order, and the drift test (providers/runtime-dts.test.ts) asserts
 * every injected endowment has a declaration here and vice-versa.
 *
 * Authoring notes:
 * - Grab-bag objects carry an index signature so omitting a rarely-used member
 *   never produces a false editor error; the explicit members still autocomplete.
 * - The new ergonomic APIs (Schematic methods, Grid, Combinatorics, Noise.worley)
 *   are typed precisely because they are the whole point of this work.
 */

/** Input/Output type sugars the compiler understands (Slider, Block, …). */
export const INPUT_TYPE_SUGARS = `// ── Node input/output type sugars ────────────────────────────────────────────
type Slider<C extends { min: number; max: number; default?: number; step?: number }> = number;
type Block<C extends { default?: string } = {}> = string;
type Toggle<C extends { default?: boolean } = {}> = boolean;
type TextField<C extends { default?: string; required?: boolean } = {}> = string;
type Textarea<C extends { default?: string; rows?: number } = {}> = string;
type Vec3 = [number, number, number];
`;

const SCHEMATIC = `// ── nucleation ───────────────────────────────────────────────────────────────
interface SchematicBlock { x: number; y: number; z: number; name: string }
interface SchematicBounds { width: number; height: number; depth: number; min: Vec3; max: Vec3 }

declare class Schematic {
  constructor();
  // primitives
  set_block(x: number, y: number, z: number, block: string): void;
  get_block(x: number, y: number, z: number): string | null;
  blocks(options?: { includeAir?: boolean }): SchematicBlock[];
  get_dimensions(): number[];
  from_data(data: Uint8Array): void;
  to_schematic(): Uint8Array;
  to_litematic(): Uint8Array;
  // fills
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  fillColumn(x: number, z: number, y0: number, y1: number, block: string): this;
  fillPlane(x0: number, z0: number, x1: number, z1: number, y: number, block: string): this;
  // outlines / shells
  hollowBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  rectOutline(x0: number, z0: number, x1: number, z1: number, y: number, block: string): this;
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  sphere(cx: number, cy: number, cz: number, radius: number, block: string, hollow?: boolean): this;
  cylinder(cx: number, cy: number, cz: number, radius: number, height: number, block: string, hollow?: boolean): this;
  // compose
  paste(other: Schematic, dx?: number, dy?: number, dz?: number): this;
  merge(other: Schematic, options?: { at?: Vec3; skipAir?: boolean }): this;
  clone(): Schematic;
  stack(other: Schematic, count: number, offset: Vec3): this;
  repeatY(other: Schematic, count: number, step: number): this;
  // transforms (return new schematics)
  mirror(axis: 'x' | 'y' | 'z'): Schematic;
  rotate(degrees: number): Schematic;
  // queries
  blockCounts(): Map<string, number>;
  heightmap(): { height: number[][]; surface: string[][] };
  readonly bounds: SchematicBounds;
  // statics
  static fromData(data: Uint8Array): Schematic;
  static isSchematic(value: unknown): boolean;
  static tileGrid(rows: Schematic[][], options?: { spacing?: number; mode?: 'uniform' | 'packed' }): Schematic;
}

declare const SchematicUtils: {
  fillBox(s: Schematic, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): void;
  hollowBox(s: Schematic, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): void;
  sphere(s: Schematic, cx: number, cy: number, cz: number, radius: number, block: string, hollow?: boolean): void;
  cylinder(s: Schematic, cx: number, cy: number, cz: number, radius: number, height: number, block: string, hollow?: boolean): void;
};
`;

const STANDARD = `// ── flowlib: math / noise / vectors / runtime services ───────────────────────
declare const Calculator: {
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, t: number): number;
  inverseLerp(a: number, b: number, value: number): number;
  remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
  quantize(value: number, steps: number): number;
  roundTo(value: number, digits?: number): number;
  distance2D(x1: number, y1: number, x2: number, y2: number): number;
  distance3D(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number;
  degToRad(d: number): number;
  radToDeg(r: number): number;
  readonly PI: number; readonly E: number; readonly TAU: number;
  [key: string]: any;
};

interface FractalNoiseOptions { octaves?: number; frequency?: number; lacunarity?: number; persistence?: number }
declare const Noise: {
  getSeed(): string;
  get2D(x: number, y: number, frequency?: number): number;
  get3D(x: number, y: number, z: number, frequency?: number): number;
  get2D_01(x: number, y: number, frequency?: number): number;
  get3D_01(x: number, y: number, z: number, frequency?: number): number;
  getFractal2D(x: number, y: number, options?: FractalNoiseOptions): number;
  getFractal2D_01(x: number, y: number, options?: FractalNoiseOptions): number;
  getFractal3D(x: number, y: number, z: number, options?: FractalNoiseOptions): number;
  getFractal3D_01(x: number, y: number, z: number, options?: FractalNoiseOptions): number;
  worley(x: number, y: number, options?: { frequency?: number; jitter?: number }): number;
};

declare const Easing: { [name: string]: (t: number) => number };
declare const Logger: { log(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; debug(...args: any[]): void };
declare const Progress: {
  report(percent: number, message?: string, data?: unknown): void;
  step(current: number, total: number, message?: string): void;
  tick(index: number, total: number, message?: string): void;
  log(message: string, data?: unknown): void;
};

declare class Vec2 { constructor(x?: number, y?: number); x: number; y: number; [key: string]: any }
declare class Vec3Class { constructor(x?: number, y?: number, z?: number); x: number; y: number; z: number; [key: string]: any }
declare const Vec3: typeof Vec3Class & { [key: string]: any };
declare const Vec: { Vec2: typeof Vec2; Vec3: typeof Vec3Class; [key: string]: any };
`;

const TOOLKIT = `// ── flowlib: fields / images / random / tables / mcfunction / grid ───────────
type FieldData = number[][];
declare const Field: {
  create(width: number, height: number, fn?: number | ((x: number, z: number) => number)): FieldData;
  map(field: FieldData, fn: (value: number, x: number, z: number) => number): FieldData;
  combine(a: FieldData, b: FieldData, fn?: (a: number, b: number) => number): FieldData;
  normalize(field: FieldData, lo?: number, hi?: number): FieldData;
  clamp(field: FieldData, lo: number, hi: number): FieldData;
  terrace(field: FieldData, steps: number): FieldData;
  stats(field: FieldData): { min: number; max: number; width: number; height: number };
  fromNoise(width: number, height: number, options?: FractalNoiseOptions): FieldData;
  toTerrain(field: FieldData, options?: { maxHeight?: number; surface?: string; fill?: string }): Schematic;
  toImage(field: FieldData, palette?: string): Image;
  [key: string]: any;
};

declare class Image {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(width: number, height: number, data?: Uint8ClampedArray);
  setPixel(x: number, y: number, r: number, g: number, b: number, a?: number): this;
  getPixel(x: number, y: number): [number, number, number, number];
  fill(r: number, g: number, b: number, a?: number): this;
  static create(width: number, height: number): Image;
  static blank(width?: number, height?: number): Image;
  static fromField(field: FieldData, palette?: 'grayscale' | 'viridis' | 'terrain' | 'magma', options?: { normalize?: boolean }): Image;
  static ramp(stops: Array<[number, number, number]>, t: number): [number, number, number];
  static palettes(): string[];
}

declare const Random: {
  hash2(x: number, z: number, seed?: number): number;
  hash3(x: number, y: number, z: number, seed?: number): number;
  seeded(seed?: number | string): () => number;
  int(min: number, max: number, rng?: () => number): number;
  pick<T>(items: T[], rng?: () => number): T;
  shuffle<T>(items: T[], rng?: () => number): T[];
  [key: string]: any;
};

interface GridCell { x: number; z: number }
declare const Grid: {
  create<T>(width: number, height: number, value: T | ((x: number, z: number) => T)): T[][];
  width(grid: unknown[][]): number;
  height(grid: unknown[][]): number;
  inBounds(grid: unknown[][], x: number, z: number): boolean;
  neighbors4(grid: unknown[][], x: number, z: number): GridCell[];
  neighbors8(grid: unknown[][], x: number, z: number): GridCell[];
  forEach<T>(grid: T[][], fn: (value: T, x: number, z: number) => void): void;
  map<T, R>(grid: T[][], fn: (value: T, x: number, z: number) => R): R[][];
  bfs(grid: unknown[][], start: GridCell, goal: GridCell, passable: (x: number, z: number) => boolean): GridCell[] | null;
};

declare const Combinatorics: {
  cartesian<T>(values: T[], n: number): T[][];
  booleanCombos(n: number): boolean[][];
};

declare const Table: { [key: string]: any };
declare const Mcfunction: { builder(): any; [key: string]: any };
declare const McfunctionBuilder: any;
`;

const VENDOR = `// ── vendor: wrapped third-party libraries ────────────────────────────────────
declare const Pathfinding: { [key: string]: any };
`;

const SCHEMATI = `// ── platform: Schemati ───────────────────────────────────────────────────────
declare const Schemati: {
  searchSchematics(options: { tag?: string; search?: string; limit?: number }): Promise<any[]>;
  getSchematic(id: string): Promise<Schematic>;
  getSchematicData(id: string): Promise<{ format: string; data: Uint8Array; metadata: { name: string } }>;
  getTags(): Promise<any[]>;
  uploadSchematic(schematic: Schematic, options: Record<string, unknown>): Promise<any>;
  /** Fetch + load a schematic in one step → { schematic, name }. */
  loadSchematic(id: string): Promise<{ schematic: Schematic; name: string }>;
  /** Prefer shortId, fall back to id, for any result object. */
  displayId(item: { shortId?: string; id?: string }): string;
  [key: string]: any;
};
`;

/**
 * Per-category declaration text, keyed by provider name. The four runtime
 * categories: `nucleation` (the schematic engine, full control), `flowlib`
 * (our first-party helpers: math/noise/vectors/fields/images/grids/…),
 * `vendor` (wrapped third-party libs, e.g. Pathfinding), `schemati` (platform).
 */
export const PROVIDER_DECLARATIONS: Record<string, string> = {
  nucleation: SCHEMATIC,
  flowlib: `${STANDARD}\n${TOOLKIT}`,
  vendor: VENDOR,
  schemati: SCHEMATI,
};

/** Per-category endowment keys, keyed by provider name. */
export const PROVIDER_ENDOWMENT_KEYS: Record<string, string[]> = {
  nucleation: ['Schematic', 'SchematicUtils'],
  flowlib: [
    'Calculator', 'Easing', 'Logger', 'Noise', 'Progress', 'Vec', 'Vec2', 'Vec3', 'Math',
    'Field', 'Image', 'Random', 'Table', 'Mcfunction', 'McfunctionBuilder', 'Grid', 'Combinatorics',
  ],
  vendor: ['Pathfinding'],
  schemati: ['Schemati'],
};

/**
 * Assemble the full `flow-runtime.d.ts` from the input sugars plus each
 * provider's declaration slice, in the given order.
 */
export function buildRuntimeDts(declarationSlices: string[]): string {
  return [
    '// AUTO-GENERATED by scripts/gen-runtime-dts.ts — do not edit by hand.',
    '// Source of truth: packages/core/src/runtime-types.ts + each provider.declarations().',
    '',
    INPUT_TYPE_SUGARS,
    ...declarationSlices,
  ].join('\n');
}
