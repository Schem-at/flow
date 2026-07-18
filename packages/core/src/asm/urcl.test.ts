import { describe, it, expect } from 'vitest';
import { assembleUrcl, formatUrclIR } from './examples/urcl.js';

// The spec's own "Simple Fibonacci" example (URCL Beta, §Simple Fibonacci).
const FIBONACCI = `
BITS 8
MINREG 2
MINHEAP 0
MINSTACK 0
RUN ROM

IMM R1 0
IMM R2 1
.loop
    ADD R1 R1 R2
    ADD R2 R1 R2
    JMP .loop
`;

// A focused program exercising URCL irregularities: '==' header form, attached
// ports (OUT%TEXT), detached ports (IN %RNG), char escapes ('\\n'), a 3-operand
// branch, a relative target (~+2), and a DW array.
const FEATURES = `
BITS == 8
MINREG 4
.start
    OUT%TEXT '\\n'
    IN %RNG R1
    BNE .start R1 5
    JMP ~+2
    DW [1 2 3]
`;

describe('URCL assembler — resolved IR (the spec Fibonacci example)', () => {
  const ir = assembleUrcl(FIBONACCI);

  it('parses headers (both numeric and keyword values)', () => {
    expect(ir.headers).toMatchObject({ BITS: 8, MINREG: 2, MINHEAP: 0, MINSTACK: 0, RUN: 'ROM' });
  });
  it('resolves the .loop label to its instruction offset', () => {
    expect(ir.labels['.loop']).toBe(2);
  });
  it('produces 5 resolved instructions with tagged operands', () => {
    expect(ir.instructions).toHaveLength(5);
    expect(ir.instructions[0]).toMatchObject({ mnemonic: 'IMM' });
    expect(ir.instructions[0].operands[0]).toMatchObject({ kind: 'register', value: 1 });
    expect(ir.instructions[0].operands[1]).toMatchObject({ kind: 'immediate', value: 0 });
    expect(ir.instructions[2]).toMatchObject({ mnemonic: 'ADD', label: '.loop' });
    expect(ir.instructions[4]).toMatchObject({ mnemonic: 'JMP' });
    expect(ir.instructions[4].operands[0]).toMatchObject({ kind: 'label', value: 2 });
  });
  it('formats a non-empty disassembly listing', () => {
    const out = formatUrclIR(ir);
    expect(out).toContain('RUN ROM');
    expect(out).toContain('JMP');
  });
});

describe('URCL assembler — irregular features', () => {
  const ir = assembleUrcl(FEATURES);

  it('handles attached + detached ports and char escapes', () => {
    expect(ir.instructions[0]).toMatchObject({ mnemonic: 'OUT', label: '.start' });
    expect(ir.instructions[0].operands[0]).toMatchObject({ kind: 'port', symbol: 'TEXT' });
    expect(ir.instructions[0].operands[1]).toMatchObject({ kind: 'char', value: 10 }); // '\n'
    expect(ir.instructions[1]).toMatchObject({ mnemonic: 'IN' });
    expect(ir.instructions[1].operands[0]).toMatchObject({ kind: 'port', symbol: 'RNG' });
  });
  it('resolves a 3-operand branch (label + reg + immediate)', () => {
    expect(ir.instructions[2]).toMatchObject({ mnemonic: 'BNE' });
    expect(ir.instructions[2].operands[0]).toMatchObject({ kind: 'label', value: 0 });
    expect(ir.instructions[2].operands[1]).toMatchObject({ kind: 'register', value: 1 });
    expect(ir.instructions[2].operands[2]).toMatchObject({ kind: 'immediate', value: 5 });
  });
  it('resolves a relative (~+2) target and DW array data', () => {
    // JMP ~+2 sits at offset 3 → 3 + 2 = 5.
    expect(ir.instructions[3].operands[0]).toMatchObject({ kind: 'relative', value: 5 });
    expect(ir.instructions[4].data).toEqual([1, 2, 3]);
  });
});
