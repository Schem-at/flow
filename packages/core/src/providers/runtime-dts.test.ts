import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from './registry.js';
import { flowlibProvider } from './flowlib.js';
import { vendorProvider } from './vendor.js';
import { schematiProvider } from './schemati.js';
import type { RuntimeEnv, RuntimeProvider } from './types.js';

const env: RuntimeEnv = { kind: 'node' };

describe('flow-runtime.d.ts generation', () => {
  const registry = createDefaultRegistry();
  const dts = registry.runtimeDts();

  it('emits the auto-generated banner and input sugars', () => {
    expect(dts).toContain('AUTO-GENERATED');
    expect(dts).toContain('type Slider<');
    expect(dts).toContain('type Block<');
  });

  it('declares every endowment a provider injects (drift guard)', () => {
    for (const { name, keys } of registry.endowmentManifest()) {
      for (const key of keys) {
        if (key === 'Math') continue; // built-in global, not declared
        const declared = new RegExp(`declare (const|class) ${key}\\b`).test(dts);
        expect(declared, `${name} injects '${key}' but it has no declaration in flow-runtime.d.ts`).toBe(true);
      }
    }
  });

  it('exposes the new schematic methods to authors', () => {
    for (const m of ['fill(', 'clone(', 'merge(', 'stack(', 'heightmap(', 'tileGrid(', 'rotate(']) {
      expect(dts, `Schematic.${m} missing from runtime types`).toContain(m);
    }
  });
});

describe('runtime ↔ declared keys parity (drift guard)', () => {
  // Pure-JS providers can be created without WASM; assert what create() returns
  // matches what endowmentKeys() promises.
  const cases: Array<[string, RuntimeProvider]> = [
    ['flowlib', flowlibProvider],
    ['vendor', vendorProvider],
    ['schemati', schematiProvider],
  ];

  it.each(cases)('%s create() keys match endowmentKeys()', async (_name, provider) => {
    const produced = Object.keys(await provider.create(env, {})).sort();
    const declared = [...(provider.endowmentKeys?.() ?? [])].sort();
    expect(produced).toEqual(declared);
  });

  it('nucleation declares the keys it is documented to inject', () => {
    // (create() needs WASM; we assert the manifest instead, which the codegen + the
    // declaration-coverage test above tie back to the actual declarations.)
    const { keys } = createDefaultRegistry().endowmentManifest().find((p) => p.name === 'nucleation')!;
    expect(keys.sort()).toEqual(['Schematic', 'SchematicUtils']);
  });
});
