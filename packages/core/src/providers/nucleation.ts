/**
 * The installed package's complete public API is available as Nucleation.*.
 * The legacy Schematic helper remains for saved graphs. It is optional.
 * TickSimulation is the default simulator for examples; MCHPRS remains an
 * option for fast logical redstone. Upstream builds must supply its WASM exports.
 */

import type { RuntimeProvider } from './types.js';
import { initializeSchematicProvider, loadedNucleationModule, SchematicUtils } from '../utils/schematic.js';
import { installSchematicMethods } from '../utils/schematic-methods.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';

export const NUCLEATION_VERSION = '0.10.23';

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

    // Public exports stay unchanged; upstream additions need no Tools wrapper.
    return {
      Nucleation: Object.freeze({ ...nucleation }),
      Schematic: SchematicClass,
      SchematicUtils,
    };
  },
};
