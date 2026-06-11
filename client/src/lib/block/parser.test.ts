import { describe, it, expect } from 'vitest';
import { parseBlockSource } from './parser';
import type { FlowType } from '@flow/core';

/** Parse a contract-only source and return the mapped Inputs record. */
async function parseInputs(fields: string): Promise<Record<string, FlowType>> {
  const parsed = await parseBlockSource(
    `type Inputs = { ${fields} };\ntype Outputs = {};\nfunction generate(inputs) { return {}; }\n`
  );
  return parsed.contract.inputs;
}

describe('parseBlockSource — type mapping', () => {
  it('maps primitive keywords', async () => {
    const inputs = await parseInputs('a: number; b: string; c: boolean');
    expect(inputs).toEqual({
      a: { kind: 'number' },
      b: { kind: 'string' },
      c: { kind: 'boolean' },
    });
  });

  it('maps any/unknown keywords to unknown without warnings', async () => {
    const parsed = await parseBlockSource(
      `type Inputs = { a: any; b: unknown };\ntype Outputs = {};\nfunction generate(inputs) { return {}; }`
    );
    expect(parsed.contract.inputs).toEqual({
      a: { kind: 'unknown' },
      b: { kind: 'unknown' },
    });
    expect(parsed.warnings).toEqual([]);
  });

  it('maps string literal unions to enum', async () => {
    const inputs = await parseInputs("mode: 'flat' | 'gable' | 'pyramid'");
    expect(inputs.mode).toEqual({ kind: 'enum', options: ['flat', 'gable', 'pyramid'] });
  });

  it('maps numeric literal unions to enum, including negatives', async () => {
    const inputs = await parseInputs('level: 1 | 2 | -3');
    expect(inputs.level).toEqual({ kind: 'enum', options: [1, 2, -3] });
  });

  it('maps mixed string/number literal unions to enum', async () => {
    const inputs = await parseInputs("v: 'auto' | 0 | 1");
    expect(inputs.v).toEqual({ kind: 'enum', options: ['auto', 0, 1] });
  });

  it('maps Slider with full config', async () => {
    const inputs = await parseInputs('size: Slider<{ min: 0; max: 64; step: 2; default: 8 }>');
    expect(inputs.size).toEqual({
      kind: 'number',
      widget: 'slider',
      min: 0,
      max: 64,
      step: 2,
      default: 8,
    });
  });

  it('maps Slider with partial config and negative numbers', async () => {
    const inputs = await parseInputs('offset: Slider<{ min: -16; max: 16 }>');
    expect(inputs.offset).toEqual({ kind: 'number', widget: 'slider', min: -16, max: 16 });
  });

  it('maps bare Slider (no config) to a plain slider number', async () => {
    const inputs = await parseInputs('size: Slider');
    expect(inputs.size).toEqual({ kind: 'number', widget: 'slider' });
  });

  it('maps fractional slider config values', async () => {
    const inputs = await parseInputs('scale: Slider<{ min: 0.01; max: 0.2; step: 0.01; default: 0.05 }>');
    expect(inputs.scale).toEqual({
      kind: 'number',
      widget: 'slider',
      min: 0.01,
      max: 0.2,
      step: 0.01,
      default: 0.05,
    });
  });

  it('maps NumberField to widget input', async () => {
    const inputs = await parseInputs('count: NumberField<{ min: 1; default: 4 }>; bare: NumberField');
    expect(inputs.count).toEqual({ kind: 'number', widget: 'input', min: 1, default: 4 });
    expect(inputs.bare).toEqual({ kind: 'number', widget: 'input' });
  });

  it('maps Textarea to multiline string', async () => {
    const inputs = await parseInputs("notes: Textarea<{ default: 'hello' }>; empty: Textarea");
    expect(inputs.notes).toEqual({ kind: 'string', multiline: true, default: 'hello' });
    expect(inputs.empty).toEqual({ kind: 'string', multiline: true });
  });

  it('maps Toggle to boolean with default', async () => {
    const inputs = await parseInputs('on: Toggle<{ default: true }>; off: Toggle<{ default: false }>; bare: Toggle');
    expect(inputs.on).toEqual({ kind: 'boolean', default: true });
    expect(inputs.off).toEqual({ kind: 'boolean', default: false });
    expect(inputs.bare).toEqual({ kind: 'boolean' });
  });

  it('maps Block with and without default', async () => {
    const inputs = await parseInputs("m: Block<{ default: 'minecraft:stone' }>; b: Block");
    expect(inputs.m).toEqual({ kind: 'block', default: 'minecraft:stone' });
    expect(inputs.b).toEqual({ kind: 'block' });
  });

  it('maps domain types', async () => {
    const inputs = await parseInputs('s: Schematic; i: Image; v: Vec3');
    expect(inputs).toEqual({
      s: { kind: 'schematic' },
      i: { kind: 'image' },
      v: { kind: 'vec3' },
    });
  });

  it('maps T[] and Array<T> to list', async () => {
    const inputs = await parseInputs('a: number[]; b: Array<string>');
    expect(inputs.a).toEqual({ kind: 'list', of: { kind: 'number' } });
    expect(inputs.b).toEqual({ kind: 'list', of: { kind: 'string' } });
  });

  it('maps parenthesized union arrays to list of enum', async () => {
    const inputs = await parseInputs("modes: ('a' | 'b')[]");
    expect(inputs.modes).toEqual({
      kind: 'list',
      of: { kind: 'enum', options: ['a', 'b'] },
    });
  });

  it('maps inline type literals to object', async () => {
    const inputs = await parseInputs('p: { x: number; y: number; label: string }');
    expect(inputs.p).toEqual({
      kind: 'object',
      fields: { x: { kind: 'number' }, y: { kind: 'number' }, label: { kind: 'string' } },
    });
  });

  it('resolves local alias references recursively', async () => {
    const parsed = await parseBlockSource(`
type Layer = { schematic: Schematic; height: number };
type Inputs = { layers: Layer[] };
type Outputs = {};
function generate(inputs) { return {}; }
`);
    expect(parsed.contract.inputs.layers).toEqual({
      kind: 'list',
      of: {
        kind: 'object',
        fields: { schematic: { kind: 'schematic' }, height: { kind: 'number' } },
      },
    });
    expect(parsed.warnings).toEqual([]);
  });

  it('resolves interface declarations as object types', async () => {
    const parsed = await parseBlockSource(`
interface Point { x: number; y: number }
type Inputs = { p: Point };
type Outputs = {};
function generate(inputs) { return {}; }
`);
    expect(parsed.contract.inputs.p).toEqual({
      kind: 'object',
      fields: { x: { kind: 'number' }, y: { kind: 'number' } },
    });
  });

  it('supports Inputs/Outputs declared as interfaces', async () => {
    const parsed = await parseBlockSource(`
interface Inputs { size: number }
interface Outputs { result: Schematic }
function generate(inputs) { return {}; }
`);
    expect(parsed.contract).toEqual({
      inputs: { size: { kind: 'number' } },
      outputs: { result: { kind: 'schematic' } },
    });
  });

  it('guards against circular alias references', async () => {
    const parsed = await parseBlockSource(`
type Loop = { next: Loop };
type Inputs = { l: Loop };
type Outputs = {};
function generate(inputs) { return {}; }
`);
    expect(parsed.contract.inputs.l).toEqual({
      kind: 'object',
      fields: { next: { kind: 'unknown' } },
    });
    expect(parsed.warnings.some((w) => w.includes('circular'))).toBe(true);
  });

  it('falls back to unknown with a warning naming the field', async () => {
    const parsed = await parseBlockSource(`
type Inputs = { weird: Map<string, number> };
type Outputs = {};
function generate(inputs) { return {}; }
`);
    expect(parsed.contract.inputs.weird).toEqual({ kind: 'unknown' });
    expect(parsed.warnings.some((w) => w.includes('Inputs.weird'))).toBe(true);
  });

  it('warns when Inputs/Outputs are missing', async () => {
    const parsed = await parseBlockSource('function generate(inputs) { return {}; }');
    expect(parsed.contract).toEqual({ inputs: {}, outputs: {} });
    expect(parsed.warnings.some((w) => w.includes('Inputs'))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes('Outputs'))).toBe(true);
  });
});

