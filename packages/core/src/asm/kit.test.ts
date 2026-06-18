import { describe, it, expect } from 'vitest';
import {
  parseNumber,
  pack,
  packBytes,
  LabelTable,
  tokenizeLines,
  normalizeLines,
  stripComments,
  define,
  type IsaSpec,
} from './kit.js';

describe('parseNumber', () => {
  it('parses decimal, hex, binary, and underscores', () => {
    expect(parseNumber('255')).toBe(255);
    expect(parseNumber('0xFF')).toBe(255);
    expect(parseNumber('0b1010_0000')).toBe(160);
    expect(parseNumber('0b11')).toBe(3);
    expect(parseNumber('1_000')).toBe(1000);
  });
  it('throws on garbage', () => {
    expect(() => parseNumber('nope')).toThrow();
  });
});

describe('pack / packBytes', () => {
  it('packs lsb-first (ARPU byte1 convention)', () => {
    // opcode=1, op1=1, op2=1 → (1<<6)|(1<<4)|1 = 81
    expect(pack([{ value: 1, bits: 4 }, { value: 1, bits: 2 }, { value: 1, bits: 2 }])).toBe(81);
  });
  it('packs msb-first', () => {
    expect(pack([{ value: 0b10, bits: 2 }, { value: 0b01, bits: 2 }], { order: 'msb' })).toBe(0b1001);
    expect(pack([{ value: 0b10, bits: 2 }, { value: 0b01, bits: 2 }], { order: 'lsb' })).toBe(0b0110);
  });
  it('masks overflowing fields', () => {
    expect(pack([{ value: 0xff, bits: 4 }])).toBe(0xf);
  });
  it('splits values into bytes big/little endian', () => {
    expect(packBytes(0x1234, 2)).toEqual([0x12, 0x34]);
    expect(packBytes(0x1234, 2, { endian: 'le' })).toEqual([0x34, 0x12]);
  });
});

describe('LabelTable', () => {
  it('registers and resolves; throws on unknown', () => {
    const t = new LabelTable('.');
    t.define('.a', 3);
    expect(t.has('.a')).toBe(true);
    expect(t.isLabel('.a')).toBe(true);
    expect(t.isLabel('a')).toBe(false);
    expect(t.resolve('.a')).toBe(3);
    expect(() => t.resolve('.missing')).toThrow();
  });
});

describe('tokenizeLines / stripComments', () => {
  it('strips comments, blanks, collapses whitespace', () => {
    expect(stripComments('ADD R1 R2 // hi')).toBe('ADD R1 R2');
    expect(tokenizeLines('  ADD   R1 R2 // c\n// whole\n\nNOP')).toEqual([['ADD', 'R1', 'R2'], ['NOP']]);
  });
});

describe('define() — tiny toy ISA (LDI / ADD / JMP / NOP)', () => {
  // 8-bit ISA: NOP=00; LDI r,imm → [(r<<4)|1, imm]; ADD a,b → (b<<6)|(a<<4)|2; JMP label → [3, offset]
  const TOY: IsaSpec = {
    wordBits: 8,
    parseRegister: (t) => (t.toUpperCase().startsWith('R') ? parseInt(t[1], 10) : undefined),
    mnemonics: {
      NOP: { opcode: 0, size: 1, encode: () => [0] },
      LDI: { opcode: 1, size: 2, encode: ({ operands: [r, imm] }) => [pack([{ value: 1, bits: 4 }, { value: r, bits: 4 }]), imm] },
      ADD: { opcode: 2, size: 1, encode: ({ operands: [a, b] }) => [pack([{ value: 2, bits: 4 }, { value: a, bits: 2 }, { value: b, bits: 2 }])] },
      JMP: { opcode: 3, size: 2, encode: ({ operands: [target] }) => [3, target] },
    },
  };

  it('assembles a program with a backward label to hand-computed bytes', () => {
    const asm = define(TOY);
    const src = ['LDI R1 5', '.loop', 'ADD R1 R0', 'JMP .loop', 'NOP'].join('\n');
    // LDI@0 (2B) → [0x11,5]; ADD@2 (1B, .loop=2) → [0x12]; JMP@3 → [3,2]; NOP@5 → [0]
    expect(asm.assemble(src)).toEqual([0x11, 5, 0x12, 3, 2, 0]);
  });

  it('honors comments and blank lines', () => {
    const asm = define(TOY);
    expect(asm.assemble('// header\nNOP\n\nADD R0 R1 // inline')).toEqual([0, pack([{ value: 2, bits: 4 }, { value: 0, bits: 2 }, { value: 1, bits: 2 }])]);
  });
});

