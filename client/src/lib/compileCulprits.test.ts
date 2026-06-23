import { describe, it, expect } from 'vitest';
import { compileCulprits } from './compileCulprits';

const nodes = [
  { id: 'a', type: 'code', data: { code: 'good a' } },
  { id: 'b', type: 'code', data: { code: 'BAD b' } },
  { id: 'c', type: 'code', data: { code: 'good c' } },
  { id: 'in', type: 'input', data: {} },
];

// Fake compiler: throws only for the source containing "BAD".
const fakeCompile = (src: string) => {
  if (src.includes('BAD')) throw new Error(`Type stripping failed near ${src}`);
};

describe('compileCulprits', () => {
  it('returns only the code node(s) whose source fails to compile', () => {
    const culprits = compileCulprits(nodes, fakeCompile);
    expect(culprits.map((c) => c.id)).toEqual(['b']);
    expect(culprits[0].error.message).toContain('Type stripping failed');
  });

  it('returns empty when every code node compiles (failure is in the fold itself)', () => {
    const ok = nodes.map((n) => (n.id === 'b' ? { ...n, data: { code: 'good b' } } : n));
    expect(compileCulprits(ok, fakeCompile)).toEqual([]);
  });

  it('ignores non-code nodes and code nodes without source', () => {
    const culprits = compileCulprits(
      [{ id: 'x', type: 'code', data: {} }, { id: 'v', type: 'viewer', data: { code: 'BAD' } }],
      fakeCompile
    );
    expect(culprits).toEqual([]);
  });
});
