import { describe, it, expect } from 'vitest';
import { compileBlock } from '@flow/core';
import { PARKED_EXAMPLE_BLOCKS, PARKED_EXAMPLE_BLOCK_CONTRACTS } from './examples.parked';
import { parseBlockSource } from './parser';

/**
 * PARKED test — covers the shelved assembler + ROM example blocks so they stay
 * runnable for when the work is picked back up. These blocks are not part of the
 * live EXAMPLE_BLOCKS (see examples.parked.ts).
 */
describe('PARKED_EXAMPLE_BLOCKS', () => {
  it('contains the shelved assembler + ROM examples', () => {
    expect(PARKED_EXAMPLE_BLOCKS.map((b) => b.id)).toEqual([
      'rom-data',
      'rom-schematic',
      'rom-generator',
      'arpu-assembler',
      'custom-isa',
      'batpu2-assembler',
      'urcl-assembler',
      'iris-assembler',
      'carbon-assembler',
      'carbon-rom',
    ]);
  });

  for (const example of PARKED_EXAMPLE_BLOCKS) {
    describe(example.name, () => {
      it('static contract registry matches the parser', async () => {
        const parsed = await parseBlockSource(example.source);
        expect(PARKED_EXAMPLE_BLOCK_CONTRACTS[example.id]).toBeDefined();
        expect(parsed.contract).toEqual(PARKED_EXAMPLE_BLOCK_CONTRACTS[example.id]);
      });

      it('parses cleanly with no warnings', async () => {
        const parsed = await parseBlockSource(example.source);
        expect(parsed.warnings).toEqual([]);
        expect(Object.keys(parsed.contract.inputs).length).toBeGreaterThan(0);
        expect(Object.keys(parsed.contract.outputs).length).toBeGreaterThan(0);
        expect(parsed.bodyText).toMatch(/function generate\s*\(/);
      });

      it('compiles with the core compile pipeline', () => {
        expect(() => compileBlock(example.source)).not.toThrow();
      });
    });
  }
});
