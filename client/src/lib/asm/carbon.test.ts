import { describe, it, expect } from 'vitest';
import { assembleCarbon, carbonToHex, CARBON_OPCODES } from '@flow/core';

// Source programs (real, runnable Carbon 1.1 assembly).
import lineAs from './__fixtures__/carbon/line.s?raw';
import counterAs from './__fixtures__/carbon/counter.s?raw';
import mathAs from './__fixtures__/carbon/math.s?raw';
import coverageAs from './__fixtures__/carbon/coverage.s?raw';
import dataAs from './__fixtures__/carbon/data.s?raw';
import fibonacciAs from './__fixtures__/carbon/fibonacci.s?raw';
import mandelbrotAs from './__fixtures__/carbon/mandelbrot.s?raw';
import mandelbrotMc from './__fixtures__/carbon/mandelbrot.mc?raw';

/**
 * Ground truth: every expected byte array below was produced by BUILDING AND
 * RUNNING tony-ist's reference Rust assembler (carbon1dot1-assembler) on the exact
 * fixture source. `assembleCarbon` must match it byte-for-byte.
 */
const REFERENCE: Record<string, number[]> = {
  line: [123, 0, 224, 129, 225, 130, 137, 132, 138, 214, 10, 20, 179, 0, 8, 11, 139, 215, 176, 0, 6, 240],
  counter: [121, 0, 137, 208, 9, 176, 0, 0, 240],
  math: [120, 7, 129, 120, 5, 65, 180, 0, 12, 120, 0, 209, 240, 120, 255, 209, 240],
  coverage: [
    120, 200, 125, 12, 29, 53, 45, 96, 3, 104, 1, 69, 77, 85, 93, 145, 153, 130, 138, 192,
    200, 211, 220, 99, 229, 190, 234, 32, 0, 160, 37, 183, 0, 30, 168, 240,
  ],
  data: [120, 1, 65, 66, 240, 240],
  fibonacci: [120, 0, 122, 1, 26, 208, 34, 131, 138, 208, 139, 176, 0, 2, 240],
};

const SOURCES: Record<string, string> = {
  line: lineAs,
  counter: counterAs,
  math: mathAs,
  coverage: coverageAs,
  data: dataAs,
  fibonacci: fibonacciAs,
};

describe('Carbon 1.1 assembler — byte-exact vs the reference', () => {
  for (const [name, expected] of Object.entries(REFERENCE)) {
    it(`assembles "${name}" byte-for-byte`, () => {
      expect(assembleCarbon(SOURCES[name])).toEqual(expected);
    });
  }

  it('every program ends with the implicit HLT (0xF0)', () => {
    for (const src of Object.values(SOURCES)) {
      const bytes = assembleCarbon(src);
      expect(bytes[bytes.length - 1]).toBe((CARBON_OPCODES.HLT << 3) & 0xff);
    }
  });

  it('encodes BRC as 3 bytes with the -2 pipeline offset', () => {
    // .loop is at pc-address 2 here → low byte = (2 % 128) - 2 = 0.
    const bytes = assembleCarbon('LIM R1 0\n.loop\nINC R1\nBRC JMP .loop\n');
    // LIM(2) INC(1) BRC(3) HLT(1) = 7 bytes; BRC opword = (22<<3)|JMP(0) = 176.
    expect(bytes).toEqual([121, 0, 9, 176, 0, 0, 240]);
  });

  it('assembles the full BatPU-2 Mandelbrot port byte-for-byte vs the reference', () => {
    // mandelbrot.mc is the Rust reference assembler's output for mandelbrot.s.
    const expected = mandelbrotMc.trim().split(/\s+/).map(Number);
    const bytes = assembleCarbon(mandelbrotAs);
    expect(bytes.length).toBe(expected.length);
    expect(bytes).toEqual(expected);
  });

  it('renders hex', () => {
    expect(carbonToHex([0x7b, 0x00, 0xf0])).toEqual(['7B', '00', 'F0']);
  });

  it('rejects unknown mnemonics and undefined labels', () => {
    expect(() => assembleCarbon('FOO R1')).toThrow(/Unknown instruction/);
    expect(() => assembleCarbon('BRC JMP .nope')).toThrow(/undefined label/);
  });
});