describe('parseBlockSource — spec example', () => {
  const SPEC = `type Material = 'minecraft:white_concrete' | 'minecraft:gray_concrete' | 'minecraft:redstone_block';
type Layer = { schematic: Schematic; offset: Slider<{ min: 0; max: 64 }> };
type Inputs = { layers: Layer[]; spacing: Slider<{ min: 0; max: 16; default: 1 }>; material: Material };
type Outputs = { result: Schematic };
function generate(inputs) { return {}; }`;

  it('parses the design-doc example contract', async () => {
    const parsed = await parseBlockSource(SPEC);
    expect(parsed.contract).toEqual({
      inputs: {
        layers: {
          kind: 'list',
          of: {
            kind: 'object',
            fields: {
              schematic: { kind: 'schematic' },
              offset: { kind: 'number', widget: 'slider', min: 0, max: 64 },
            },
          },
        },
        spacing: { kind: 'number', widget: 'slider', min: 0, max: 16, default: 1 },
        material: {
          kind: 'enum',
          options: [
            'minecraft:white_concrete',
            'minecraft:gray_concrete',
            'minecraft:redstone_block',
          ],
        },
      },
      outputs: { result: { kind: 'schematic' } },
    });
    expect(parsed.warnings).toEqual([]);
  });

  it('splits contract and body text', async () => {
    const parsed = await parseBlockSource(SPEC);
    expect(parsed.contractText).toContain('type Material =');
    expect(parsed.contractText).toContain('type Layer =');
    expect(parsed.contractText).toContain('type Inputs =');
    expect(parsed.contractText).toContain('type Outputs =');
    expect(parsed.bodyText).toBe('function generate(inputs) { return {}; }');
  });
});

describe('parseBlockSource — contract/body split', () => {
  it('preserves the body verbatim, including comments and helpers', async () => {
    const body = `// helper above generate
function helper(n) {
  return n * 2; // doubled
}

/** the entry */
function generate(inputs) {
  const value = helper(inputs.size);
  return { value };
}`;
    const source = `type Inputs = { size: number };\ntype Outputs = { value: number };\n\n${body}\n`;
    const parsed = await parseBlockSource(source);
    expect(parsed.bodyText).toBe(body);
    expect(parsed.contractText).toBe(
      'type Inputs = { size: number };\ntype Outputs = { value: number };'
    );
  });

  it('handles interleaved type and code statements in original order', async () => {
    const parsed = await parseBlockSource(`type Inputs = { a: number };
const HELPER = 1;
type Outputs = { b: number };
function generate(inputs) { return { b: HELPER }; }`);
    expect(parsed.contractText).toBe(
      'type Inputs = { a: number };\ntype Outputs = { b: number };'
    );
    expect(parsed.bodyText).toBe(
      'const HELPER = 1;\nfunction generate(inputs) { return { b: HELPER }; }'
    );
  });
});
