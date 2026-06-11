import { describe, it, expect } from 'vitest';
import { compileBlock } from '@flow/core';
import { EXAMPLE_BLOCKS } from './examples';
import { parseBlockSource } from './parser';

describe('EXAMPLE_BLOCKS', () => {
  it('contains the built-in examples', () => {
    expect(EXAMPLE_BLOCKS.map((b) => b.id)).toEqual([
      'redstone-bus',
      'parametric-terrain',
      'parametric-building',
      'build-analysis',
      'julia-grid',
      'block-census',
      'hologram-mcfunction',
      'logic-lab',
    ]);
  });

  it('logic-lab exposes the simulated truth table contract', async () => {
    const parsed = await parseBlockSource(
      EXAMPLE_BLOCKS.find((b) => b.id === 'logic-lab')!.source
    );
    expect(parsed.contract).toEqual({
      inputs: { gate: { kind: 'enum', options: ['and', 'nand', 'or', 'not'] } },
      outputs: {
        circuit: { kind: 'schematic' },
        truthTable: {
          kind: 'list',
          of: {
            kind: 'object',
            fields: {
              a: { kind: 'boolean' },
              b: { kind: 'boolean' },
              out: { kind: 'boolean' },
            },
          },
        },
      },
    });
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
      it('parses cleanly with no warnings', async () => {
        const parsed = await parseBlockSource(example.source);
        expect(parsed.warnings).toEqual([]);
        expect(Object.keys(parsed.contract.inputs).length).toBeGreaterThan(0);
        expect(Object.keys(parsed.contract.outputs).length).toBeGreaterThan(0);
        expect(parsed.bodyText).toContain('function generate(inputs)');
      });

      it('compiles with the core compile pipeline', () => {
        expect(() => compileBlock(example.source)).not.toThrow();
      });
    });
  }

  it('redstone-bus exposes the expected contract', async () => {
    const parsed = await parseBlockSource(EXAMPLE_BLOCKS[0].source);
    expect(parsed.contract).toEqual({
      inputs: {
        length: { kind: 'number', widget: 'slider', min: 1, max: 128, default: 16 },
        material: { kind: 'block', default: 'minecraft:gray_concrete' },
      },
      outputs: { schematic: { kind: 'schematic' } },
    });
  });

  it('build-analysis exposes the expected contract', async () => {
    const parsed = await parseBlockSource(EXAMPLE_BLOCKS[3].source);
    expect(parsed.contract).toEqual({
      inputs: { schematic: { kind: 'schematic' } },
      outputs: {
        dimensions: { kind: 'vec3' },
        blockCounts: {
          kind: 'list',
          of: {
            kind: 'object',
            fields: { block: { kind: 'block' }, count: { kind: 'number' } },
          },
        },
        heatmap: { kind: 'image' },
      },
    });
  });
});
