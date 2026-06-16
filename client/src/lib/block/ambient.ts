/**
 * Ambient declarations shipped to Monaco (autocomplete/hover) and consulted by
 * the parser to recognize widget helper type names.
 *
 * Two layers:
 * - AMBIENT_DTS: hand-written, curated docs for widget helpers and the
 *   standard providers (Noise, Vec, Easing, Progress, Schemati, …).
 * - NUCLEATION_AMBIENT_DTS: the REAL nucleation .d.ts (bundled at build time
 *   via ?raw), ambient-ized so every Schematic/WASM method autocompletes with
 *   its true signature and JSDoc — and stays in sync with the installed
 *   nucleation version.
 *
 * Widget helpers (Slider, NumberField, …) are *type-level only*: they erase to
 * their primitive (number/string/boolean) at runtime, but their generic config
 * argument carries UI metadata (min/max/step/default) that the parser lifts
 * into FlowType descriptors.
 */

import nucleationRawDts from 'virtual:nucleation-dts';

/**
 * Turn nucleation's module .d.ts into ambient (global) declarations:
 * strip module syntax, drop the wasm init plumbing, and alias the
 * `Schematic` global the runtime actually endows (SchematicWrapper plus
 * its attached builder/enum statics).
 */
function ambientizeNucleationDts(raw: string): string {
  // Everything from InitOutput onward is wasm-bindgen init plumbing.
  const cut = raw.indexOf('export interface InitOutput');
  let body = cut > 0 ? raw.slice(0, cut) : raw;

  body = body
    .replace(/^export default .*$/gm, '')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\};?\s*$/gm, '')
    .replace(/^export declare /gm, 'declare ')
    .replace(/^export (class|function|const|enum)/gm, 'declare $1')
    .replace(/^export (interface|type)/gm, '$1');

  return `${body}

// ---- Runtime aliases (what the engine actually endows) ----

/**
 * The live schematic class available inside blocks — nucleation's
 * SchematicWrapper with builder/enum helpers attached as statics.
 */
declare class Schematic extends SchematicWrapper {
  /** Solid blocks only by default; pass { includeAir: true } for the raw list. */
  blocks(options?: { includeAir?: boolean }): Array<{ x: number; y: number; z: number; name: string }>;
  // ── fills ──
  /** Solid box between two corners (inclusive). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  /** Vertical run of blocks at (x, z) from y0 to y1. */
  fillColumn(x: number, z: number, y0: number, y1: number, block: string): this;
  /** Flat slab at a single Y between two XZ corners. */
  fillPlane(x0: number, z0: number, x1: number, z1: number, y: number, block: string): this;
  // ── outlines / shells ──
  /** Box shell (all 6 faces), hollow interior. */
  hollowBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  /** Four vertical walls, no floor or roof. */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  /** Single-Y rectangle perimeter. */
  rectOutline(x0: number, z0: number, x1: number, z1: number, y: number, block: string): this;
  /** 3D line between two points. */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: string): this;
  sphere(cx: number, cy: number, cz: number, radius: number, block: string, hollow?: boolean): this;
  cylinder(cx: number, cy: number, cz: number, radius: number, height: number, block: string, hollow?: boolean): this;
  // ── compose ──
  /** Copy every block of other into this schematic at an offset. Returns this. */
  paste(other: Schematic, dx?: number, dy?: number, dz?: number): this;
  /** Paste with options: at offset and skipAir (default true). */
  merge(other: Schematic, options?: { at?: [number, number, number]; skipAir?: boolean }): this;
  /** A fresh copy of this schematic (non-air blocks). */
  clone(): Schematic;
  /** Repeat other count times, each offset by [dx,dy,dz] from the last. */
  stack(other: Schematic, count: number, offset: [number, number, number]): this;
  repeatY(other: Schematic, count: number, step: number): this;
  // ── transforms (return new schematics) ──
  mirror(axis: 'x' | 'y' | 'z'): Schematic;
  /** Rotate about the vertical axis by 90/180/270 degrees clockwise. */
  rotate(degrees: number): Schematic;
  // ── queries ──
  blockCounts(): Map<string, number>;
  /** Top non-air block per column. */
  heightmap(): { height: number[][]; surface: string[][] };
  readonly bounds: { width: number; height: number; depth: number; min: [number, number, number]; max: [number, number, number] };
  // ── statics ──
  static fromData(data: Uint8Array): Schematic;
  static isSchematic(value: unknown): boolean;
  /** Arrange a 2D grid of schematics into one mosaic. */
  static tileGrid(rows: Schematic[][], options?: { spacing?: number; mode?: 'uniform' | 'packed' }): Schematic;
}
declare namespace Schematic {
  export import SchematicBuilder = SchematicBuilderWrapper;
  export import ExecutionMode = ExecutionModeWrapper;
  export import DefinitionRegion = DefinitionRegionWrapper;
}
`;
}

