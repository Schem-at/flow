import { describe, it, expect } from 'vitest';
import { lintToolForPublish, hasLintErrors } from './toolLint';

const graph = (code: string, tool: Record<string, unknown> = { timeout: 60, runtime: 'any' }) => ({
  nodes: [
    { id: 'size', type: 'input', data: { label: 'size', inputName: 'size', dataType: 'number', value: 4, toolField: { label: 'Size', help: 'Edge length in blocks.' } } },
    { id: 'build', type: 'code', data: { label: 'Build', code, contract: { inputs: { size: { kind: 'number' } }, outputs: { schematic: { kind: 'schematic' } } } } },
    { id: 'out', type: 'output', data: { label: 'schematic', dataType: 'schematic' } },
  ],
  edges: [
    { id: 'a', source: 'size', sourceHandle: 'output', target: 'build', targetHandle: 'size' },
    { id: 'b', source: 'build', sourceHandle: 'schematic', target: 'out', targetHandle: 'input' },
  ],
  metadata: { tool },
});

const GOOD = `type Inputs = { size: number }; type Outputs = { schematic: Schematic };
function generate(inputs: Inputs): Outputs { progress(0.5, 'Building'); const s = new Schematic(); s.setBlock(0, 0, 0, 'minecraft:stone'); return { schematic: s }; }`;

describe('lintToolForPublish (browser typechecker)', () => {
  it('passes a clean tool', async () => {
    const issues = await lintToolForPublish(graph(GOOD));
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(hasLintErrors(issues)).toBe(false);
  });

  it('blocks a tool whose code does not typecheck', async () => {
    const issues = await lintToolForPublish(graph(GOOD.replace("'minecraft:stone'", '42')));
    expect(hasLintErrors(issues)).toBe(true);
    expect(issues.find((i) => i.code === 'code_type_error')).toMatchObject({ nodeId: 'build', line: 2 });
  });

  it('blocks a tool without a timeout', async () => {
    const issues = await lintToolForPublish(graph(GOOD, { runtime: 'any' }));
    expect(issues.map((i) => i.code)).toContain('timeout_missing');
  });
});
