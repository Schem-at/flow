/**
 * End-to-end test: SynthaseService executes a v2 block source through the
 * SES compartment path with a fake (pure JS, no WASM) context provider.
 */
import { describe, it, expect } from 'vitest';
import { SynthaseService } from '../services/SynthaseService.js';

/** Fake nucleation-style schematic — pure JS, no WASM. */
class FakeSchematic {
  private blocks = new Map<string, string>();

  set_block(x: number, y: number, z: number, blockType = 'stone'): void {
    this.blocks.set(`${x},${y},${z}`, blockType);
  }

  get_block(x: number, y: number, z: number): string | null {
    return this.blocks.get(`${x},${y},${z}`) ?? null;
  }

  to_schematic(): Uint8Array {
    return new Uint8Array([1, 2, 3]);
  }
}

const makeService = () =>
  new SynthaseService({
    Schematic: FakeSchematic,
    add: (a: number, b: number) => a + b,
  });

describe('SynthaseService v2 block execution (compartment path)', () => {
  it('runs a typed block source end-to-end with ambient context', async () => {
    const service = makeService();

    const source = `
function helper(n: number): number {
  return add(n, 1);
}

function generate(inputs: { a: number; b: number }) {
  const schem = new Schematic();
  schem.set_block(0, 0, 0, 'minecraft:stone');
  return {
    sum: helper(inputs.a) + inputs.b,
    block: schem.get_block(0, 0, 0),
    schem,
  };
}
`;

    const result = await service.executeScript(source, { a: 2, b: 3 });

    expect(result.success).toBe(true);
    const value = result.result as Record<string, unknown>;
    expect(value.sum).toBe(6);
    expect(value.block).toBe('minecraft:stone');
    // Schematic detection (to_schematic) must still work downstream
    expect(result.hasSchematic).toBe(true);
    expect(result.schematics).toHaveProperty('schem');
    expect(typeof result.executionTime).toBe('number');
  });

  it('denies network authority inside blocks', async () => {
    const service = makeService();

    const source = `
function generate(inputs: {}) {
  return {
    fetch: typeof fetch,
    xhr: typeof XMLHttpRequest,
    process: typeof globalThis.process,
  };
}
`;

    const result = await service.executeScript(source, {});
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      fetch: 'undefined',
      xhr: 'undefined',
      process: 'undefined',
    });
  });

  it('enforces the timeout on hanging blocks', async () => {
    const service = makeService();

    const source = `
function generate(inputs: {}) {
  return new Promise(() => {});
}
`;

    const result = await service.executeScript(source, {}, { timeout: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/timeout/i);
  });

  it('surfaces block errors as execution failures', async () => {
    const service = makeService();

    const source = `
function generate(inputs: {}) {
  throw new Error('block exploded');
}
`;

    const result = await service.executeScript(source, {});
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('block exploded');
  });
});