export const NUCLEATION_AMBIENT_DTS = ambientizeNucleationDts(nucleationRawDts);

export const AMBIENT_DTS = `
// ---- Widget helper types (erased at runtime; config drives the UI) ----

/** A number edited with a slider widget. */
declare type Slider<C extends { min?: number; max?: number; step?: number; default?: number } = {}> = number;

/** A number edited with a plain numeric input widget. */
declare type NumberField<C extends { min?: number; max?: number; step?: number; default?: number } = {}> = number;

/** A string edited with a multiline textarea widget. */
declare type Textarea<C extends { default?: string; required?: boolean } = {}> = string;

/** A single-line string input; required: true blocks runs while empty. */
declare type TextField<C extends { default?: string; required?: boolean } = {}> = string;

/** A boolean edited with a toggle widget. */
declare type Toggle<C extends { default?: boolean } = {}> = boolean;

/** A minecraft block id, edited with the block picker widget. */
declare type Block<C extends { default?: string } = {}> = string;

/** A number matrix; rows/cols (when given) fix that dimension in the input form. */
declare type Matrix<C extends { rows?: number; cols?: number } = {}> = number[][];

/** An [x, y, z] vector. */
declare type Vec3Tuple = [number, number, number];

// ---- Ambient runtime context (provided by the engine) ----

/** A heightfield: number[][] indexed [z][x] — the worldgen currency. */
declare type Field = number[][];

/** Built-in colormap names for Image.fromField / Field.toImage. */
declare type FieldPalette = 'grayscale' | 'viridis' | 'terrain' | 'magma';

/** A 2D RGBA image: width × height pixels, 4 bytes per pixel. */
declare class Image {
  constructor(width: number, height: number, data?: Uint8ClampedArray);
  width: number;
  height: number;
  /** Raw RGBA bytes (Uint8ClampedArray, length = width * height * 4). */
  data: Uint8ClampedArray;
  /** Blank transparent image. */
  static create(width: number, height: number): Image;
  /** Render a heightfield through a palette (auto-normalized). */
  static fromField(field: Field, palette?: FieldPalette, options?: { normalize?: boolean }): Image;
  /** A small transparent placeholder for early-return paths. */
  static blank(width?: number, height?: number): Image;
  /** Sample [r,g,b] stops at t in [0,1] with linear interpolation. */
  static ramp(stops: Array<[number, number, number]>, t: number): [number, number, number];
  static palettes(): FieldPalette[];
  setPixel(x: number, y: number, r: number, g: number, b: number, a?: number): this;
  getPixel(x: number, y: number): [number, number, number, number];
  fill(r: number, g: number, b: number, a?: number): this;
}

/** Heightfield toolkit — create, transform, and materialize number[][] fields. */
declare const Field: {
  /** width×height field filled by fn(x, z) (or a constant). */
  create(width: number, height: number, fn?: number | ((x: number, z: number) => number)): Field;
  /** width×height fractal-noise field in [0, 1] (octaves/frequency/persistence/lacunarity). */
  fromNoise(width: number, height: number, options?: { octaves?: number; frequency?: number; persistence?: number; lacunarity?: number }): Field;
  stats(field: Field): { min: number; max: number; width: number; height: number };
  map(field: Field, fn: (value: number, x: number, z: number) => number): Field;
  /** Element-wise combine (default a - b). */
  combine(a: Field, b: Field, fn?: (a: number, b: number) => number): Field;
  add(a: Field, b: Field): Field;
  subtract(a: Field, b: Field): Field;
  multiply(a: Field, b: Field): Field;
  /** Rescale into [lo, hi] (default [0, 1]). */
  normalize(field: Field, lo?: number, hi?: number): Field;
  clamp(field: Field, lo: number, hi: number): Field;
  /** Blend a→b by t. */
  lerp(a: Field, b: Field, t: number): Field;
  /** Quantize into N flat steps (terracing). */
  terrace(field: Field, steps: number): Field;
  /** Bilinear sample at fractional coordinates. */
  sample(field: Field, x: number, z: number): number;
  resize(field: Field, width: number, height: number): Field;
  /** Paint into a NEW schematic: fill columns capped with surface. */
  toTerrain(field: Field, options?: { maxHeight?: number; surface?: string; fill?: string }): Schematic;
  /** Render through a palette as an Image. */
  toImage(field: Field, palette?: FieldPalette): Image;
};

/** Deterministic hashing + seeded RNG — same inputs, same outputs, every run. */
declare const Random: {
  /** Hash (x, z, seed) → [0, 1). */
  hash2(x: number, z: number, seed?: number): number;
  /** Hash (x, y, z, seed) → [0, 1). */
  hash3(x: number, y: number, z: number, seed?: number): number;
  /** Seeded PRNG: returns () => number in [0, 1). */
  seeded(seed?: number | string): () => number;
  int(min: number, max: number, rng?: () => number): number;
  pick<T>(items: T[], rng?: () => number): T;
  shuffle<T>(items: T[], rng?: () => number): T[];
};

/** Tabular helpers (viewers already export CSV/PNG from rows outputs). */
declare const Table: {
  toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string;
  sortBy(rows: Array<Record<string, unknown>>, column: string, direction?: 'asc' | 'desc'): Array<Record<string, unknown>>;
};

/** Builder for .mcfunction files (setblock/fill/block_display holograms). */
declare const Mcfunction: {
  builder(): {
    comment(text: string): any;
    raw(command: string): any;
    setblock(pos: [number, number, number] | { x: number; y: number; z: number }, block: string, relative?: boolean): any;
    fill(from: [number, number, number], to: [number, number, number], block: string, relative?: boolean): any;
    /** Miniature block hologram at a relative offset with uniform scale. */
    summonBlockDisplay(pos: [number, number, number] | { x: number; y: number; z: number }, block: string, scale?: number, tag?: string): any;
    killTagged(tag: string): any;
    size(): number;
    toString(): string;
  };
};

/** Worker-side logger — lines stream into the editor's execution log. */
declare const Logger: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface FractalNoiseOptions {
  /** Layers of noise to stack (default 4). */
  octaves?: number;
  /** Base frequency (default 0.01). */
  frequency?: number;
  /** Amplitude falloff per octave (default 0.5). */
  persistence?: number;
  /** Frequency growth per octave (default 2). */
  lacunarity?: number;
}

/** Seeded Perlin noise. _01 variants are remapped to [0, 1]; plain ones are roughly [-1, 1]. */
declare const Noise: {
  getSeed(): string;
  get2D(x: number, y: number, frequency?: number): number;
  get3D(x: number, y: number, z: number, frequency?: number): number;
  get2D_01(x: number, y: number, frequency?: number): number;
  get3D_01(x: number, y: number, z: number, frequency?: number): number;
  /** Fractal (fBm) noise — stacked octaves for natural-looking terrain. */
  getFractal2D(x: number, y: number, options?: FractalNoiseOptions): number;
  getFractal3D(x: number, y: number, z: number, options?: FractalNoiseOptions): number;
  getFractal2D_01(x: number, y: number, options?: FractalNoiseOptions): number;
  getFractal3D_01(x: number, y: number, z: number, options?: FractalNoiseOptions): number;
  /** F1 Worley/Voronoi noise in [0, 1] — distance to the nearest jittered feature point. */
  worley(x: number, y: number, options?: { frequency?: number; jitter?: number }): number;
};

/** Chainable 2D vector (methods mutate and return this). */
declare class Vec2 {
  constructor(x?: number, y?: number);
  x: number; y: number;
  static from(x: number, y: number): Vec2;
  static zero(): Vec2;
  clone(): Vec2;
  set(x: number, y: number): this;
  add(v: Vec2): this;
  sub(v: Vec2): this;
  scale(s: number): this;
  length(): number;
  normalize(): this;
  dot(v: Vec2): number;
  distanceTo(v: Vec2): number;
  toArray(): [number, number];
}

/** Chainable 3D vector (methods mutate and return this). */
declare class Vec3 {
  constructor(x?: number, y?: number, z?: number);
  x: number; y: number; z: number;
  static from(x: number, y: number, z: number): Vec3;
  static zero(): Vec3;
  static up(): Vec3;
  static down(): Vec3;
  static north(): Vec3;
  static south(): Vec3;
  static east(): Vec3;
  static west(): Vec3;
  clone(): Vec3;
  set(x: number, y: number, z: number): this;
  add(v: Vec3): this;
  sub(v: Vec3): this;
  scale(s: number): this;
  length(): number;
  normalize(): this;
  dot(v: Vec3): number;
  cross(v: Vec3): this;
  distanceTo(v: Vec3): number;
  toArray(): [number, number, number];
  [key: string]: any;
}

/** Vector helpers: Vec.Vec2 / Vec.Vec3 classes plus vec2()/vec3() factories. */
declare const Vec: {
  Vec2: typeof Vec2;
  Vec3: typeof Vec3;
  vec2(x: number, y: number): Vec2;
  vec3(x: number, y: number, z: number): Vec3;
  [key: string]: any;
};

/** Pure math helpers (safe divide, clamp, lerp, trig, …). */
declare const Calculator: {
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
  multiply(a: number, b: number): number;
  /** Throws on division by zero. */
  divide(a: number, b: number): number;
  /** Snap a value into N discrete levels (terracing). */
  quantize(value: number, steps: number): number;
  /** Round to a fixed number of decimal places. */
  roundTo(value: number, digits?: number): number;
  sqrt(a: number): number;
  pow(a: number, b: number): number;
  cbrt(a: number): number;
  sin(a: number): number;
  cos(a: number): number;
  tan(a: number): number;
  asin(a: number): number;
  acos(a: number): number;
  atan(a: number): number;
  atan2(y: number, x: number): number;
  floor(a: number): number;
  ceil(a: number): number;
  round(a: number): number;
  trunc(a: number): number;
  abs(a: number): number;
  sign(a: number): number;
  min(...values: number[]): number;
  max(...values: number[]): number;
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, t: number): number;
  inverseLerp(a: number, b: number, value: number): number;
  [key: string]: any;
};

/** Easing curves: t in [0,1] → eased [0,1]. */
declare const Easing: {
  linear(t: number): number;
  inQuad(t: number): number; outQuad(t: number): number; inOutQuad(t: number): number;
  inCubic(t: number): number; outCubic(t: number): number; inOutCubic(t: number): number;
  inQuart(t: number): number; outQuart(t: number): number; inOutQuart(t: number): number;
  inQuint(t: number): number; outQuint(t: number): number; inOutQuint(t: number): number;
  inSine(t: number): number; outSine(t: number): number; inOutSine(t: number): number;
  inExpo(t: number): number; outExpo(t: number): number; inOutExpo(t: number): number;
  inCirc(t: number): number; outCirc(t: number): number; inOutCirc(t: number): number;
  inBack(t: number): number; outBack(t: number): number; inOutBack(t: number): number;
  inElastic(t: number): number; outElastic(t: number): number; inOutElastic(t: number): number;
  inBounce(t: number): number; outBounce(t: number): number; inOutBounce(t: number): number;
};

/** Report progress to the editor (drives per-node progress bars). */
declare const Progress: {
  /** percent in [0,100]. */
  report(percent: number, message?: string, data?: unknown): void;
  /** Convenience: report(current/total). */
  step(current: number, total: number, message?: string): void;
  log(message: string, data?: unknown): void;
  /** step(i+1, total) sugar for loops. */
  tick(index: number, total: number, message?: string): void;
  /** Iterate items, reporting progress per element. */
  wrap<T, R>(items: T[], fn: (item: T, index: number) => R, message?: string): R[];
};

/** A* pathfinding over schematic block space. */
declare const Pathfinding: {
  findPath(
    schematic: Schematic,
    start: Vec3 | { x: number; y: number; z: number },
    end: Vec3 | { x: number; y: number; z: number },
    options?: Record<string, unknown>
  ): { path: Array<{ x: number; y: number; z: number }>; [key: string]: any } | null;
  hasLineOfSight(schematic: Schematic, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean;
  getWalkableNeighbors(schematic: Schematic, pos: { x: number; y: number; z: number }): Array<{ x: number; y: number; z: number }>;
  [key: string]: any;
};

/** Shape helpers that draw directly into a schematic. */
declare const SchematicUtils: {
  fillBox(schematic: Schematic, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: string): void;
  hollowBox(schematic: Schematic, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: string): void;
  sphere(schematic: Schematic, cx: number, cy: number, cz: number, radius: number, blockType: string): void;
  cylinder(schematic: Schematic, cx: number, cy: number, cz: number, radius: number, height: number, blockType: string): void;
  [key: string]: any;
};

/**
 * Schemati platform API — search, fetch, and publish schematics hosted on
 * schemati. In the browser it rides the page's session (same-origin); on the
 * server it uses SCHEMATI_URL / SCHEMATI_API_TOKEN. Same calls either way.
 */
declare const Schemati: {
  /** Search schematics; tag accepts a tag NAME (e.g. 'door') or tag id. */
  searchSchematics(options?: { tag?: string; search?: string; limit?: number; page?: number }): Promise<Array<{
    id: string; shortId: string; slug: string; name: string; description: string;
    format: string; isPublic: boolean; tags: string[]; authors: string[];
    previewImageUrl: string | null; webUrl: string | null;
  }>>;
  /** Download a schematic (by id, short id, or slug) as a live Schematic. */
  getSchematic(idOrSlug: string, options?: { format?: string }): Promise<Schematic>;
  /** Download raw bytes + metadata instead of a parsed Schematic. */
  getSchematicData(idOrSlug: string, options?: { format?: string }): Promise<{ format: string; data: Uint8Array; metadata: { name: string } }>;
  /** List all tag names on the platform. */
  getTags(): Promise<string[]>;
  /**
   * Upload a schematic to the platform (browser: needs a signed-in session;
   * server: needs SCHEMATI_API_TOKEN). A top-down preview image is generated
   * automatically. Tags accept names. Throws on exact-duplicate uploads.
   */
  uploadSchematic(schematic: Schematic, options: {
    name: string; description?: string; tags?: string[];
    isPublic?: boolean; format?: 'schem' | 'litematic' | 'schematic';
  }): Promise<{ id: string; shortId: string; slug: string; name: string; webUrl: string | null }>;
  /** Fetch + load a schematic in one step. */
  loadSchematic(idOrSlug: string): Promise<{ schematic: Schematic; name: string }>;
  /** Prefer shortId, fall back to id, for any result object. */
  displayId(item: { shortId?: string; id?: string }): string;
};

/** 2D integer grid helper — alloc, neighbours, bounds checks, grid BFS. */
declare const Grid: {
  create<T>(width: number, height: number, value: T | ((x: number, z: number) => T)): T[][];
  width(grid: unknown[][]): number;
  height(grid: unknown[][]): number;
  inBounds(grid: unknown[][], x: number, z: number): boolean;
  neighbors4(grid: unknown[][], x: number, z: number): Array<{ x: number; z: number }>;
  neighbors8(grid: unknown[][], x: number, z: number): Array<{ x: number; z: number }>;
  forEach<T>(grid: T[][], fn: (value: T, x: number, z: number) => void): void;
  map<T, R>(grid: T[][], fn: (value: T, x: number, z: number) => R): R[][];
  /** Shortest 4-connected path over passable cells, or null if unreachable. */
  bfs(grid: unknown[][], start: { x: number; z: number }, goal: { x: number; z: number }, passable: (x: number, z: number) => boolean): Array<{ x: number; z: number }> | null;
};

/** Enumeration helpers — cartesian products and boolean truth-table rows. */
declare const Combinatorics: {
  cartesian<T>(values: T[], n: number): T[][];
  booleanCombos(n: number): boolean[][];
};
`;

