import { describe, it, expect } from 'vitest';
import { lintTool } from '@flow/core';
import { createNodeBlockTypechecker } from './block/typecheck';

// The publish gate, with the editor's own TypeScript view: every official tool
// graph must type-check cleanly (no errors, no untyped helpers).
const graphs = {
  ...import.meta.glob('../../../tools/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob('../../../tools/internal/*.json', { eager: true, import: 'default' }),
};
const typecheck = createNodeBlockTypechecker();

describe('official tool graphs pass lintTool with the editor typings', () => {
  it('found every graph', () => expect(Object.keys(graphs).length).toBeGreaterThanOrEqual(8));

  it.each(Object.entries(graphs))('%s', (_path, graph) => {
    const issues = lintTool(graph, { typecheck: (source) => typecheck(source) });
    const blocking = issues.filter((i) => i.severity === 'error' || i.code === 'code_implicit_any' || i.code === 'runtime_missing');
    expect(blocking.map((i) => `${i.code}: ${i.message}`), '\n' + blocking.map((i) => i.message).join('\n')).toEqual([]);
  });

  it('Nucleation byte-slice parameters accept typed arrays (diplomat copies them with TypedArray#set)', () => {
    const diags = typecheck("function generate(): { s: Nucleation.Schematic } { return { s: Nucleation.Schematic.fromData(Bytes.fromBase64('')) }; }");
    expect(diags.filter((d) => d.category === 'error')).toEqual([]);
  });

  it('the typechecker flags a genuine type error', () => {
    const diags = typecheck('function generate(): { n: number } { return { n: "x" }; }');
    expect(diags.some((d) => d.category === 'error')).toBe(true);
  });
});
