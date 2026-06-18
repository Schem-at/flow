import { describe, it, expect } from 'vitest';
import { assembleBatpu2 } from '@flow/core';

// Fixtures: each <name>.as is a real BatPU-2 sample program; each <name>.mc is the
// machine code mattbatwings' own assembler.py produced for it (one 16-bit binary
// string per line). Our hand-rolled port must reproduce those words exactly.
// Loaded via Vite's ?raw so the test stays filesystem-independent under vitest.
import helloworldAs from './__fixtures__/batpu2/helloworld.as?raw';
import helloworldMc from './__fixtures__/batpu2/helloworld.mc?raw';
import dvdAs from './__fixtures__/batpu2/dvd.as?raw';
import dvdMc from './__fixtures__/batpu2/dvd.mc?raw';
import golAs from './__fixtures__/batpu2/gol.as?raw';
import golMc from './__fixtures__/batpu2/gol.mc?raw';
import calculatorAs from './__fixtures__/batpu2/calculator.as?raw';
import calculatorMc from './__fixtures__/batpu2/calculator.mc?raw';

const PROGRAMS: Array<{ name: string; src: string; mc: string }> = [
  { name: 'helloworld', src: helloworldAs, mc: helloworldMc },
  { name: 'dvd', src: dvdAs, mc: dvdMc },
  { name: 'gol', src: golAs, mc: golMc },
  { name: 'calculator', src: calculatorAs, mc: calculatorMc },
];

/** Parse a .mc file (one 16-bit binary string per line) into machine-code words. */
const parseMc = (mc: string): number[] =>
  mc
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => parseInt(l, 2));

describe('BatPU-2 assembler — assembler.py parity', () => {
  for (const prog of PROGRAMS) {
    it(`assembles ${prog.name}.as word-for-word identically to assembler.py`, () => {
      expect(assembleBatpu2(prog.src)).toEqual(parseMc(prog.mc));
    });
  }
});

describe('BatPU-2 encoding & pseudo-instructions', () => {
  it('encodes a 3-reg add (add r1 r2 r3 → r3 = r1+r2)', () => {
    // opcode add=2<<12 | A(r1=1)<<8 | B(r2=2)<<4 | C(r3=3) = 0x2123
    expect(assembleBatpu2('add r1 r2 r3')).toEqual([0x2123]);
  });
  it('encodes ldi with a port symbol and a char immediate', () => {
    // ldi(8)<<12 | r15(15)<<8 | write_char(247 & 0xFF=0xF7) = 0x8FF7
    expect(assembleBatpu2('ldi r15 write_char')).toEqual([0x8ff7]);
    // ldi(8)<<12 | r14(14)<<8 | "h"(=8) = 0x8E08
    expect(assembleBatpu2('ldi r14 "H"')).toEqual([0x8e08]);
  });
  it('expands the lsh pseudo-op (lsh A C → add A A C)', () => {
    // add(2)<<12 | r1<<8 | r1<<4 | r2 = 0x2112
    expect(assembleBatpu2('lsh r1 r2')).toEqual([0x2112]);
  });
  it('expands inc/dec pseudo-ops to adi ±1 (2s-complement imm)', () => {
    // inc r1 → adi r1 1: adi(9)<<12 | r1<<8 | 1 = 0x9101
    expect(assembleBatpu2('inc r1')).toEqual([0x9101]);
    // dec r1 → adi r1 -1: adi<<12 | r1<<8 | (-1 & 0xFF = 0xFF) = 0x91FF
    expect(assembleBatpu2('dec r1')).toEqual([0x91ff]);
  });
  it('encodes a conditional branch with a condition symbol + label', () => {
    // .top \n brh eq .top : brh(11=0xB)<<12 | cond(eq=0)<<10 | addr(0) = 0xB000
    expect(assembleBatpu2('.top\nbrh eq .top')).toEqual([0xb000]);
  });
  it('honors a bare `define NAME VALUE` directive', () => {
    // define X 42 ; ldi r1 X → ldi<<12 | r1<<8 | 42 = 0x812A
    expect(assembleBatpu2('define X 42\nldi r1 X')).toEqual([0x812a]);
  });
  it('defaults the lod/str offset to 0', () => {
    // str r15 r0  → str(15=0xF)<<12 | r15<<8 | r0<<4 | off(0) = 0xFF00
    expect(assembleBatpu2('str r15 r0')).toEqual([0xff00]);
  });
});
