import { describe, it, expect } from 'vitest';
import { EXAMPLE_BLOCKS } from './examples';
import {
  JULIA_STITCH_FLOW,
  WORLDGEN_FLOW,
  MANDELBROT_FLOW,
  EXAMPLE_ROM_GENERATOR_FLOW,
} from '../exampleFlows';
import { blockDiagnostics, IMPLICIT_ANY_CODES } from './tsDiagnostics.testutil';
// Bug #35: examples used the deprecated `set_block` and left `generate` and
// helpers untyped, so opening one in the editor showed implicit-any warnings.
// Every example the user can open must be clean in the editor's own TS view.

interface GraphLike {
  nodes?: Array<{ id: string; type?: string; data?: { code?: unknown; label?: unknown } }>;
}

function codeNodes(name: string, graph: GraphLike): Array<{ name: string; source: string }> {
  return (graph.nodes ?? [])
    .filter((n) => typeof n.data?.code === 'string' && /\bgenerate\b/.test(n.data.code as string))
    .map((n) => ({ name: `${name} / ${String(n.data?.label ?? n.id)}`, source: n.data!.code as string }));
}

const SOURCES: Array<{ name: string; source: string }> = [
  ...EXAMPLE_BLOCKS.map((b) => ({ name: `block example ${b.id}`, source: b.source })),
  // The example flows authored in exampleFlows.ts. (EXAMPLE_FLOWS also lists the
  // showcase tool graphs from flow/tools/*.json; those are production tools,
  // not examples, and are not covered here.)
  ...[JULIA_STITCH_FLOW, WORLDGEN_FLOW, MANDELBROT_FLOW, EXAMPLE_ROM_GENERATOR_FLOW].flatMap((f) =>
    codeNodes(`flow ${f.name}`, f as unknown as GraphLike)
  ),
];

describe('example block sources typecheck in the editor', () => {
  it('found the example sources', () => {
    expect(SOURCES.length).toBeGreaterThan(EXAMPLE_BLOCKS.length);
  });

  it('the set_block back-compat alias still typechecks but is flagged deprecated', () => {
    const diags = blockDiagnostics(
      `function generate(): { s: Schematic } {\n  const s = new Schematic();\n  s.set_block(0, 0, 0, 'minecraft:stone');\n  return { s };\n}\n`
    );
    expect(diags.filter((d) => d.category === 'error')).toEqual([]);
    // 6385/6387: "'x' is deprecated" / "The signature ... is deprecated" (Monaco strikes it through).
    expect(diags.some((d) => (d.code === 6385 || d.code === 6387) && /set_block/.test(d.message))).toBe(true);
  });

  for (const { name, source } of SOURCES) {
    describe(name, () => {
      it('does not use the deprecated set_block', () => {
        expect(source).not.toMatch(/\bset_block\b/);
      });

      it('has zero TS errors and zero implicit-any diagnostics', () => {
        const problems = blockDiagnostics(source)
          .filter((d) => d.category === 'error' || IMPLICIT_ANY_CODES.has(d.code))
          .map((d) => `L${d.line} TS${d.code}: ${d.message}`);
        expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
      });
    });
  }
});
