import { describe, it, expect } from 'vitest';
import { DEFAULT_BLOCK_SOURCE, DEFAULT_BLOCK_CONTRACT } from './io-compat';
import { parseBlockSource } from './parser';
import { blockDiagnostics, implicitAnyDiagnostics } from './tsDiagnostics.testutil';

// Bug #30: the template every new code node starts from produced the editor
// warning "Parameter 'inputs' implicitly has an 'any' type".
describe('DEFAULT_BLOCK_SOURCE (new code node template)', () => {
  it('the diagnostics harness does catch an untyped generate(inputs)', () => {
    const untyped = DEFAULT_BLOCK_SOURCE.replace(/function generate\([^)]*\)[^{]*\{/, 'function generate(inputs) {');
    expect(untyped).toContain('function generate(inputs) {');
    expect(implicitAnyDiagnostics(untyped).map((d) => d.code)).toContain(7044);
  });

  it('has no implicit-any diagnostic in the editor', () => {
    expect(implicitAnyDiagnostics(DEFAULT_BLOCK_SOURCE)).toEqual([]);
  });

  it('has no diagnostics at all in the editor', () => {
    expect(blockDiagnostics(DEFAULT_BLOCK_SOURCE)).toEqual([]);
  });

  it('types generate with the declared Inputs and Outputs', () => {
    expect(DEFAULT_BLOCK_SOURCE).toMatch(/function generate\(inputs: Inputs\): Outputs \{/);
  });

  it('still derives the same IO contract', async () => {
    const parsed = await parseBlockSource(DEFAULT_BLOCK_SOURCE);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.contract).toEqual(DEFAULT_BLOCK_CONTRACT);
  });
});
