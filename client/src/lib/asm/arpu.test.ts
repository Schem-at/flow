import { describe, it, expect } from 'vitest';
import { assemble, romString, romLayout, fromHex, ISA } from '@flow/core';

// Fixtures: each <name>.s is a real arpuemu sample program; each <name>.hex is
// the machine code arpuemu's own assembler produced for it (space-separated
// uppercase bytes). Our port must reproduce those bytes exactly. Loaded via
// Vite's ?raw so the test stays filesystem-independent under vitest.
import fibonacciS from './__fixtures__/fibonacci.s?raw';
import fibonacciH from './__fixtures__/fibonacci.hex?raw';
import bitwiseS from './__fixtures__/bitwise.s?raw';
import bitwiseH from './__fixtures__/bitwise.hex?raw';
import ioS from './__fixtures__/io.s?raw';
import ioH from './__fixtures__/io.hex?raw';
import insertionSortS from './__fixtures__/insertion-sort.s?raw';
import insertionSortH from './__fixtures__/insertion-sort.hex?raw';
import multiplicationS from './__fixtures__/multiplication.s?raw';
import multiplicationH from './__fixtures__/multiplication.hex?raw';
import procedureS from './__fixtures__/procedure.s?raw';
import procedureH from './__fixtures__/procedure.hex?raw';
import otherS from './__fixtures__/other.s?raw';
import otherH from './__fixtures__/other.hex?raw';

const PROGRAMS: Array<{ name: string; src: string; hex: string }> = [
  { name: 'fibonacci', src: fibonacciS, hex: fibonacciH },
  { name: 'bitwise', src: bitwiseS, hex: bitwiseH },
  { name: 'io', src: ioS, hex: ioH },
  { name: 'insertion-sort', src: insertionSortS, hex: insertionSortH },
  { name: 'multiplication', src: multiplicationS, hex: multiplicationH },
  { name: 'procedure', src: procedureS, hex: procedureH },
  { name: 'other', src: otherS, hex: otherH },
];

describe('ARPU assembler — arpuemu parity', () => {
  for (const prog of PROGRAMS) {
    it(`assembles ${prog.name}.s identically to arpuemu`, () => {
      expect(assemble(prog.src)).toEqual(fromHex(prog.hex.trim().split(/\s+/)));
    });
  }
});

describe('instruction & pseudo-instruction encoding', () => {
  it('encodes HALT → RET 1', () => {
    // byte = (0<<6) | (1<<4) | opcode(RET=7) = 0x17
    expect(assemble('HALT')).toEqual([0x17]);
  });
  it('encodes NOP → MOV R1 R1', () => {
    // (0<<6) | (0<<4) | opcode(MOV=15) = 0x0F
    expect(assemble('NOP')).toEqual([0x0f]);
  });
  it('encodes PUSH R2 → SOP R2 0', () => {
    // (0<<6) | (R2=1<<4) | opcode(SOP=13) = 0x1D
    expect(assemble('PUSH R2')).toEqual([0x1d]);
  });
  it('resolves a backward label (JMP .start)', () => {
    expect(assemble('.start\nJMP .start')).toEqual([0x0e, 0x00]);
  });
  it('loads a DW data value via IMM label reference (and DW emits no bytes)', () => {
    expect(assemble('IMM R1 .data\n.data\nDW 42')).toEqual([0x0a, 42]);
  });
  it('exposes the 16-entry ISA with correct opcodes/widths', () => {
    expect(ISA).toHaveLength(16);
    expect(ISA[0]).toEqual({ mnemonic: 'ADD', opcode: 0, bytes: 1 });
    expect(ISA.find((i) => i.mnemonic === 'IMM')).toEqual({ mnemonic: 'IMM', opcode: 10, bytes: 2 });
  });
});

describe('romString — roms.py data serialisation', () => {
  it('base 16: one byte → two hex digits', () => {
    expect(romString([0x0a, 0x1a], { base: 16 })).toBe('0A1A');
  });
  it('base 2: one byte → eight bits, MSB first', () => {
    expect(romString([0x0a, 0x1a], { base: 2 })).toBe('0000101000011010');
  });
  it('pads the word count with fill words', () => {
    expect(romString([0xff], { base: 16, padTo: 3 })).toBe('FF0000');
  });
});

describe('romLayout — roms.py coordinate math', () => {
  it('stacks a word vertically and classifies 0/data cells', () => {
    // base 2, single word 0xA4 = 1010_0100, one word on X and Z, invert (stack down)
    const p = romLayout([0xa4], { base: 2, xWordCount: 1, zWordCount: 1 });
    expect(p).toHaveLength(8);
    expect(p[0]).toEqual({ x: 0, y: 0, z: 0, value: 1, role: 'data' });
    expect(p[1]).toEqual({ x: 0, y: -2, z: 0, value: 0, role: 'zero' });
    expect(p[7].y).toBe(-14);
  });
  it('classifies value 15 as the redstone cell (base 16)', () => {
    const p = romLayout([0xff], { base: 16, xWordCount: 1, zWordCount: 1 });
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ value: 15, role: 'fifteen' });
  });
  it('places successive words along X using x_offsets', () => {
    // two 8-bit words, x spacing 3 → word 1 starts at x=3
    const p = romLayout([1, 1], { base: 2, xWordCount: 2, zWordCount: 1, xOffsets: [3] });
    expect(p[0].x).toBe(0);
    expect(p[8].x).toBe(3);
  });
});
