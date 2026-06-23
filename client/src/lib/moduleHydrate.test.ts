import { describe, it, expect } from 'vitest';
import { compileBlock, compileFlow, type FlowLike } from '@flow/core';
import { hydrateModuleToGroup } from './moduleHydrate';

async function runFolded(source: string, inputs: Record<string, unknown>) {
  const ctx = { Progress: { report: () => {} } };
  const compiled = compileBlock(source, { contextKeys: Object.keys(ctx) });
  const fn = (0, eval)(compiled.functionCode) as (
    i: Record<string, unknown>,
    c: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  return fn(inputs, ctx);
}

const IO = {
  inputs: { data: { kind: 'string' } },
  outputs: { rom: { kind: 'schematic' } },
} as const;

describe('hydrateModuleToGroup', () => {
  it('uses a provided subgraph and derives boundary from ioSchema', () => {
    const g = hydrateModuleToGroup(
      {
        subgraph: { nodes: [{ id: 'rg', type: 'code', data: {} }], edges: [] },
        ioSchema: IO,
        version: '1.0.0',
      },
      { id: 'm1', slug: 'rom-gen' }
    );
    expect(g.subgraph.nodes[0].id).toBe('rg');
    expect(g.groupInputs.map((p) => p.name)).toEqual(['data']);
    expect(g.groupOutputs.map((p) => p.name)).toEqual(['rom']);
    expect(g.moduleRef).toEqual({ id: 'm1', slug: 'rom-gen', version: '1.0.0', pinned: false });
  });

  it('round-trips an embedded boundary verbatim (multi-node group)', () => {
    const groupInputs = [
      { name: 'data', internalNodeId: 'a', internalHandle: 'data', externalNodeId: '', externalHandle: null },
    ];
    const groupOutputs = [
      { name: 'rom', internalNodeId: 'b', internalHandle: 'rom', externalNodeId: '', externalHandle: null },
    ];
    const g = hydrateModuleToGroup(
      {
        subgraph: {
          nodes: [
            { id: 'a', type: 'unbundle', data: {} },
            { id: 'b', type: 'code', data: {} },
          ],
          edges: [],
          groupInputs,
          groupOutputs,
        },
        ioSchema: IO,
        version: '3.0.0',
      },
      { id: 'm3', slug: 'multi' }
    );
    // boundary used verbatim (anchored to 'a'/'b', not re-derived to first code node)
    expect(g.groupInputs).toEqual(groupInputs);
    expect(g.groupOutputs).toEqual(groupOutputs);
    // and the boundary keys are stripped out of the stored subgraph
    expect((g.subgraph as { groupInputs?: unknown }).groupInputs).toBeUndefined();
    expect(g.subgraph.nodes).toHaveLength(2);
  });

  it('a hydrated module group folds statically and runs in a parent flow', async () => {
    const code =
      'type Inputs = { x: number };\ntype Outputs = { y: number };\nfunction generate(inputs) { return { y: inputs.x + 1 }; }\n';
    const g = hydrateModuleToGroup(
      { code, ioSchema: { inputs: { x: { kind: 'number' } }, outputs: { y: { kind: 'number' } } }, version: '1.0.0' },
      { id: 'm', slug: 'inc' }
    );
    const flow: FlowLike = {
      nodes: [
        { id: 'in', type: 'input', data: { label: 'x', value: 5 } },
        { id: 'mod', type: 'group', data: { label: 'inc', ...g } },
        { id: 'out', type: 'output', data: { label: 'y' } },
      ],
      edges: [
        { source: 'in', target: 'mod', sourceHandle: 'output', targetHandle: 'x' },
        { source: 'mod', target: 'out', sourceHandle: 'y', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.contract.outputs.y?.kind).toBe('number');
    const result = await runFolded(folded.source, { x: 5 });
    expect(result).toEqual({ y: 6 });
  });

  it('wraps a legacy code blob into a single-code-node subgraph', () => {
    const g = hydrateModuleToGroup(
      { code: 'function generate(i){return {rom:i.data}}', ioSchema: IO, version: '2.0.0' },
      { id: 'm2', slug: 'legacy' }
    );
    const codeNodes = g.subgraph.nodes.filter((n) => n.type === 'code');
    expect(codeNodes).toHaveLength(1);
    expect((codeNodes[0].data as { code?: string }).code).toContain('generate');
    expect(g.groupInputs.map((p) => p.name)).toEqual(['data']);
    expect(g.groupOutputs.map((p) => p.name)).toEqual(['rom']);
    expect(g.groupInputs[0].internalNodeId).toBe(codeNodes[0].id);
    expect(g.moduleRef.version).toBe('2.0.0');
  });
});