/**
 * One-stop Monaco setup: compiler options + both ambient libs. Used by every
 * code editor surface (workbench BlockEditor, editor CodePanel) so they all
 * get identical autocomplete.
 */
export function setupAmbientMonaco(monaco: {
  languages: {
    typescript: {
      typescriptDefaults: {
        setCompilerOptions(o: Record<string, unknown>): void;
        getCompilerOptions(): Record<string, unknown>;
        setDiagnosticsOptions(o: Record<string, unknown>): void;
        addExtraLib(content: string, filePath?: string): void;
      };
    };
  };
}): void {
  const ts = monaco.languages.typescript.typescriptDefaults;
  ts.setCompilerOptions({
    ...ts.getCompilerOptions(),
    allowNonTsExtensions: true,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    strict: false,
    // Block sources run in a sandbox with NO DOM. Dropping the DOM lib removes
    // browser globals (notably `Image` = HTMLImageElement) that would otherwise
    // shadow our ambient `Image` class and break `Image.fromField`, `new Image()`,
    // etc. The sandbox exposes Logger/Progress rather than `console`.
    lib: ['es2020'],
  });
  ts.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  ts.addExtraLib(AMBIENT_DTS, 'file:///flow-ambient.d.ts');
  ts.addExtraLib(NUCLEATION_AMBIENT_DTS, 'file:///flow-nucleation.d.ts');
}

/** Type-reference names the parser maps to widget-configured primitives. */
export const WIDGET_HELPER_NAMES = ['Slider', 'NumberField', 'Textarea', 'TextField', 'Toggle'] as const;

/** Type-reference names the parser maps to domain FlowType kinds. */
export const DOMAIN_TYPE_NAMES = ['Schematic', 'Block', 'Image', 'Vec3'] as const;
