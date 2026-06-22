import { describe, it, expect } from 'vitest';
import { compileBlock } from '@flow/core';
import { EXAMPLE_BLOCKS, EXAMPLE_BLOCK_CONTRACTS } from './examples';
import { parseBlockSource } from './parser';

describe('EXAMPLE_BLOCKS', () => {
  it('contains the built-in examples', () => {
    expect(EXAMPLE_BLOCKS.map((b) => b.id)).toEqual([
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
      'julia-grid',
      'schemati-search',
      'schemati-fetch',
      'noise-field',
      'voronoi-field',
      'combine-fields',
      'shape-field',
      'field-to-terrain',
    ]);
  });

  it('julia-grid outputs a list of lists of schematics', async () => {
    const parsed = await parseBlockSource(
      EXAMPLE_BLOCKS.find((b) => b.id === 'julia-grid')!.source
    );
    expect(parsed.contract.outputs).toEqual({
      tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
    });
  });

  for (const example of EXAMPLE_BLOCKS) {
    describe(example.name, () => {
      it('static contract registry matches the parser', async () => {
        const parsed = await parseBlockSource(example.source);
        expect(EXAMPLE_BLOCK_CONTRACTS[example.id]).toBeDefined();
        expect(parsed.contract).toEqual(EXAMPLE_BLOCK_CONTRACTS[example.id]);
      });

      it('parses cleanly with no warnings', async () => {
        const parsed = await parseBlockSource(example.source);
        expect(parsed.warnings).toEqual([]);
        expect(Object.keys(parsed.contract.inputs).length).toBeGreaterThan(0);
        expect(Object.keys(parsed.contract.outputs).length).toBeGreaterThan(0);
        // Accepts every supported form: standalone `type Inputs`/`type Outputs`,
        // inline object `generate(inputs: {…})`, and positional `generate(a, b)`.
        expect(parsed.bodyText).toMatch(/function generate\s*\(/);
      });

      it('compiles with the core compile pipeline', () => {
        expect(() => compileBlock(example.source)).not.toThrow();
      });
    });
  }
});
