import { describe, it, expect } from 'vitest';
import { compileBlock, isBlockSource, BlockCompileError, positionalInputNames } from './index.js';

const TERRAIN_LIKE_BLOCK = `
type Inputs = {
  width: Slider<{ min: 8; max: 256; default: 64 }>;
  seed: number;
};
type Outputs = { total: number };

function helper(a: number, b: number): number {
  return a + b;
}

function generate(inputs) {
  const total = helper(inputs.width, inputs.seed) + Offset.value;
  return { total };
}
`;

async function run(source: string, inputs: Record<string, unknown>, ctx: Record<string, unknown> = {}) {
  const compiled = compileBlock(source, { contextKeys: Object.keys(ctx) });
  const fn = (0, eval)(compiled.functionCode) as (
    i: Record<string, unknown>,
    c: Record<string, unknown>
  ) => Promise<unknown>;
  return fn(inputs, ctx);
}

describe('isBlockSource', () => {
  it('detects generate-entry blocks', () => {
    expect(isBlockSource(TERRAIN_LIKE_BLOCK)).toBe(true);
  });

  it('rejects legacy export-default scripts', () => {
    expect(isBlockSource(`export const io = {};\nexport default function () {}`)).toBe(false);
  });
});

describe('compileBlock', () => {
  it('strips types and runs generate with ambient context', async () => {
    const result = await run(TERRAIN_LIKE_BLOCK, { width: 10, seed: 5 }, { Offset: { value: 1 } });
    expect(result).toEqual({ total: 16 });
  });

  it('supports async generate', async () => {
    const src = `async function generate(inputs) { return { v: inputs.x * 2 }; }`;
    expect(await run(src, { x: 21 })).toEqual({ v: 42 });
  });

  it('lets user code shadow context names', async () => {
    const src = `
      function Logger() { return 7; }
      function generate() { return { v: Logger() }; }
    `;
    const result = await run(src, {}, { Logger: { info: () => 0 } });
    expect(result).toEqual({ v: 7 });
  });

  it('rejects blocks without generate', () => {
    expect(() => compileBlock(`function helper() {}`)).toThrow(BlockCompileError);
  });

  it('rejects export statements', () => {
    expect(() => compileBlock(`export function generate() { return {}; }`)).toThrow(
      BlockCompileError
    );
  });

  it('rejects import statements (unused imports are elided as type imports — harmless)', () => {
    expect(() =>
      compileBlock(`import fs from 'fs';\nfunction generate() { return { fs }; }`)
    ).toThrow(BlockCompileError);
  });

  it('produces an ES module wrapper', () => {
    const compiled = compileBlock(`function generate() { return {}; }`);
    expect(compiled.moduleCode).toMatch(/^export default async function/);
  });

  it('handles enum/union and interface declarations', async () => {
    const src = `
      type Material = 'a' | 'b';
      interface Thing { x: number }
      function generate(inputs: { m: Material }) { return { m: inputs.m }; }
    `;
    expect(await run(src, { m: 'a' })).toEqual({ m: 'a' });
  });
});

describe('positional `generate` params', () => {
  it('detects positional vs object/destructure/legacy forms', () => {
    expect(positionalInputNames('function generate(size: Slider<{min:0;max:1}>, seed: number): { o: number } {}')).toEqual(['size', 'seed']);
    // Array-typed (connection) params must split correctly despite the [][] brackets.
    expect(positionalInputNames('function generate(a: number[][], b: number[][]): { out: number[][] } {}')).toEqual(['a', 'b']);
    expect(positionalInputNames('function generate(size: Slider<{min:0;max:1}>): { o: number } {}')).toEqual(['size']);
    expect(positionalInputNames('function generate(inputs: { size: number }) {}')).toBeNull();   // inline object
    expect(positionalInputNames('function generate({ size }: { size: number }) {}')).toBeNull(); // destructure
    expect(positionalInputNames('function generate(inputs) {}')).toBeNull();                      // legacy
    expect(positionalInputNames('const generate = (a: number, b: number): { s: number } => ({ s: a + b })')).toEqual(['a', 'b']);
  });

  it('spreads named inputs positionally and runs', async () => {
    const src = `function generate(a: Slider<{ min: 0; max: 10; default: 2 }>, b: number): { sum: number } { return { sum: a + b }; }`;
    expect(compileBlock(src).functionCode).toContain('generate(__inputs["a"], __inputs["b"])');
    expect(await run(src, { a: 3, b: 4 })).toEqual({ sum: 7 });
  });

  it('still calls the object/inline form with a single arg', async () => {
    const src = `function generate(inputs: { a: number; b: number }): { sum: number } { return { sum: inputs.a + inputs.b }; }`;
    expect(compileBlock(src).functionCode).toContain('generate(__inputs)');
    expect(await run(src, { a: 1, b: 2 })).toEqual({ sum: 3 });
  });
});
