/**
 * Hand-authored ambient declarations for the nucleation ≥ 0.3.0 surface the
 * engine actually endows (the COMPAT `Schematic` class from
 * @flow/core utils/schematic.ts plus the generated domain classes attached as
 * statics). Shipped to Monaco (autocomplete/hover) and parsed by the docs
 * browser (apiDocs.ts) — keep the JSDoc user-facing.
 *
 * Pre-0.3.0 this string was generated from the wasm-bindgen `nucleation.d.ts`;
 * the Diplomat-generated package ships one .d.ts per class with cross-imports,
 * which don't ambient-ize mechanically — and the endowed class is now our
 * compat wrapper anyway, so its docs live here.
 */

export const NUCLEATION_AMBIENT_DTS = `
// ---- nucleation (WASM) — the live schematic API endowed to every block ----

/**
 * The live voxel schematic class available inside blocks (nucleation WASM).
 * Construct with \`new Schematic()\`, build with \`setBlock\`/\`fillCuboid\`/\`paste\`,
 * or load bytes with \`Schematic.fromData(bytes)\`.
 *
 * Method names are camelCase since nucleation 0.3.0; the old snake_case names
 * (\`set_block\`, \`get_dimensions\`, …) still work as deprecated aliases and will
 * be removed in a future update. Binary exports return Uint8Array; failures
 * throw (no null/sentinel returns) — wrap risky calls in try/catch.
 */
declare class Schematic {
  constructor(name?: string);

  /** Parse schematic bytes (auto-detects .schem / .litematic / .mcstructure). */
  static fromData(data: Uint8Array): Schematic;
  /** Parse Litematic bytes. */
  static fromLitematic(data: Uint8Array): Schematic;
  /** Parse Sponge .schem bytes. */
  static fromSchematic(data: Uint8Array): Schematic;
  /** Parse Bedrock .mcstructure bytes. */
  static fromMcstructure(data: Uint8Array): Schematic;

  /** The raw generated nucleation.Schematic — the full low-level API (JSON/base64 payloads). */
  readonly native: unknown;

  /** Set a block. Accepts a plain id ("minecraft:stone") or a block string with properties ("minecraft:lever[powered=true]"). */
  setBlock(x: number, y: number, z: number, blockType: string): boolean;
  /** The block id at a position, or null when empty/out of bounds. */
  getBlock(x: number, y: number, z: number): string | null;
  /** Set a block from a full block string, e.g. "minecraft:chest[facing=north]{Items:[...]}". */
  setBlockFromString(x: number, y: number, z: number, blockString: string): void;
  /** Set a block with properties given as an object ({facing: "north"}). */
  setBlockWithProperties(x: number, y: number, z: number, blockName: string, properties: Record<string, string>): void;
  /** The full block string (id + properties) at a position, or null when empty. */
  getBlockString(x: number, y: number, z: number): string | null;

  /** Every block as {x, y, z, name, properties?}. Solid blocks only by default; pass { includeAir: true } for every cell of the bounding box. */
  blocks(options?: { includeAir?: boolean }): Array<{ x: number; y: number; z: number; name: string; properties?: Record<string, string> }>;
  /** Copy every non-air block of \`other\` into this schematic at an offset (properties and block entities ride along). Returns this. */
  paste(other: Schematic, dx?: number, dy?: number, dz?: number): this;
  /** Fill a solid cuboid with a block. */
  fillCuboid(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: string): void;
  /** Fill a solid sphere with a block. */
  fillSphere(cx: number, cy: number, cz: number, radius: number, blockType: string): void;

  /** Allocated dimensions of the bounding box, as {x, y, z}. */
  dimensions(): { x: number; y: number; z: number };
  /** Alias of dimensions(). */
  readonly size: { x: number; y: number; z: number };
  /** Number of non-air blocks. */
  blockCount(): number;
  /** Volume of the bounding box. */
  volume(): number;
  /** The distinct block ids used (index 0 is air). */
  palette(): string[];
  /** The schematic's stored name, or null when unset. */
  name(): string | null;
  setName(name: string): void;

  /** Load bytes into THIS schematic (auto-detect format), replacing its contents. Returns this. */
  fromData(data: Uint8Array): this;
  /** Serialize as Sponge .schem bytes. */
  toSchematic(): Uint8Array;
  /** Serialize as .litematic bytes. */
  toLitematic(): Uint8Array;
  /** Serialize to a named format ("schematic" | "litematic" | "mcstructure" | …); version/settings optional. */
  saveAs(format: string, version?: string, settings?: string): Uint8Array;

  /** Create a named definition region containing a single point. */
  createDefinitionRegionFromPoint(name: string, x: number, y: number, z: number): void;
  /** Create a named definition region from inclusive bounds. */
  createDefinitionRegionFromBounds(name: string, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void;

  /** @deprecated Use setBlock. */
  set_block(x: number, y: number, z: number, blockType: string): void;
  /** @deprecated Use getBlock. */
  get_block(x: number, y: number, z: number): string | null;
  /** @deprecated Use setBlockFromString. */
  set_block_from_string(x: number, y: number, z: number, blockString: string): void;
  /** @deprecated Use fromData. */
  from_data(data: Uint8Array): void;
  /** @deprecated Use toSchematic. */
  to_schematic(): Uint8Array;
  /** @deprecated Use toLitematic. */
  to_litematic(): Uint8Array;
  /** @deprecated Use dimensions() — returns {x, y, z}. */
  get_dimensions(): number[];
  /** @deprecated Use blockCount. */
  get_block_count(): number;
  /** @deprecated Use volume. */
  get_volume(): number;
  /** @deprecated Use palette. */
  get_palette(): string[];
}

declare namespace Schematic {
  export { SchematicBuilder, DefinitionRegion, ExecutionMode, Diff, Fingerprint, Shape, Brush, BlockPosition };
}

/**
 * Character-map schematic builder (nucleation). NOTE: since 0.3.0 the builder
 * methods return void (no chaining), \`layer\`/\`layers\` take JSON strings, and
 * \`build()\` CONSUMES the builder (a second build throws) and returns the raw
 * native schematic (wrap with new Schematic() + paste if you need the compat
 * class).
 */
declare class SchematicBuilder {
  static create(): SchematicBuilder;
  /** Rebuild a builder from a template string. */
  static fromTemplate(template: string): SchematicBuilder;
  name(name: string): void;
  /** Map a single character to a block string. */
  map(ch: string, block: string): void;
  /** One layer as a JSON array of row strings, e.g. '["SSS","S S","SSS"]'. */
  layer(rowsJson: string): void;
  /** All layers as JSON: '[["SS","SS"],["  ","  "]]'. */
  layers(layersJson: string): void;
  /** Palette pairs as JSON: '[["S","minecraft:stone"]]'. */
  palette(pairsJson: string): void;
  offset(x: number, y: number, z: number): void;
  useStandardPalette(): void;
  validate(): void;
  toTemplate(): string;
  /** Build the schematic. CONSUMES the builder — calling build() twice throws. */
  build(): unknown;
}

/**
 * Structural diff between two schematics (nucleation ≥ 0.3.0 — replaces the
 * old \`before.diff(after, …)\` method). Presets: "exact" | "shape" |
 * "structural" | "redstone" | "redstone_survival".
 */
declare class Diff {
  /** Compute the diff between two schematics (pass the .native of compat instances). */
  static compute(a: unknown, b: unknown, preset: string): Diff;
  static fromJson(json: string): Diff;
  /** Edit distance (BigInt). */
  distance(): bigint;
  /** Similarity in [0, 1]. */
  support(): number;
  toJson(): string;
  summaryJson(): string;
  /** Sub-schematic of blocks only in \`b\` (raw native schematic). */
  added(): unknown;
  /** Sub-schematic of blocks only in \`a\`. */
  removed(): unknown;
  /** Sub-schematic of changed blocks. */
  changed(): unknown;
  /** Sub-schematic of swapped block pairs. */
  swapped(): unknown;
}

/**
 * Content fingerprinting (nucleation ≥ 0.3.0 — replaces the old
 * \`schematic.fingerprint()\` method). Presets: "exact" | "shape" |
 * "structural" | "redstone" | "redstone_survival".
 */
declare class Fingerprint {
  /** Hex fingerprint of a schematic (pass the .native of compat instances). */
  static compute(schematic: unknown, preset: string): string;
  /** Whether two schematics share a fingerprint under the preset. */
  static isDuplicate(a: unknown, b: unknown, preset: string): boolean;
  /** Footprint distance (0 = identical). */
  static footprintDistance(a: unknown, b: unknown, preset: string): number;
}

/** Geometric fill shapes for BuildingTool/brush workflows. */
declare class Shape {
  static cuboid(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Shape;
  static sphere(cx: number, cy: number, cz: number, radius: number): Shape;
  static ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Shape;
  static cylinderBetween(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, radius: number): Shape;
  static line(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, thickness: number): Shape;
}

/** Block/color brushes for shape fills. Palette-filter arguments were removed in 0.3.0 — use Brush.setPalette. */
declare class Brush {
  static solid(blockName: string): Brush;
  static color(r: number, g: number, b: number): Brush;
  static shaded(r: number, g: number, b: number, lx: number, ly: number, lz: number): Brush;
  setPalette(palette: unknown): void;
}

/** A named sub-region of positions/bounds with metadata (nucleation). */
declare class DefinitionRegion {
  static create(): DefinitionRegion;
  static fromBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): DefinitionRegion;
  /** Flat [x0,y0,z0, x1,y1,z1, …] position list. */
  static fromPositions(positions: number[]): DefinitionRegion;
  addBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void;
  addPoint(x: number, y: number, z: number): void;
  contains(x: number, y: number, z: number): boolean;
  volume(): bigint;
  isEmpty(): boolean;
  shift(dx: number, dy: number, dz: number): void;
  expand(x: number, y: number, z: number): void;
  contract(amount: number): void;
  intersected(other: DefinitionRegion): DefinitionRegion;
  unionWith(other: DefinitionRegion): DefinitionRegion;
  subtracted(other: DefinitionRegion): DefinitionRegion;
  setMetadata(key: string, value: string): void;
  getMetadata(key: string): string;
}

/**
 * Simulation run modes (redstone). NOTE: the published nucleation@0.3.0 wasm
 * ships without the simulation engine — these throw until the 0.3.1 wasm
 * (bridge-full) lands.
 */
declare class ExecutionMode {
  static fixedTicks(ticks: number): ExecutionMode;
  static untilChange(maxTicks: number, checkInterval: number): ExecutionMode;
  static untilStable(stableTicks: number, maxTicks: number): ExecutionMode;
}

/** Plain {x, y, z} coordinate holder (compat — generated APIs take plain numbers). */
declare class BlockPosition {
  constructor(x: number, y: number, z: number);
  x: number;
  y: number;
  z: number;
  toArray(): [number, number, number];
}
`;
