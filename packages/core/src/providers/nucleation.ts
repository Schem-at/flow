/**
 * nucleation provider — encapsulates the WASM init and exposes the Schematic
 * family of endowments. Swapping nucleation versions means swapping this
 * provider's import/loader; nothing else changes.
 *
 * nucleation's own package handles the env split (browser: import.meta.url wasm,
 * node: fs read), so this provider stays isomorphic.
 */

import type { RuntimeProvider } from './types.js';
import { initializeSchematicProvider, SchematicUtils } from '../utils/schematic.js';

export const NUCLEATION_VERSION = '0.2.13';

export const nucleationProvider: RuntimeProvider = {
  name: 'nucleation',
  version: NUCLEATION_VERSION,

  async create() {
    // Explicit init: import + default() happen inside initializeSchematicProvider,
    // in trusted scope (outside any sandbox). Only the resulting classes are endowed.
    const SchematicClass = await initializeSchematicProvider();
    // The shipped nucleation typings lag the runtime API — treat as untyped.
    const nucleation = (await import('nucleation')) as Record<string, any>;

    wrapPrototypeMethods(SchematicClass, 'Schematic');
    wrapPrototypeMethods(nucleation.SchematicBuilderWrapper, 'Schematic.SchematicBuilder');
    wrapPrototypeMethods(nucleation.ExecutionModeWrapper, 'Schematic.ExecutionMode');
    wrapPrototypeMethods(nucleation.BlockPosition, 'Schematic.BlockPosition');
    wrapPrototypeMethods(nucleation.DefinitionRegionWrapper, 'Schematic.DefinitionRegion');

    // ── DX wrappers (see docs/dx-audit.md) ────────────────────────────────
    const proto = (SchematicClass as { prototype: Record<string, any> }).prototype;

    // blocks() excludes air by default — the #1 example-block footgun (every
    // census/analysis block had to filter it manually). Pass { includeAir:
    // true } for the raw list.
    const rawBlocks = proto.blocks;
    proto.blocks = function (this: unknown, options?: { includeAir?: boolean }) {
      const all = rawBlocks.call(this);
      return options?.includeAir
        ? all
        : all.filter((b: { name: string }) => b.name !== 'minecraft:air');
    };

    // paste(other, dx, dy, dz): centralized JS copy loop until nucleation
    // exposes a native offset paste (block properties ride along when the
    // block name string carries them).
    proto.paste = function (
      this: { set_block(x: number, y: number, z: number, name: string): void },
      other: { blocks(): Array<{ x: number; y: number; z: number; name: string }> },
      dx = 0,
      dy = 0,
      dz = 0
    ) {
      for (const b of other.blocks()) {
        this.set_block(b.x + dx, b.y + dy, b.z + dz, b.name);
      }
      return this;
    };

    const Schematic = SchematicClass as Record<string, unknown> & typeof SchematicClass;
    (Schematic as Record<string, unknown>).SchematicBuilder = wrapWasmClass(
      nucleation.SchematicBuilderWrapper,
      'Schematic.SchematicBuilder'
    );
    (Schematic as Record<string, unknown>).ExecutionMode = wrapWasmClass(
      nucleation.ExecutionModeWrapper,
      'Schematic.ExecutionMode'
    );
    (Schematic as Record<string, unknown>).BlockPosition = wrapWasmClass(
      nucleation.BlockPosition,
      'Schematic.BlockPosition'
    );
    (Schematic as Record<string, unknown>).DefinitionRegion = wrapWasmClass(
      nucleation.DefinitionRegionWrapper,
      'Schematic.DefinitionRegion'
    );

    return {
      Schematic,
      SchematicUtils,
    };
  },
};

/**
 * Helper to wrap WASM classes and provide better error messages
 */
function wrapWasmClass(Class: any, name: string) {
  if (!Class) return Class;

  const handler: ProxyHandler<any> = {
    construct(target, args) {
      args.forEach((arg, i) => {
        if (arg === undefined || arg === null) {
          throw new Error(`${name} constructor: Argument ${i} cannot be null or undefined`);
        }
      });
      try {
        return new target(...args);
      } catch (err) {
        const error = err as Error;
        throw new Error(`${name} constructor failed: ${error.message}`);
      }
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Wrap static methods
      if (typeof value === 'function' && typeof prop === 'string' && !['prototype', 'name', 'length', 'toString'].includes(prop)) {
        return function(this: any, ...args: any[]) {
          args.forEach((arg, i) => {
            if (arg === undefined || arg === null) {
              throw new Error(`${name}.${prop}: Argument ${i} cannot be null or undefined`);
            }
          });
          try {
            return value.apply(this, args);
          } catch (err) {
            const error = err as Error;
            if (error.message?.includes('null pointer')) {
               throw new Error(`${name}.${prop} failed: Null pointer passed to Rust. This usually means an argument was invalid or a WASM object was already freed.`);
            }
            throw new Error(`${name}.${prop} failed: ${error.message}`);
          }
        };
      }
      return value;
    }
  };

  return new Proxy(Class, handler);
}

/**
 * Helper to wrap prototype methods of WASM classes
 */
function wrapPrototypeMethods(Class: any, name: string) {
  if (!Class || !Class.prototype) return;

  const proto = Class.prototype;
  const props = Object.getOwnPropertyNames(proto);

  for (const prop of props) {
    // Use getOwnPropertyDescriptor to avoid triggering getters
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (!descriptor || !descriptor.value) continue;

    const value = descriptor.value;
    if (typeof value === 'function' && prop !== 'constructor') {
      proto[prop] = function(this: any, ...args: any[]) {
        args.forEach((arg, i) => {
          if (arg === undefined || arg === null) {
            throw new Error(`${name}.${prop}: Argument ${i} cannot be null or undefined`);
          }
        });
        try {
          return value.apply(this, args);
        } catch (err) {
          const error = err as Error;
          if (error.message?.includes('null pointer')) {
             throw new Error(`${name}.${prop} failed: Null pointer passed to Rust. This usually means an argument was invalid or a WASM object was already freed.`);
          }
          throw new Error(`${name}.${prop} failed: ${error.message}`);
        }
      };
    }
  }
}
