import { describe, it, expect } from 'vitest';
import { contractToTypeScript, composeBlockSource } from './codegen';
import { parseBlockSource } from './parser';
import type { BlockContract, FlowType } from '@flow/core';

function contractWith(inputs: Record<string, FlowType>): BlockContract {
  return { inputs, outputs: {} };
}

describe('contractToTypeScript — emission', () => {
  function emit(type: FlowType): string {
    const source = contractToTypeScript(contractWith({ field: type }));
    const match = source.match(/ {2}field: (.*);\n/);
    if (!match) throw new Error(`no field emitted in:\n${source}`);
    return match[1];
  }

  it('emits bare primitives', () => {
    expect(emit({ kind: 'number' })).toBe('number');
    expect(emit({ kind: 'string' })).toBe('string');
    expect(emit({ kind: 'boolean' })).toBe('boolean');
  });

  it('emits sliders with only the present props', () => {
    expect(emit({ kind: 'number', widget: 'slider', min: 0, max: 64, default: 8 })).toBe(
      'Slider<{ min: 0; max: 64; default: 8 }>'
    );
    expect(emit({ kind: 'number', widget: 'slider', step: 0.5 })).toBe('Slider<{ step: 0.5 }>');
    expect(emit({ kind: 'number', widget: 'slider' })).toBe('Slider');
  });

  it('emits number inputs as NumberField', () => {
    expect(emit({ kind: 'number', widget: 'input', min: 1, default: 4 })).toBe(
      'NumberField<{ min: 1; default: 4 }>'
    );
    expect(emit({ kind: 'number', widget: 'input' })).toBe('NumberField');
  });

  it('emits multiline strings as Textarea', () => {
    expect(emit({ kind: 'string', multiline: true, default: 'hi' })).toBe(
      "Textarea<{ default: 'hi' }>"
    );
    expect(emit({ kind: 'string', multiline: true })).toBe('Textarea');
  });

  it('emits booleans with defaults as Toggle', () => {
    expect(emit({ kind: 'boolean', default: true })).toBe('Toggle<{ default: true }>');
    expect(emit({ kind: 'boolean', default: false })).toBe('Toggle<{ default: false }>');
  });

  it('emits enums as literal unions', () => {
    expect(emit({ kind: 'enum', options: ['a', 'b'] })).toBe("'a' | 'b'");
    expect(emit({ kind: 'enum', options: [1, 2, -3] })).toBe('1 | 2 | -3');
    expect(emit({ kind: 'enum', options: ['auto', 0] })).toBe("'auto' | 0");
  });

  it('emits domain types', () => {
    expect(emit({ kind: 'block' })).toBe('Block');
    expect(emit({ kind: 'block', default: 'minecraft:stone' })).toBe(
      "Block<{ default: 'minecraft:stone' }>"
    );
    expect(emit({ kind: 'schematic' })).toBe('Schematic');
    expect(emit({ kind: 'image' })).toBe('Image');
    expect(emit({ kind: 'vec3' })).toBe('Vec3');
  });

  it('emits lists, parenthesizing unions', () => {
    expect(emit({ kind: 'list', of: { kind: 'number' } })).toBe('number[]');
    expect(emit({ kind: 'list', of: { kind: 'enum', options: ['a', 'b'] } })).toBe(
      "('a' | 'b')[]"
    );
    expect(
      emit({ kind: 'list', of: { kind: 'list', of: { kind: 'string' } } })
    ).toBe('string[][]');
  });

  it('emits objects inline', () => {
    expect(
      emit({
        kind: 'object',
        fields: { block: { kind: 'block' }, count: { kind: 'number' } },
      })
    ).toBe('{ block: Block; count: number }');
  });

  it('emits unknown as any', () => {
    expect(emit({ kind: 'unknown' })).toBe('any');
  });

  it('emits empty records as {}', () => {
    expect(contractToTypeScript({ inputs: {}, outputs: {} })).toBe(
      'type Inputs = {};\n\ntype Outputs = {};'
    );
  });
});

