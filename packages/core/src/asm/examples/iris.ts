/**
 * IRIS assembler — a BEST-EFFORT example on the generic Asm helpers. IRIS is a
 * 24-bit Minecraft redstone CPU (the main hardware target that URCL compiles to).
 * Source: the "IRIS - Google Sheets" spec.
 *
 * ⚠️  ENCODING IS UNVERIFIED. Unlike ARPU/BatPU-2 (validated byte-for-byte against
 * a real assembler), IRIS has NO reference assembler/emulator we could check against,
 * and the spec sheet leaves real ambiguities. We therefore assume an encoding and
 * test only the DETERMINISTIC logic (pseudo-op lowering, default-operand filling,
 * field packing into the assumed layout, register/opcode/label resolution) — NOT
 * hardware-correct bytes.
 *
 * ASSUMED ENCODING (24-bit word, MSB→LSB): opcode[5] C[5] flag[4] B[5] A[5]
 *   word = (opcode<<19) | (C<<14) | (flag<<10) | (B<<5) | A
 *   C = destination, A = source1, B = source2; flag defaults to 0 (no-flag).
 *
 * KNOWN UNKNOWNS / TODO (documented, not guessed):
 *   - Exact bit layout / the spec's "bit 0" / total width (24 vs 32/40).
 *   - Large immediates (>5 bits) — IRIS uses an IMM/IMMROM sequence; here a value
 *     that doesn't fit a 5-bit field throws (so CLR/BUFFER/HPSH/HPOP and big
 *     constants are out of scope until IMMROM addressing is pinned down).
 *   - Branch/JMP/HLT opcodes & the flag-field condition encoding (the sheet's flag
 *     column is inconsistent with its 0–31 decoder table). flag is held at 0.
 *
 * What IS faithful (and tested): the 32-opcode decoder table, the pseudo-op "Raw
 * Asm" lowering, C/A/B default filling, and packing into the assumed word.
 */

import { parseNumber } from '../kit.js';

/** IRIS decoder table (opcode 0–31; opcode 4 is reserved/unused in the sheet). */
export const IRIS_OPCODES: Record<string, number> = {
  NOP: 0, UMLT: 1, XOR: 2, LOD: 3, OR: 5, SETX2: 6, MLT: 7, LINE: 8, BSS: 9,
  AND: 10, CALR: 11, SETX: 12, ADD: 13, XNOR: 14, CALI: 15, SETX1: 16, BSL: 17,
  INC: 18, STR: 19, TIMER: 20, NOR: 21, SETY1: 22, MOD: 23, TILE: 24, BSR: 25,
  NAND: 26, RET: 27, SETY: 28, SUB: 29, SETY2: 30, DIV: 31,
};

export const IRIS_WORD_BITS = 24;
export const IRIS_REG_COUNT = 30; // R0 (zero) .. R29 (stack pointer)

class IrisError extends Error {}

/** Resolve a register token `Rn`/`SP`/`PC` to its 5-bit index, else undefined. */
function parseReg(tok: string): number | undefined {
  const t = tok.toUpperCase();
  if (t === 'SP') return 29;
  if (t === 'PC') return 23; // PC mapping per sheet's MOD/PC row (best-effort)
  const m = /^R(\d+)$/.exec(t);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (n < 0 || n >= IRIS_REG_COUNT) throw new IrisError(`IRIS: register out of range R${n} (max R29)`);
  return n;
}

/**
 * Lower one assembly instruction (mnemonic + operand tokens, '-' stripped) into
 * the canonical base form `[MNEMONIC, C, A, B]`, applying the sheet's "Raw Asm"
 * pseudo-op expansions and the default-operand fill rules. Exported for testing.
 */
