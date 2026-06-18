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
