import { describe, it, expect } from 'vitest';
import {
  defaultValueForType,
  defaultInputsForContract,
  validateValue,
  isTypeCompatible,
  type FlowType,
} from './flow-type.js';

describe('defaultValueForType', () => {
  it('uses carried defaults', () => {
    expect(defaultValueForType({ kind: 'number', default: 7 })).toBe(7);
    expect(defaultValueForType({ kind: 'enum', options: ['a', 'b'] })).toBe('a');
  });

  it('recurses for objects', () => {
    expect(
      defaultValueForType({
        kind: 'object',
        fields: { n: { kind: 'number', default: 1 }, s: { kind: 'string' } },
      })
    ).toEqual({ n: 1, s: '' });
  });

  it('builds contract input defaults', () => {
    expect(
      defaultInputsForContract({
        inputs: { width: { kind: 'number', min: 8, default: 64 } },
        outputs: {},
      })
    ).toEqual({ width: 64 });
  });
});

describe('validateValue', () => {
  it('checks number ranges', () => {
    expect(validateValue({ kind: 'number', min: 0, max: 10 }, 5)).toBeNull();
    expect(validateValue({ kind: 'number', min: 0, max: 10 }, 11)).toMatch(/≤ 10/);
  });

  it('recurses into lists of objects', () => {
    const layers: FlowType = {
      kind: 'list',
      of: { kind: 'object', fields: { offset: { kind: 'number' } } },
    };
    expect(validateValue(layers, [{ offset: 1 }])).toBeNull();
    expect(validateValue(layers, [{ offset: 'x' }])).toMatch(/item 0/);
  });
});

describe('isTypeCompatible (edge rules)', () => {
  it('same kinds flow', () => {
    expect(isTypeCompatible({ kind: 'schematic' }, { kind: 'schematic' })).toBe(true);
  });

  it('mismatched kinds are refused', () => {
    expect(isTypeCompatible({ kind: 'string' }, { kind: 'number' })).toBe(false);
    expect(isTypeCompatible({ kind: 'schematic' }, { kind: 'number' })).toBe(false);
  });

  it('enum/string/block interchange', () => {
    expect(isTypeCompatible({ kind: 'enum', options: ['a'] }, { kind: 'string' })).toBe(true);
    expect(isTypeCompatible({ kind: 'string' }, { kind: 'block' })).toBe(true);
  });

  it('unknown is permissive', () => {
    expect(isTypeCompatible({ kind: 'unknown' }, { kind: 'schematic' })).toBe(true);
  });

  it('lists compare element types; objects compare required fields', () => {
    expect(
      isTypeCompatible({ kind: 'list', of: { kind: 'number' } }, { kind: 'list', of: { kind: 'string' } })
    ).toBe(false);
    expect(
      isTypeCompatible(
        { kind: 'object', fields: { a: { kind: 'number' }, b: { kind: 'string' } } },
        { kind: 'object', fields: { a: { kind: 'number' } } }
      )
    ).toBe(true);
    expect(
      isTypeCompatible(
        { kind: 'object', fields: { a: { kind: 'number' } } },
        { kind: 'object', fields: { a: { kind: 'number' }, missing: { kind: 'string' } } }
      )
    ).toBe(false);
  });
});
