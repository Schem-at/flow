import { it, expect } from 'vitest';
import { compileFlow } from '@flow/core';
const graphs = import.meta.glob('../../../tools/*.json', { eager: true, import: 'default' });
it.each(Object.entries(graphs))('%s uses ports that exist in the editor', (_path, value) => {
  const graph = value as any;
  expect(() => compileFlow(graph)).not.toThrow();
  const nodes = new Map<string, any>(graph.nodes.map((n: any) => [n.id, n]));
  for (const edge of graph.edges) {
    if (nodes.get(edge.source).type.includes('input')) expect(edge.sourceHandle).toBe('output');
    if (nodes.get(edge.target).type === 'output') expect(edge.targetHandle).toBe('input');
  }
});

it('the statue wires every public input into its graph and records the selected format', () => {
  const graph = graphs['../../../tools/skin-statue.json'] as any;
  for (const node of graph.nodes.filter((n: any) => n.type === 'input')) {
    expect(graph.edges.some((e: any) => e.source === node.id), `${node.id} must affect the graph`).toBe(true);
  }
  const code = graph.nodes.filter((n: any) => n.type === 'code').map((n: any) => n.data.code).join('\n');
  expect(code).not.toMatch(/Blocks\.(statue|palette|measure|export)\(/);
  expect(code).toContain('Nucleation.Schematic.create');
  expect(code).toContain('closestBlock(');
  // The host serializes the schematic output in the selected format; the graph records it in the metadata.
  expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'format', target: 'measure', targetHandle: 'format' }));
  expect(graph.nodes.some((n: any) => n.id === 'export')).toBe(false);
  for (const node of graph.nodes.filter((n: any) => n.type === 'code')) for (const port of Object.keys(node.data.contract.inputs)) {
    expect(graph.edges.some((e: any) => e.target === node.id && e.targetHandle === port), `${node.id}.${port} must be connected`).toBe(true);
  }
});