describe('parseNumber — octal, signs', () => {
  it('parses octal and signed numbers', () => {
    expect(parseNumber('0o17')).toBe(15);
    expect(parseNumber('-5')).toBe(-5);
    expect(parseNumber('+3')).toBe(3);
    expect(parseNumber('0xFF')).toBe(255); // unchanged
  });
});

describe('normalizeLines — multiple + block comments', () => {
  it('strips several inline markers', () => {
    expect(tokenizeLines('ADD ; c\nSUB # c2\nMUL // c3', { comment: ['//', ';', '#'] })).toEqual([['ADD'], ['SUB'], ['MUL']]);
  });
  it('strips block comments across newlines', () => {
    expect(normalizeLines('A /* x\ny */ B', { blockComment: ['/*', '*/'] })).toEqual(['A B']);
  });
});

describe('define() — IR mode (symbols / ports / chars / relative / headers / DW)', () => {
  const IR: IsaSpec = {
    mode: 'ir',
    comment: ['//', ';', '#'],
    blockComment: ['/*', '*/'],
    relativePrefix: '~',
    portPrefix: '%',
    charDelims: ["'"],
    headers: ['BITS', 'MINREG'],
    dataMnemonic: 'DW',
    symbols: {
      registers: { SP: 30 },
      conditions: { eq: 0, '=': 0, ne: 1 },
      ports: { TEXT: 5, NUM: 6 },
      chars: { a: 1, ' ': 0 },
    },
    parseRegister: (t) => (/^R\d+$/i.test(t) ? parseInt(t.slice(1), 10) : undefined),
    mnemonics: { ADD: { opcode: 0 }, JMP: { opcode: 1 }, IN: { opcode: 2 }, OUT: { opcode: 3 } },
  };

  const SRC = [
    'BITS == 8     // word size',
    'MINREG 4 ; min regs',
    '/* a block',
    'comment */',
    '.start',
    'ADD R1 R2 eq   # cond operand',
    'ADD R0 -5 0o17',
    'IN R0 %TEXT',
    "OUT %NUM 'a'",
    'JMP ~+2',
    'JMP .start',
    'DW [1 2 3]',
  ].join('\n');

  const ir = define(IR).assembleIR(SRC);

  it('parses headers', () => {
    expect(ir.headers).toEqual({ BITS: 8, MINREG: 4 });
  });
  it('resolves labels to offsets', () => {
    expect(ir.labels['.start']).toBe(0);
  });
  it('tags register + symbol-namespace operands', () => {
    const add = ir.instructions[0];
    expect(add.mnemonic).toBe('ADD');
    expect(add.operands[0]).toMatchObject({ kind: 'register', value: 1 });
    expect(add.operands[1]).toMatchObject({ kind: 'register', value: 2 });
    expect(add.operands[2]).toMatchObject({ kind: 'symbol', value: 0, symbol: 'conditions', raw: 'eq' });
  });
  it('parses octal + negative immediates', () => {
    const add2 = ir.instructions[1];
    expect(add2.operands[1]).toMatchObject({ kind: 'immediate', value: -5 });
    expect(add2.operands[2]).toMatchObject({ kind: 'immediate', value: 15 });
  });
  it('resolves ports and char literals', () => {
    expect(ir.instructions[2].operands[1]).toMatchObject({ kind: 'port', value: 5, symbol: 'TEXT' });
    expect(ir.instructions[3].operands[0]).toMatchObject({ kind: 'port', value: 6, symbol: 'NUM' });
    expect(ir.instructions[3].operands[1]).toMatchObject({ kind: 'char', value: 1 });
  });
  it('resolves relative (~+2) and label jump targets', () => {
    // JMP ~+2 is the 5th instruction (offset 4) → 4 + 2 = 6.
    expect(ir.instructions[4]).toMatchObject({ mnemonic: 'JMP', offset: 4 });
    expect(ir.instructions[4].operands[0]).toMatchObject({ kind: 'relative', value: 6 });
    expect(ir.instructions[5].operands[0]).toMatchObject({ kind: 'label', value: 0 });
  });
  it('emits DW array data', () => {
    const dw = ir.instructions[6];
    expect(dw.data).toEqual([1, 2, 3]);
  });
});