describe('composeBlockSource', () => {
  it('joins contract and body with a single trailing newline', () => {
    const source = composeBlockSource(
      { inputs: { n: { kind: 'number' } }, outputs: {} },
      '\nfunction generate(inputs) { return {}; }\n\n'
    );
    expect(source).toBe(
      'type Inputs = {\n  n: number;\n};\n\ntype Outputs = {};\n\nfunction generate(inputs) { return {}; }\n'
    );
  });
});

describe('round-trip: parse(compose(contract, body)).contract === contract', () => {
  const BODY = 'function generate(inputs) { return {}; }';

  const CONTRACTS: Array<[string, BlockContract]> = [
    ['empty', { inputs: {}, outputs: {} }],
    [
      'primitives',
      contractWith({
        a: { kind: 'number' },
        b: { kind: 'string' },
        c: { kind: 'boolean' },
        d: { kind: 'unknown' },
      }),
    ],
    [
      'widgets',
      contractWith({
        size: { kind: 'number', widget: 'slider', min: 0, max: 64, step: 2, default: 8 },
        offset: { kind: 'number', widget: 'slider', min: -16, max: 16 },
        bareSlider: { kind: 'number', widget: 'slider' },
        count: { kind: 'number', widget: 'input', min: 1, default: 4 },
        bareInput: { kind: 'number', widget: 'input' },
        scale: { kind: 'number', widget: 'slider', min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
        notes: { kind: 'string', multiline: true, default: 'hello world' },
        blank: { kind: 'string', multiline: true },
        on: { kind: 'boolean', default: true },
        off: { kind: 'boolean', default: false },
      }),
    ],
    [
      'domain',
      {
        inputs: {
          material: { kind: 'block', default: 'minecraft:gray_concrete' },
          anyBlock: { kind: 'block' },
          schem: { kind: 'schematic' },
        },
        outputs: {
          img: { kind: 'image' },
          pos: { kind: 'vec3' },
        },
      },
    ],
    [
      'enums and lists',
      contractWith({
        roof: { kind: 'enum', options: ['flat', 'gable', 'pyramid'] },
        levels: { kind: 'enum', options: [1, 2, 3] },
        mixed: { kind: 'enum', options: ['auto', 0, 1] },
        sizes: { kind: 'list', of: { kind: 'number' } },
        modes: { kind: 'list', of: { kind: 'enum', options: ['a', 'b'] } },
        grid: { kind: 'list', of: { kind: 'list', of: { kind: 'boolean' } } },
      }),
    ],
    [
      'nested objects (Layer example)',
      {
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
        },
        outputs: {
          result: { kind: 'schematic' },
          blockCounts: {
            kind: 'list',
            of: {
              kind: 'object',
              fields: { block: { kind: 'block' }, count: { kind: 'number' } },
            },
          },
        },
      },
    ],
    [
      'deeply nested object-in-object',
      contractWith({
        config: {
          kind: 'object',
          fields: {
            inner: {
              kind: 'object',
              fields: { flag: { kind: 'boolean', default: true } },
            },
            label: { kind: 'string' },
          },
        },
      }),
    ],
  ];

  for (const [name, contract] of CONTRACTS) {
    it(`round-trips: ${name}`, async () => {
      const source = composeBlockSource(contract, BODY);
      const parsed = await parseBlockSource(source);
      expect(parsed.contract).toStrictEqual(contract);
      expect(parsed.warnings).toEqual([]);
      expect(parsed.bodyText).toBe(BODY);
    });
  }

  it('round-trips strings containing quotes', async () => {
    const contract = contractWith({
      msg: { kind: 'string', multiline: true, default: "it's a 'test'" },
    });
    const parsed = await parseBlockSource(composeBlockSource(contract, BODY));
    expect(parsed.contract).toStrictEqual(contract);
  });
});
