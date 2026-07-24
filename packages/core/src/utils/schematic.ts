/**
 * Schematic provider utilities — nucleation ≥ 0.3.0 (Diplomat-generated bindings).
 *
 * The generated `nucleation` package exposes one class per domain type
 * (`Schematic`, `Diff`, `Fingerprint`, `SchematicBuilder`, …) with camelCase
 * methods, JSON strings for list-shaped data, base64 strings for binary
 * payloads, and exceptions (`Error` whose message carries the `NucleationError`
 * variant) instead of null/sentinel returns. The wasm-bindgen era
 * `SchematicWrapper` (snake_case, in-place `from_*`, `Uint8Array` returns,
 * manual `.free()`) is gone upstream.
 *
 * End-user flow scripts were written against the OLD surface, so this module
 * builds a COMPAT `Schematic` class: the new camelCase API plus deprecated
 * snake_case aliases that delegate to it (each old name logs one deprecation
 * warning per process). Native memory is freed on GC via FinalizationRegistry —
 * there is no manual `.free()` anymore.
 */

import { isSchematicData, type SchematicData } from '../types/index.js';

type NucleationModule = typeof import('nucleation');
type NativeSchematic = InstanceType<NucleationModule['Schematic']>;

/**
 * The compat schematic surface (what user scripts and the worker serialization
 * layer see). Old snake_case members are deprecated aliases of the camelCase
 * ones and will be removed in a future nucleation bump.
 */
export interface SchematicWrapper {
  /** The raw Diplomat-generated `nucleation.Schematic` — full new API. */
  readonly native: unknown;

  // ── New (canonical) surface ────────────────────────────────────────────
  setBlock(x: number, y: number, z: number, blockType?: string): boolean;
  getBlock(x: number, y: number, z: number): string | null;
  setBlockFromString(x: number, y: number, z: number, blockString: string): void;
  setBlockWithProperties(x: number, y: number, z: number, blockName: string, properties: Record<string, string>): void;
  getBlockString(x: number, y: number, z: number): string | null;
  fromData(data: Uint8Array): this;
  fromLitematic(data: Uint8Array): this;
  fromSchematic(data: Uint8Array): this;
  toSchematic(): Uint8Array;
  toLitematic(): Uint8Array;
  saveAs(format: string, version?: string, settings?: string): Uint8Array;
  dimensions(): { x: number; y: number; z: number };
  blockCount(): number;
  volume(): number;
  palette(): string[];
  blocks(options?: { includeAir?: boolean }): Array<{ x: number; y: number; z: number; name: string; properties?: Record<string, string> }>;
  paste(other: SchematicWrapper | unknown, dx?: number, dy?: number, dz?: number): this;
  fillCuboid(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: string): void;
  fillSphere(cx: number, cy: number, cz: number, radius: number, blockType: string): void;
  name(): string | null;
  setName(name: string): void;
  createDefinitionRegionFromPoint(name: string, x: number, y: number, z: number): void;

  // ── Deprecated aliases (pre-0.3.0 names) ───────────────────────────────
  /** @deprecated use setBlock */
  set_block(x: number, y: number, z: number, blockType?: string): void;
  /** @deprecated use getBlock */
  get_block(x: number, y: number, z: number): string | null;
  /** @deprecated use fromData */
  from_data(data: Uint8Array): void;
  /** @deprecated use toSchematic */
  to_schematic(): Uint8Array;
  /** @deprecated use toLitematic */
  to_litematic(): Uint8Array;
  /** @deprecated use dimensions() ({x,y,z}) */
  get_dimensions(): number[];

  size?: { x: number; y: number; z: number };
}

export type SchematicClass = (new (name?: string) => SchematicWrapper) & {
  fromData(data: Uint8Array): SchematicWrapper;
  fromLitematic(data: Uint8Array): SchematicWrapper;
  fromSchematic(data: Uint8Array): SchematicWrapper;
};

/** True when `err` is a thrown `NucleationError.NotFound` (nullable-getter miss). */
function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes('NotFound');
}

const warned = new Set<string>();
function deprecated(oldName: string, newName: string): void {
  if (warned.has(oldName)) return;
  warned.add(oldName);
  console.warn(`[nucleation] Schematic.${oldName}() is deprecated — use ${newName}. The old name still works but will be removed in a future update.`);
}

