import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintTool, hasLintErrors, TOOL_RUNTIMES, type ToolLintIssue } from './lint.js';

const input = (id: string, data: Record<string, unknown> = {}) => ({ id, type: 'input', data: { label: id, dataType: 'number', value: 1, ...data } });
const code = (id: string, source = 'function generate() { return { schematic: null }; }') => ({ id, type: 'code', data: { label: id, code: source, contract: { inputs: {}, outputs: { schematic: { kind: 'schematic' } } } } });
const output = (id = 'out', label = 'schematic') => ({ id, type: 'output', data: { label, dataType: 'schematic' } });
const graph = (over: Record<string, any> = {}) => ({
  nodes: [input('width', { inputName: 'width' }), code('build'), output()],
  edges: [{ id: 'e1', source: 'width', sourceHandle: 'output', target: 'build', targetHandle: 'width' }, { id: 'e2', source: 'build', sourceHandle: 'schematic', target: 'out', targetHandle: 'input' }],
  metadata: { tool: { schemaVersion: 1, timeout: 60, runtime: 'any', output: 'schematic' } },
  ...over,
});
const codes = (issues: ToolLintIssue[]) => issues.filter(i => i.severity === 'error').map(i => i.code).sort();

describe('lintTool', () => {
  it('accepts a well-formed tool', () => {
    const issues = lintTool(graph());
    expect(codes(issues)).toEqual([]);
    expect(hasLintErrors(issues)).toBe(false);
  });

  it('exposes the valid runtimes', () => {
    expect([...TOOL_RUNTIMES]).toEqual(['any', 'server', 'browser']);
  });

  it('requires a timeout of at most 300 seconds', () => {
    expect(codes(lintTool(graph({ metadata: { tool: { runtime: 'any' } } })))).toEqual(['timeout_missing']);
    expect(codes(lintTool(graph({ metadata: { tool: { timeout: 301, runtime: 'any' } } })))).toEqual(['timeout_invalid']);
    expect(codes(lintTool(graph({ metadata: { tool: { timeout: 0, runtime: 'any' } } })))).toEqual(['timeout_invalid']);
    expect(codes(lintTool(graph({ metadata: undefined })))).toEqual(['timeout_missing']);
  });

  it('rejects an unknown runtime and warns when it is not declared', () => {
    expect(codes(lintTool(graph({ metadata: { tool: { timeout: 60, runtime: 'gpu' } } })))).toEqual(['runtime_invalid']);
    const undeclared = lintTool(graph({ metadata: { tool: { timeout: 60 } } }));
    expect(codes(undeclared)).toEqual([]);
    expect(undeclared.some(i => i.code === 'runtime_missing' && i.severity === 'warning')).toBe(true);
  });

  it('requires at least one connected output', () => {
    const g = graph();
    g.nodes = g.nodes.filter(n => n.type !== 'output');
    g.edges = g.edges.filter(e => e.target !== 'out');
    expect(codes(lintTool(g))).toEqual(['output_missing']);
  });

  it('requires stable, unique, identifier-like input names', () => {
    const dup = graph();
    dup.nodes.push(input('width2', { inputName: 'width' }));
    expect(codes(lintTool(dup))).toContain('input_name_duplicate');

    const unnamed = graph();
    unnamed.nodes.push({ id: 'node-17', type: 'input', data: { dataType: 'number', value: 2 } } as any);
    const issues = lintTool(unnamed);
    expect(codes(issues)).toEqual(['input_name_missing']);
    expect(issues.find(i => i.code === 'input_name_missing')?.nodeId).toBe('node-17');

    const spaced = graph();
    spaced.nodes.push(input('Block size', { label: 'Block size' }));
    expect(codes(lintTool(spaced))).toEqual(['input_name_invalid']);
  });

  it('requires every input to have a kind a remote caller can supply', () => {
    const g = graph();
    g.nodes.push(input('blob', { inputName: 'blob', dataType: 'object', value: { a: 1 } }));
    const issues = lintTool(g);
    expect(codes(issues)).toEqual(['input_kind_unsupported']);
    expect(issues.find(i => i.severity === 'error')?.input).toBe('blob');
  });

  it('reports typecheck errors per code node (warnings do not block)', () => {
    const issues = lintTool(graph(), {
      typecheck: (source, node) => node.id === 'build'
        ? [{ line: 1, code: 2304, message: "Cannot find name 'nope'.", category: 'error' }, { line: 2, code: 7044, message: 'implicit any', category: 'suggestion' }]
        : [],
    });
    expect(codes(issues)).toEqual(['code_type_error']);
    const err = issues.find(i => i.code === 'code_type_error')!;
    expect(err).toMatchObject({ nodeId: 'build', line: 1 });
    expect(err.message).toContain("Cannot find name 'nope'");
  });

  it('reports a graph that does not compile', () => {
    const g = graph();
    (g.nodes[1].data as any).contract = undefined;
    expect(codes(lintTool(g))).toContain('compile_failed');
  });
});

describe('official tool graphs', () => {
  const dir = join(__dirname, '../../../../tools');
  const files = [
    ...readdirSync(dir).filter(f => f.endsWith('.json')),
    ...readdirSync(join(dir, 'internal')).filter(f => f.endsWith('.json')).map(f => `internal/${f}`),
  ];
  it('found the graphs', () => expect(files.length).toBeGreaterThanOrEqual(8));
  it.each(files)('%s lints with zero errors and declares a runtime', (file) => {
    const issues = lintTool(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    expect(issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(issues.filter(i => i.code === 'runtime_missing')).toEqual([]);
  });
});
