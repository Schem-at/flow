import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './registry.js';
import { romProvider } from './rom.js';
import { asmProvider } from './asm.js';

// The worker builds its block-execution context via ProviderRegistry.createContext()
// (src/worker/contextProviders.ts → createDefaultRegistry().createContext()), and that
// assembled object is spread verbatim into the SES compartment globals. Asserting the
// assembled context here proves a block's Rom.* / Asm.* calls resolve at execution time.
// We register only the pure-JS primitive providers (off the WASM/nucleation path) but use
// the SAME createContext() assembly the worker uses. This is the regression guard for the
// "global missing in the worker" class of bug.
describe('ISA-agnostic ROM/Asm primitives reach the execution context', () => {
  it('endows working Rom and Asm globals — and NO ARPU-specific global — via createContext()', async () => {
    const ctx = await new ProviderRegistry()
      .register(romProvider)
      .register(asmProvider)
      .createContext({ kind: 'node' });

    const Rom = ctx.Rom as {
      data(b: number[], o?: unknown): string;
      layout(b: number[], c?: unknown): unknown[];
    };
    const Asm = ctx.Asm as {
      define(spec: unknown): { assemble(s: string): number[] };
      parseNumber(t: string): number;
    };

    expect(typeof Rom?.data).toBe('function');
    expect(typeof Rom?.layout).toBe('function');
    expect(typeof Asm?.define).toBe('function');

    // The platform is ISA-agnostic: ARPU is example content, NOT a baked-in global.
    expect(ctx.Arpu).toBeUndefined();

    // Asm.define builds an assembler for an ARBITRARY ISA, whose bytes feed Rom.
    const toy = Asm.define({
      wordBits: 8,
      comment: '//',
      mnemonics: {
        NOP: { opcode: 0, size: 1, encode: () => [0] },
        HLT: { opcode: 1, size: 1, encode: () => [1] },
      },
    });
    const bytes = toy.assemble('NOP\nHLT');
    expect(Array.isArray(bytes)).toBe(true);
    expect(typeof Rom.data(bytes, { base: 16 })).toBe('string');
    expect(Array.isArray(Rom.layout(bytes, { base: 16 }))).toBe(true);
  });
});