function b64ToBytes(b64: string): Uint8Array {
  // Node fast path (Buffer is not in the core tsconfig lib — feature-detect at runtime).
  const BufferCtor = (globalThis as Record<string, unknown>).Buffer as
    | { from(s: string, enc: string): Uint8Array }
    | undefined;
  if (BufferCtor) return new Uint8Array(BufferCtor.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The generated bindings emit block `properties` as serialized pairs (`[["facing","north"],…]`). */
function pairsToProps(raw: unknown): Record<string, string> | undefined {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return undefined;
    const out: Record<string, string> = {};
    for (const pair of raw as Array<[string, string]>) out[pair[0]] = pair[1];
    return out;
  }
  if (raw && typeof raw === 'object' && Object.keys(raw as object).length > 0) return raw as Record<string, string>;
  return undefined;
}

/** Build the compat `Schematic` class over a loaded nucleation module. */
function buildCompatSchematic(mod: NucleationModule): SchematicClass {
  const Native = mod.Schematic;
  const Regions = mod.SchematicRegions;

  class Schematic {
    /** The raw Diplomat-generated `nucleation.Schematic` — the full new API. */
    native: NativeSchematic;

    constructor(name = '') {
      this.native = Native.create(name);
    }

    // ── Construction from bytes ──────────────────────────────────────────
    static fromData(data: Uint8Array): Schematic {
      const s = new Schematic();
      s.native = Native.fromData(data as unknown as Array<number>);
      return s;
    }
    static fromLitematic(data: Uint8Array): Schematic {
      const s = new Schematic();
      s.native = Native.fromLitematic(data as unknown as Array<number>);
      return s;
    }
    static fromSchematic(data: Uint8Array): Schematic {
      const s = new Schematic();
      s.native = Native.fromSchematic(data as unknown as Array<number>);
      return s;
    }
    static fromMcstructure(data: Uint8Array): Schematic {
      const s = new Schematic();
      s.native = Native.fromMcstructure(data as unknown as Array<number>);
      return s;
    }

    /** Load bytes INTO this instance (auto-detect format), replacing its contents. */
    fromData(data: Uint8Array): this {
      this.native = Native.fromData(data as unknown as Array<number>);
      return this;
    }
    fromLitematic(data: Uint8Array): this {
      this.native = Native.fromLitematic(data as unknown as Array<number>);
      return this;
    }
    fromSchematic(data: Uint8Array): this {
      this.native = Native.fromSchematic(data as unknown as Array<number>);
      return this;
    }

    // ── Blocks ───────────────────────────────────────────────────────────
    setBlock(x: number, y: number, z: number, blockType?: string): boolean {
      if (blockType == null) throw new Error('Schematic.setBlock: blockType is required (e.g. "minecraft:stone")');
      // Block strings with properties ("minecraft:lever[powered=true]") need the string setter.
      if (blockType.includes('[') || blockType.includes('{')) {
        this.native.setBlockFromString(x, y, z, blockType);
        return true;
      }
      return this.native.setBlock(x, y, z, blockType);
    }
    getBlock(x: number, y: number, z: number): string | null {
      try {
        return this.native.getBlockName(x, y, z);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    }
    setBlockFromString(x: number, y: number, z: number, blockString: string): void {
      this.native.setBlockFromString(x, y, z, blockString);
    }
    setBlockWithProperties(x: number, y: number, z: number, blockName: string, properties: Record<string, string>): void {
      this.native.setBlockWithProperties(x, y, z, blockName, JSON.stringify(properties ?? {}));
    }
    getBlockString(x: number, y: number, z: number): string | null {
      try {
        return this.native.getBlockString(x, y, z);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    }

    /**
     * Every block as `{x, y, z, name, properties?}`. Solid blocks only by
     * default (the #1 example-block footgun); pass `{ includeAir: true }` to
     * also get an entry for every empty cell of the bounding box.
     */
    blocks(options?: { includeAir?: boolean }): Array<{ x: number; y: number; z: number; name: string; properties?: Record<string, string> }> {
      const solid = (JSON.parse(this.native.getAllBlocksJson()) as Array<{ x: number; y: number; z: number; name: string; properties?: unknown }>)
        .map((b) => {
          const props = pairsToProps(b.properties);
          return props ? { x: b.x, y: b.y, z: b.z, name: b.name, properties: props } : { x: b.x, y: b.y, z: b.z, name: b.name };
        })
        .filter((b) => b.name !== 'minecraft:air' && b.name !== 'air');
      if (!options?.includeAir) return solid;
      // Synthesize air entries for the rest of the bounding box (old raw-blocks() behavior).
      const dims = this.native.dimensions();
      const occupied = new Set(solid.map((b) => `${b.x},${b.y},${b.z}`));
      const all = [...solid];
      for (let y = 0; y < dims.y; y++) {
        for (let z = 0; z < dims.z; z++) {
          for (let x = 0; x < dims.x; x++) {
            if (!occupied.has(`${x},${y},${z}`)) all.push({ x, y, z, name: 'minecraft:air' });
          }
        }
      }
      return all;
    }

    /**
     * Copy every non-air block of `other` into this schematic at an offset
     * (block properties, NBT, and block entities ride along). Returns this.
     */
    paste(other: Schematic | { native?: NativeSchematic }, dx = 0, dy = 0, dz = 0): this {
      const src = (other as { native?: NativeSchematic })?.native ?? (other as unknown as NativeSchematic);
      const [minX, minY, minZ, maxX, maxY, maxZ] = JSON.parse(src.boundingBoxJson()) as number[];
      this.native.copyRegion(src, minX, minY, minZ, maxX, maxY, maxZ, minX + dx, minY + dy, minZ + dz, '["minecraft:air"]');
      return this;
    }

    fillCuboid(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: string): void {
      this.native.fillCuboid(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2), blockType);
    }
    fillSphere(cx: number, cy: number, cz: number, radius: number, blockType: string): void {
      this.native.fillSphere(cx, cy, cz, radius, blockType);
    }

    // ── Geometry / metadata ──────────────────────────────────────────────
    dimensions(): { x: number; y: number; z: number } {
      const d = this.native.dimensions();
      return { x: d.x, y: d.y, z: d.z };
    }
    get size(): { x: number; y: number; z: number } {
      return this.dimensions();
    }
    blockCount(): number {
      return this.native.blockCount();
    }
    volume(): number {
      return this.native.volume();
    }
    /** Merged palette block names. */
    palette(): string[] {
      return JSON.parse(this.native.paletteJson()) as string[];
    }
    name(): string | null {
      try {
        return this.native.name();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    }
    setName(name: string): void {
      this.native.setName(name);
    }

    // ── Serialization (binary payloads are base64 in the new bindings) ───
    toSchematic(): Uint8Array {
      return b64ToBytes(this.native.toSchematicB64());
    }
    toLitematic(): Uint8Array {
      return b64ToBytes(this.native.toLitematicB64());
    }
    saveAs(format: string, version = '', settings = ''): Uint8Array {
      return b64ToBytes(this.native.saveAsB64(format, version, settings));
    }

    // ── Regions ──────────────────────────────────────────────────────────
    createDefinitionRegionFromPoint(name: string, x: number, y: number, z: number): void {
      Regions.createFromPoint(this.native, name, x, y, z);
    }
    createDefinitionRegionFromBounds(name: string, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
      Regions.createFromBounds(this.native, name, minX, minY, minZ, maxX, maxY, maxZ);
    }

    // ── Deprecated snake_case aliases (pre-0.3.0 API) ────────────────────
    /** @deprecated use setBlock */
    set_block(x: number, y: number, z: number, blockType?: string): void {
      deprecated('set_block', 'setBlock');
      this.setBlock(x, y, z, blockType);
    }
    /** @deprecated use getBlock */
    get_block(x: number, y: number, z: number): string | null {
      deprecated('get_block', 'getBlock');
      return this.getBlock(x, y, z);
    }
    /** @deprecated use setBlockFromString */
    set_block_from_string(x: number, y: number, z: number, blockString: string): void {
      deprecated('set_block_from_string', 'setBlockFromString');
      this.setBlockFromString(x, y, z, blockString);
    }
    /** @deprecated use fromData */
    from_data(data: Uint8Array): void {
      deprecated('from_data', 'fromData');
      this.fromData(data);
    }
    /** @deprecated use fromLitematic */
    from_litematic(data: Uint8Array): void {
      deprecated('from_litematic', 'fromLitematic');
      this.fromLitematic(data);
    }
    /** @deprecated use fromSchematic */
    from_schematic(data: Uint8Array): void {
      deprecated('from_schematic', 'fromSchematic');
      this.fromSchematic(data);
    }
    /** @deprecated use toSchematic */
    to_schematic(): Uint8Array {
      return this.toSchematic();
    }
    /** @deprecated use toLitematic */
    to_litematic(): Uint8Array {
      return this.toLitematic();
    }
    /** @deprecated use dimensions() — returns {x,y,z} */
    get_dimensions(): number[] {
      deprecated('get_dimensions', 'dimensions() (returns {x, y, z})');
      const d = this.dimensions();
      return [d.x, d.y, d.z];
    }
    /** @deprecated use blockCount */
    get_block_count(): number {
      deprecated('get_block_count', 'blockCount');
      return this.blockCount();
    }
    /** @deprecated use volume */
    get_volume(): number {
      deprecated('get_volume', 'volume');
      return this.volume();
    }
    /** @deprecated use palette */
    get_palette(): string[] {
      deprecated('get_palette', 'palette');
      return this.palette();
    }
    /** @deprecated use getBlockString */
    get_block_string(x: number, y: number, z: number): string | null {
      deprecated('get_block_string', 'getBlockString');
      return this.getBlockString(x, y, z);
    }
  }

  return Schematic as unknown as SchematicClass;
}

// Cache the compat class once loaded
let cachedSchematicClass: SchematicClass | null = null;
let cachedModule: NucleationModule | null = null;

/**
 * Asynchronously initializes the nucleation library and returns the compat
 * `Schematic` class. The wasm is instantiated by the package itself on first
 * import (top-level await).
 * @throws Error if nucleation WASM cannot be loaded
 */
export async function initializeSchematicProvider(): Promise<SchematicClass> {
  if (cachedSchematicClass) {
    return cachedSchematicClass;
  }

  cachedModule = await import('nucleation');
  cachedSchematicClass = buildCompatSchematic(cachedModule);
  return cachedSchematicClass;
}

/** The loaded nucleation module (after `initializeSchematicProvider`), for provider wiring. */
export function loadedNucleationModule(): NucleationModule | null {
  return cachedModule;
}

/**
 * Convert SchematicData (serialized) back to a live compat Schematic (WASM object).
 * This is used when passing schematics between scripts/nodes.
 */
export async function schematicDataToWrapper(schematicData: SchematicData): Promise<SchematicWrapper> {
  const SchematicClass = await initializeSchematicProvider();

  // Get the binary data
  let binaryData: Uint8Array;
  if (schematicData.data instanceof Uint8Array) {
    binaryData = schematicData.data;
  } else if (typeof schematicData.data === 'string') {
    // Handle base64 or other string encodings if needed
    binaryData = new TextEncoder().encode(schematicData.data);
  } else {
    throw new Error('Invalid schematic data format');
  }

  return SchematicClass.fromData(binaryData);
}

/**
 * Process inputs to convert any SchematicData to SchematicWrapper
 * This allows scripts to receive WASM objects even when data was serialized for transfer
 */
export async function processInputSchematics(
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return (await rehydrateSchematics(inputs)) as Record<string, unknown>;
}

/**
 * Deep mirror of the worker's output serialization: SchematicData anywhere in
 * the value tree (lists of lists included) becomes a live SchematicWrapper.
 * Typed arrays and non-plain objects pass through untouched.
 */
async function rehydrateSchematics(value: unknown, depth = 0): Promise<unknown> {
  if (depth > 16 || value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;

  if (isSchematicData(value)) {
    return schematicDataToWrapper(value);
  }

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = await rehydrateSchematics(value[i], depth + 1);
    }
    return out;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = await rehydrateSchematics(item, depth + 1);
    }
    return out;
  }
  return value;
}



/**
 * Utility functions for working with schematics
 */
export const SchematicUtils = {
  /**
   * Create a filled box of blocks
   */
  fillBox(
    schematic: SchematicWrapper,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    blockType: string
  ): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          schematic.setBlock(x, y, z, blockType);
        }
      }
    }
  },

  /**
   * Create a hollow box of blocks
   */
  hollowBox(
    schematic: SchematicWrapper,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    blockType: string
  ): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const isEdge =
            x === minX || x === maxX ||
            y === minY || y === maxY ||
            z === minZ || z === maxZ;
          if (isEdge) {
            schematic.setBlock(x, y, z, blockType);
          }
        }
      }
    }
  },

  /**
   * Create a sphere of blocks
   */
  sphere(
    schematic: SchematicWrapper,
    cx: number, cy: number, cz: number,
    radius: number,
    blockType: string,
    hollow = false
  ): void {
    const r2 = radius * radius;
    const innerR2 = hollow ? (radius - 1) * (radius - 1) : 0;

    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          const d2 = x * x + y * y + z * z;
          if (d2 <= r2 && (!hollow || d2 >= innerR2)) {
            schematic.setBlock(cx + x, cy + y, cz + z, blockType);
          }
        }
      }
    }
  },

  /**
   * Create a cylinder of blocks
   */
  cylinder(
    schematic: SchematicWrapper,
    cx: number, cy: number, cz: number,
    radius: number, height: number,
    blockType: string,
    hollow = false
  ): void {
    const r2 = radius * radius;
    const innerR2 = hollow ? (radius - 1) * (radius - 1) : 0;

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const d2 = x * x + z * z;
        if (d2 <= r2 && (!hollow || d2 >= innerR2)) {
          for (let y = 0; y < height; y++) {
            schematic.setBlock(cx + x, cy + y, cz + z, blockType);
          }
        }
      }
    }
  },


} as const;
