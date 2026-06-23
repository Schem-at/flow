import { describe, it, expect } from 'vitest';
import { compileBlock, compileFlow } from '@flow/core';
import { EXAMPLE_FLOWS, EXAMPLE_ROM_GENERATOR_FLOW, ROM_BUILD_SOURCE, ROM_BUILD_CONTRACT } from './exampleFlows';
import { parseBlockSource } from './block/parser';

describe('ROM build block', () => {
  it('compiles and its embedded contract matches the parser', async () => {
    expect(() => compileBlock(ROM_BUILD_SOURCE)).not.toThrow();
    const parsed = await parseBlockSource(ROM_BUILD_SOURCE);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.contract).toEqual(ROM_BUILD_CONTRACT);
  });
});

describe('EXAMPLE_FLOWS', () => {
  it('lists the built-in flows', () => {
    expect(EXAMPLE_FLOWS.map((f) => f.id)).toEqual([
      'example-julia-stitch',
      'example-worldgen',
      'example-mandelbrot',
      'example-rom-generator',
    ]);
  });

  it('example-rom-generator folds and emits a schematic rom output', () => {
    const folded = compileFlow(EXAMPLE_ROM_GENERATOR_FLOW);
    expect(folded.contract.outputs.rom?.kind).toBe('schematic');
  });

  // The worker runs compileBlock(folded.source); a fold whose `type Inputs` has
  // a space-labelled input ("world size") emits invalid TS and fails to strip —
  // surfacing as an error on every node. Lock every example's FOLDED source.
  for (const flow of EXAMPLE_FLOWS) {
    it(`${flow.id}: folded source compiles (strips types)`, () => {
      const folded = compileFlow(flow);
      expect(() => compileBlock(folded.source)).not.toThrow();
    });
  }

  for (const flow of EXAMPLE_FLOWS) {
    describe(flow.name, () => {
      const codeNodes = flow.nodes.filter((n) => n.type === 'code');

      it('has unique node and edge ids, and edges reference real nodes/ports', () => {
        const nodeIds = new Set(flow.nodes.map((n) => n.id));
        expect(nodeIds.size).toBe(flow.nodes.length);
        expect(new Set(flow.edges.map((e) => e.id)).size).toBe(flow.edges.length);

        for (const edge of flow.edges) {
          expect(nodeIds.has(edge.source)).toBe(true);
          expect(nodeIds.has(edge.target)).toBe(true);
          const target = flow.nodes.find((n) => n.id === edge.target)!;
          if (target.type === 'code') {
            expect(Object.keys(target.data.contract!.inputs)).toContain(edge.targetHandle);
          }
          const source = flow.nodes.find((n) => n.id === edge.source)!;
          if (source.type === 'code') {
            expect(Object.keys(source.data.contract!.outputs)).toContain(edge.sourceHandle);
          }
        }
      });

      for (const node of codeNodes) {
        describe(`node ${node.data.label}`, () => {
          it('compiles with the core pipeline', () => {
            expect(() => compileBlock(node.data.code!)).not.toThrow();
          });

          it('embedded contract matches what the parser derives from the source', async () => {
            const parsed = await parseBlockSource(node.data.code!);
            expect(parsed.warnings).toEqual([]);
            expect(parsed.contract).toEqual(node.data.contract);
          });
        });
      }
    });
  }
});
