import { describe, it, expect } from 'vitest';
import { extractIo, extractIoDefaults } from './codeBlock';

const BUS = `export const io = {
    inputs: {
        length: { type: 'number', default: 5, description: 'length of the bus' },
        material: {
            type: 'string',
            default: 'minecraft:gray_concrete',
            description: 'Material to use',
            options: ['minecraft:white_concrete', 'minecraft:gray_concrete']
        },
    },
    outputs: {
        schematic: { type: 'object' }
    }
};

export default async function({ length, material }, { Schematic }) {
    return { schematic: new Schematic() };
}`;

describe('extractIo', () => {
  it('parses the io schema including nested options', () => {
    const io = extractIo(BUS);
    expect(io?.inputs?.length?.type).toBe('number');
    expect(io?.inputs?.material?.options).toHaveLength(2);
    expect(io?.outputs?.schematic?.type).toBe('object');
  });

  it('returns null when there is no io block', () => {
    expect(extractIo('export default async function() { return {}; }')).toBeNull();
  });

  it('returns null on malformed io rather than throwing', () => {
    expect(extractIo('export const io = { inputs: { not valid )')).toBeNull();
  });
});

describe('extractIoDefaults', () => {
  it('builds an inputs object from declared defaults', () => {
    expect(extractIoDefaults(BUS)).toEqual({
      length: 5,
      material: 'minecraft:gray_concrete',
    });
  });

  it('returns {} when there is no io block', () => {
    expect(extractIoDefaults('const x = 1;')).toEqual({});
  });
});
