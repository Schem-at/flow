/**
 * nucleation provider — encapsulates the WASM init and exposes the Schematic
 * family of endowments. Swapping nucleation versions means swapping this
 * provider's import/loader; nothing else changes.
 *
 * nucleation ≥ 0.3.0 ships Diplomat-generated bindings (one class per domain
 * type, camelCase methods, exceptions instead of sentinels, JSON/base64
 * payloads; the package instantiates its wasm on first import via top-level
 * await — browser: fetch, node: fs). The endowed `Schematic` is the COMPAT
 * class from utils/schematic.ts: the new camelCase surface plus deprecated
 * snake_case aliases, so pre-0.3.0 user flows keep running unchanged.
 *
 * Attached statics:
 * - `Schematic.SchematicBuilder` / `Schematic.DefinitionRegion` /
 *   `Schematic.ExecutionMode` — the RAW generated classes (their own APIs
 *   changed upstream: builder methods are no longer chainable, `layers`
 *   takes JSON, `build()` consumes the builder and returns a raw native
 *   schematic).
 * - `Schematic.Diff` / `Schematic.Fingerprint` / `Schematic.Shape` /
 *   `Schematic.Brush` — the new domain types (diffing/fingerprinting moved
 *   off the schematic object upstream).
 * - `Schematic.BlockPosition` — tiny {x,y,z} compat holder (the old wasm
 *   class is gone; generated APIs take plain coordinates).
 *
 * NOTE: nucleation ≥ 0.3.2 wasm is built with `bridge-full` — the meshing/
 * rendering/simulation exports (MeshResult, Renderer, MchprsWorld, the
 * circuit executor behind ExecutionMode) are present and callable. (0.3.0
 * shipped core-`bridge`-only wasm where those threw "wasm.<fn> is not a
 * function".)
 */

import type { RuntimeProvider } from './types.js';
import { initializeSchematicProvider, loadedNucleationModule, SchematicUtils } from '../utils/schematic.js';
import { installSchematicMethods } from '../utils/schematic-methods.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';

export const NUCLEATION_VERSION = '0.3.3';

/** Compat stand-in for the removed wasm `BlockPosition` class (plain coordinates). */
class BlockPosition {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}

export const nucleationProvider: RuntimeProvider = {
  name: 'nucleation',
  version: NUCLEATION_VERSION,
  endowmentKeys: () => PROVIDER_ENDOWMENT_KEYS.nucleation,
  declarations: () => PROVIDER_DECLARATIONS.nucleation,

  async create() {
    // Explicit init: the import + wasm instantiation happen inside
    // initializeSchematicProvider, in trusted scope (outside any sandbox).
    // Only the resulting classes are endowed.
    const SchematicClass = await initializeSchematicProvider();
    const nucleation = loadedNucleationModule() as Record<string, unknown> | null;

    // Ergonomic build/copy/transform/query methods from main's DX audit
    // (fill, line, hollowBox, clone, merge, stack, mirror, rotate, heightmap,
    // blockCounts, bounds + static factories). They call the snake_case
    // surface, which the 0.3.3 compat class still provides as deprecated
    // aliases; the compat class's own blocks() already filters air by
    // default, so main's separate blocks() wrapper is not re-applied here.
    // See utils/schematic-methods.ts (unit-tested without WASM).
    installSchematicMethods(SchematicClass as never);

    // 0.3.3 domain classes from the loaded module (the 0.2.13-era
    // wrapPrototypeMethods/wrapWasmClass proxies are gone — the generated
    // bindings throw typed exceptions, no null-pointer sniffing needed).
    const Schematic = SchematicClass as unknown as Record<string, unknown>;
    if (nucleation) {
      Schematic.SchematicBuilder = nucleation.SchematicBuilder;
      Schematic.DefinitionRegion = nucleation.DefinitionRegion;
      Schematic.ExecutionMode = nucleation.ExecutionMode;
      Schematic.Diff = nucleation.Diff;
      Schematic.Fingerprint = nucleation.Fingerprint;
      Schematic.Shape = nucleation.Shape;
      Schematic.Brush = nucleation.Brush;
    }
    Schematic.BlockPosition = BlockPosition;

    return {
      Schematic: SchematicClass,
      SchematicUtils,
    };
  },
};
