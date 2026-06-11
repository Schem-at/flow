import { describe, it, expect } from 'vitest';
import { compileBlock } from '@flow/core';
import { EXAMPLE_FLOWS } from './exampleFlows';
import { parseBlockSource } from './block/parser';

describe('EXAMPLE_FLOWS', () => {
  it('lists the built-in flows', () => {
    expect(EXAMPLE_FLOWS.map((f) => f.id)).toEqual([
      'example-julia-stitch',
      'example-maze-solver',
      'example-city',
      'example-terrain-pipeline',
      'example-logic-lab',
      'example-build-report',
    ]);
  });

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
