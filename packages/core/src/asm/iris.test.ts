import { describe, it, expect } from 'vitest';
import { lowerIris, encodeIris, assembleIris, IRIS_OPCODES } from './examples/iris.js';

// IRIS has no reference assembler, so these test the DETERMINISTIC logic only
// (pseudo-op lowering, default-operand fill, field packing, resolution) — not
// hardware-correct bytes. See examples/iris.ts header.

describe('IRIS pseudo-op lowering (matches the sheet "Raw Asm" column)', () => {
  it('lowers two-operand pseudo-ops', () => {
    expect(lowerIris('CMP', ['R1', 'R2'])).toEqual(['SUB', 'R0', 'R1', 'R2']);
    expect(lowerIris('MOV', ['R1', 'R2'])).toEqual(['ADD', 'R1', 'R2', 'R0']);
    expect(lowerIris('RSH', ['R1', 'R2'])).toEqual(['BSR', 'R1', 'R2', '1']);
    expect(lowerIris('NOT', ['R1', 'R2'])).toEqual(['NOR', 'R1', 'R2', 'R0']);
    expect(lowerIris('NEG', ['R1', 'R2'])).toEqual(['SUB', 'R1', 'R0', 'R2']);
    expect(lowerIris('DEC', ['R1', 'R2'])).toEqual(['SUB', 'R1', 'R2', '1']);
  });

  it('lowers one-operand pseudo-ops', () => {
    expect(lowerIris('LSH', ['R3'])).toEqual(['ADD', 'R3', 'R3', 'R3']);
    expect(lowerIris('DEC', ['R5'])).toEqual(['SUB', 'R5', 'R5', '1']);
    expect(lowerIris('CALR', ['R7'])).toEqual(['CALR', 'R0', 'R7', 'R0']);
    expect(lowerIris('SETX', ['R4'])).toEqual(['SETX', 'R0', 'R4', 'R0']);
    expect(lowerIris('MOV', ['R2'])).toEqual(['ADD', 'R0', 'R2', 'R0']);
  });

  it('lowers zero-operand pseudo-ops', () => {
    expect(lowerIris('NOP', [])).toEqual(['NOP', 'R0', 'R0', 'R0']);
    expect(lowerIris('RET', [])).toEqual(['RET', 'R0', 'R0', 'R0']);
    expect(lowerIris('LINE', [])).toEqual(['LINE', 'R0', 'R0', 'R0']);
  });
});

describe('IRIS default-operand filling for base instructions', () => {
  it('fills 2-operand → C=A=x, B=y; passes 3-operand through', () => {
    expect(lowerIris('ADD', ['R1', 'R2'])).toEqual(['ADD', 'R1', 'R1', 'R2']);
    expect(lowerIris('ADD', ['R1', 'R2', 'R3'])).toEqual(['ADD', 'R1', 'R2', 'R3']);
    expect(lowerIris('NOR', ['R8', 'R9'])).toEqual(['NOR', 'R8', 'R8', 'R9']);
  });

  it('rejects branch/immediate-ROM opcodes (documented TODO) and unknowns', () => {
    expect(() => lowerIris('JMP', ['R1'])).toThrow();
    expect(() => lowerIris('HLT', [])).toThrow();
    expect(() => lowerIris('FOO', [])).toThrow(/unknown/i);
  });
});

describe('IRIS field packing (assumed 24-bit opcode·C·flag·B·A = 5·5·4·5·5)', () => {
  it('packs opcode/C/A/B into the documented bit positions', () => {
    const w = encodeIris(IRIS_OPCODES.ADD, /*C*/ 1, /*A*/ 2, /*B*/ 3);
    expect((w >>> 19) & 31).toBe(IRIS_OPCODES.ADD); // opcode
    expect((w >>> 14) & 31).toBe(1); // C (dest)
    expect((w >>> 10) & 15).toBe(0); // flag (default)
    expect((w >>> 5) & 31).toBe(3); // B (src2)
    expect(w & 31).toBe(2); // A (src1)
    expect(w).toBeLessThan(1 << 24); // fits 24 bits
  });
});

describe('IRIS assembleIris (best-effort end-to-end)', () => {
  it('assembles a small program and resolves registers/opcodes', () => {
    const words = assembleIris('ADD R1 R2 R3\nMOV R4 R5\nNOP');
    expect(words.length).toBe(3);
    // ADD R1 R2 R3
    expect((words[0] >>> 19) & 31).toBe(IRIS_OPCODES.ADD);
    expect((words[0] >>> 14) & 31).toBe(1);
    expect((words[0] >>> 5) & 31).toBe(3);
    expect(words[0] & 31).toBe(2);
    // MOV R4 R5 → ADD R4 R5 R0
    expect((words[1] >>> 19) & 31).toBe(IRIS_OPCODES.ADD);
    expect((words[1] >>> 14) & 31).toBe(4);
    expect(words[1] & 31).toBe(5);
    expect((words[1] >>> 5) & 31).toBe(0);
    // NOP → opcode 0, all-zero fields
    expect(words[2]).toBe(0);
  });

  it('resolves labels to their instruction address as a field value', () => {
    // .start attaches to the first ADD (address 0); used as a B operand below.
    const words = assembleIris('.start\nADD R1 R1 R2\nADD R2 R2 .start');
    expect(words.length).toBe(2);
    expect((words[1] >>> 5) & 31).toBe(0); // B = .start = 0
  });

  it('rejects out-of-range registers and large immediates (TODO IMMROM)', () => {
    expect(() => assembleIris('ADD R30 R1 R2')).toThrow();
    expect(() => assembleIris('HPSH R1')).toThrow(/5-bit|immediate/i);
  });
});
