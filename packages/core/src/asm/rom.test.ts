import { describe, it, expect } from 'vitest';
import { romString, romData, romLayout, romLayoutData, digitsPerByte } from './rom.js';

describe('digitsPerByte', () => {
  it('maps base to digits per 8-bit word', () => {
    expect(digitsPerByte(2)).toBe(8);
    expect(digitsPerByte(4)).toBe(4);
    expect(digitsPerByte(16)).toBe(2);
  });
});

describe('romString / romData', () => {
  it('serialises base-16 words MSB-first', () => {
    expect(romString([0x0a, 0xff], { base: 16 })).toBe('0AFF');
  });
  it('serialises base-2 words at 8 chars each', () => {
    expect(romString([255, 0], { base: 2 })).toBe('1111111100000000');
  });
  it('pads the word count with fill', () => {
    expect(romString([1], { base: 16, padTo: 3 })).toBe('010000');
  });
  it('romData is an alias of romString', () => {
    expect(romData).toBe(romString);
  });
});

describe('romLayout (roms.py coordinate parity)', () => {
  it('stacks word bits on Y and tags 0/15 roles (base 16)', () => {
    const placements = romLayout([0xf0], { base: 16, bitWidth: 2, xWordCount: 1, zWordCount: 1 });
    // 'F0' → digit0 'F'=15 at y=0 (role fifteen); digit1 '0'=0 at y=-2 (role zero, invert default)
    expect(placements).toEqual([
      { x: 0, y: 0, z: 0, value: 15, role: 'fifteen' },
      { x: 0, y: -2, z: 0, value: 0, role: 'zero' },
    ]);
  });

  it('spaces words along X by xOffsets (base 2)', () => {
    // two 1-bit words, bitWidth 1, x spacing 2, no invert → word0 at x=0, word1 at x=2
    const placements = romLayout([1, 1], {
      base: 2,
      bitWidth: 1,
      xWordCount: 2,
      zWordCount: 1,
      xOffsets: [2],
      invertWord: false,
    });
    expect(placements.map((p) => p.x)).toEqual([0, 2]);
    expect(placements.every((p) => p.role === 'data')).toBe(true);
  });
});

describe('romLayoutData (string entrypoint)', () => {
  it('matches romLayout(bytes) for an equivalent digit string', () => {
    const cfg = { base: 16, bitWidth: 2, xWordCount: 4, zWordCount: 2 } as const;
    const bytes = [0x0a, 0xff, 0x00, 0x10];
    const data = romString(bytes, { base: cfg.base, bitWidth: cfg.bitWidth });
    expect(romLayoutData(data, cfg)).toEqual(romLayout(bytes, cfg));
  });
});

// roms.py fidelity — expected values computed independently from the reference
// algorithm in schematic-api api/generators/generator_repository/roms.py.
describe('romLayoutData — roms.py fidelity', () => {
  it('base16, bitWidth 2, 2x2 words, defaults: zero/data/fifteen roles + invert', () => {
    expect(romLayoutData('012F', { base: 16, bitWidth: 2, xWordCount: 2, zWordCount: 2 })).toEqual([
      { x: 0, y: 0, z: 0, value: 0, role: 'zero' },
      { x: 0, y: -2, z: 0, value: 1, role: 'data' },
      { x: 2, y: 0, z: 0, value: 2, role: 'data' },
      { x: 2, y: -2, z: 0, value: 15, role: 'fifteen' },
    ]);
  });

  it('xStagger=even, zStagger=odd, intersection=xor, invertWord=false', () => {
    expect(
      romLayoutData('1234', {
        base: 16,
        bitWidth: 2,
        xWordCount: 2,
        zWordCount: 2,
        xStagger: 'even',
        zStagger: 'odd',
        staggerIntersectionMode: 'xor',
        invertWord: false,
      })
    ).toEqual([
      { x: 0, y: 1, z: 0, value: 1, role: 'data' },
      { x: 0, y: 3, z: 0, value: 2, role: 'data' },
      { x: 2, y: 0, z: 0, value: 3, role: 'data' },
      { x: 2, y: 2, z: 0, value: 4, role: 'data' },
    ]);
  });

  it('multi-element xOffsets cycle [2,3]', () => {
    expect(
      romLayoutData('101101', { base: 2, bitWidth: 1, xWordCount: 4, zWordCount: 1, xOffsets: [2, 3] })
    ).toEqual([
      { x: 0, y: 0, z: 0, value: 1, role: 'data' },
      { x: 2, y: 0, z: 0, value: 0, role: 'zero' },
      { x: 5, y: 0, z: 0, value: 1, role: 'data' },
      { x: 7, y: 0, z: 0, value: 1, role: 'data' },
    ]);
  });

  it('invalid digit (out of base) → role "invalid"', () => {
    const out = romLayoutData('G', { base: 16, bitWidth: 1, xWordCount: 1, zWordCount: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('invalid');
  });
});