export function lowerIris(mnemonic: string, ops: string[]): [string, string, string, string] {
  const M = mnemonic.toUpperCase();
  const n = ops.length;

  switch (M) {
    case 'NOP': return ['NOP', 'R0', 'R0', 'R0'];
    case 'LINE': return ['LINE', 'R0', 'R0', 'R0'];
    case 'RET': return ['RET', 'R0', 'R0', 'R0'];
    case 'CMP': return n >= 2 ? ['SUB', 'R0', ops[0], ops[1]] : ['ADD', 'R0', ops[0], 'R0'];
    case 'MOV': return n >= 2 ? ['ADD', ops[0], ops[1], 'R0'] : ['ADD', 'R0', ops[0], 'R0'];
    case 'RSH': return n >= 2 ? ['BSR', ops[0], ops[1], '1'] : ['BSR', ops[0], ops[0], '1'];
    case 'LSH': return n >= 2 ? ['ADD', ops[0], ops[1], ops[1]] : ['ADD', ops[0], ops[0], ops[0]];
    case 'DEC': return n >= 2 ? ['SUB', ops[0], ops[1], '1'] : ['SUB', ops[0], ops[0], '1'];
    case 'NOT': return n >= 2 ? ['NOR', ops[0], ops[1], 'R0'] : ['NOR', ops[0], ops[0], 'R0'];
    case 'NEG': return n >= 2 ? ['SUB', ops[0], 'R0', ops[1]] : ['SUB', ops[0], 'R0', ops[0]];
    case 'INC': return n >= 2 ? ['INC', ops[0], ops[1], 'R0'] : ['INC', ops[0], ops[0], 'R0'];
    case 'CALR': return ['CALR', 'R0', ops[0], 'R0'];
    case 'CLR': return ['TILE', 'R0', '257', 'R0'];
    case 'BUFFER': return ['TILE', 'R0', '258', 'R0'];
    case 'HPSH': return ['STR', 'R0', '16389', ops[0]];
    case 'HPOP': return ['LOD', ops[0], '16389', 'R0'];
    case 'SETX': case 'SETX1': case 'SETX2': case 'SETY': case 'SETY1': case 'SETY2':
    case 'TILE':
      if (n === 1) return [M, 'R0', ops[0], 'R0'];
      break;
    case 'LOD':
      if (n === 2) return ['LOD', ops[0], ops[1], 'R0'];
      break;
    case 'STR':
      if (n === 2) return ['STR', 'R0', ops[0], ops[1]];
      break;
    case 'HLT': case 'JMP': case 'IMMROM': case 'FLG': case 'CALI':
      throw new IrisError(`IRIS: '${M}' is not encodable in this best-effort assembler (branch/immediate-ROM opcodes are not pinned down by the spec — TODO).`);
    default: break;
  }

  // Base instruction default-operand fill (the "OP x y → OP x x y" rule).
  if (!(M in IRIS_OPCODES)) throw new IrisError(`IRIS: unknown instruction '${M}'`);
  if (n === 0) return [M, 'R0', 'R0', 'R0'];
  if (n === 1) return [M, ops[0], ops[0], 'R0'];
  if (n === 2) return [M, ops[0], ops[0], ops[1]];
  return [M, ops[0], ops[1], ops[2]];
}

/** Pack opcode/C/A/B (+flag) into the assumed 24-bit IRIS word. Exported for testing. */
export function encodeIris(opcode: number, c: number, a: number, b: number, flag = 0): number {
  return (((opcode & 31) << 19) | ((c & 31) << 14) | ((flag & 15) << 10) | ((b & 31) << 5) | (a & 31)) >>> 0;
}

/** Resolve a C/A/B token to a 5-bit field value (register, small immediate, or label). */
function resolveField(tok: string, labels: Record<string, number>): number {
  const reg = parseReg(tok);
  if (reg !== undefined) return reg;
  if (tok.startsWith('.')) {
    if (!(tok in labels)) throw new IrisError(`IRIS: unknown label '${tok}'`);
    return labels[tok];
  }
  const v = parseNumber(tok);
  if (v < 0 || v > 31) {
    throw new IrisError(`IRIS: value ${v} does not fit a 5-bit field — large immediates need an IMM/IMMROM sequence (TODO).`);
  }
  return v;
}

/** Assemble an IRIS program into 24-bit machine words (best-effort; see file header). */
export function assembleIris(src: string): number[] {
  // Tokenize: strip // and ; comments, blank lines.
  const rawLines = src.split('\n').map((line) => {
    for (const c of ['//', ';']) {
      const k = line.indexOf(c);
      if (k !== -1) line = line.slice(0, k);
    }
    return line.trim();
  });

  // Pass 1: collect labels (a `.label` line attaches to the next instruction).
  const instrs: string[][] = [];
  const labels: Record<string, number> = {};
  for (const line of rawLines) {
    if (line === '') continue;
    const toks = line.split(/\s+/);
    if (toks[0].startsWith('.') && IRIS_OPCODES[toks[0].slice(1).toUpperCase()] === undefined) {
      labels[toks[0]] = instrs.length;
      if (toks.length > 1) instrs.push(toks.slice(1));
    } else {
      instrs.push(toks);
    }
  }

  // Pass 2: lower + resolve + encode.
  const out: number[] = [];
  for (const toks of instrs) {
    const ops = toks.slice(1).filter((t) => t !== '-');
    const [base, cTok, aTok, bTok] = lowerIris(toks[0], ops);
    const opcode = IRIS_OPCODES[base.toUpperCase()];
    if (opcode === undefined) throw new IrisError(`IRIS: '${base}' has no opcode`);
    out.push(encodeIris(opcode, resolveField(cTok, labels), resolveField(aTok, labels), resolveField(bTok, labels)));
  }
  return out;
}
