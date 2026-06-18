/**
 * BatPU-2 assembler — a faithful TypeScript port of mattbatwings' BatPU-2
 * assembler.py (https://github.com/mattbatwings/BatPU-2), built on the
 * ISA-agnostic assembler-kit helper `parseNumber` (../kit.ts). BatPU-2 is a
 * 16-bit Minecraft redstone CPU. This is validated byte/word-for-word against
 * assembler.py's own output — see client `batpu2.test.ts` fixtures.
 *
 * It is hand-rolled on the kit's standalone helpers rather than expressed via
 * the declarative `define()` driver, because BatPU-2 has three irregularities
 * the driver does not model cleanly:
 *   1. a bare `define NAME VALUE` directive (defines are referenced with NO
 *      sigil, unlike the kit's `@`-prefixed macros),
 *   2. quoted-character symbols (`'a'`/`"a"`) plus a whitespace special-case
 *      where a space literal `' '` is split into two `'` tokens, and
 *   3. operand-repeat pseudo-ops, e.g. `lsh A C → add A A C`.
 * The kit's exported helpers (parseNumber, and the Asm ambient global's
 * parseNumber/pack/etc.) are exactly what's meant for hand-rolling these.
 *
 * Encoding (16-bit word): bits 15-12 opcode, then per class:
 *   3-reg  add/sub/nor/and/xor : opcode | A<<8 | B<<4 | C
 *   rsh                        : opcode | A<<8 |       | C
 *   ldi/adi (imm8)             : opcode | A<<8 | imm[7:0]
 *   lod/str (off4, 2's-comp)   : opcode | A<<8 | B<<4 | off[3:0]
 *   jmp/cal (addr10)           : opcode | addr[9:0]
 *   brh (cond2, addr10)        : opcode | cond<<10 | addr[9:0]
 *   nop/hlt/ret                : opcode
 */

import { parseNumber, AssembleError } from '../kit.js';

export const BATPU2_OPCODES = [
  'nop', 'hlt', 'add', 'sub', 'nor', 'and', 'xor', 'rsh',
  'ldi', 'adi', 'jmp', 'brh', 'cal', 'ret', 'lod', 'str',
] as const;

const REGISTERS = Array.from({ length: 16 }, (_, i) => `r${i}`);

const PORTS = [
  'pixel_x', 'pixel_y', 'draw_pixel', 'clear_pixel', 'load_pixel', 'buffer_screen',
  'clear_screen_buffer', 'write_char', 'buffer_chars', 'clear_chars_buffer',
  'show_number', 'clear_number', 'signed_mode', 'unsigned_mode', 'rng', 'controller_input',
];

const CHARS = [
  ' ', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '.', '!', '?',
];

/** Build BatPU-2's flat symbol table: opcodes, registers, conditions, ports, chars. */
export function batpu2Symbols(): Record<string, number> {
  const s: Record<string, number> = {};
  BATPU2_OPCODES.forEach((m, i) => (s[m] = i));
  REGISTERS.forEach((m, i) => (s[m] = i));
  const conditionGroups = [
    ['eq', 'ne', 'ge', 'lt'],
    ['=', '!=', '>=', '<'],
    ['z', 'nz', 'c', 'nc'],
    ['zero', 'notzero', 'carry', 'notcarry'],
  ];
  for (const group of conditionGroups) group.forEach((m, i) => (s[m] = i));
  PORTS.forEach((m, i) => (s[m] = i + 240));
  CHARS.forEach((ch, i) => {
    s[`"${ch}"`] = i;
    s[`'${ch}'`] = i;
  });
  return s;
}

/** Assemble a BatPU-2 program into 16-bit machine-code words (0–65535). */
export function assemble(src: string): number[] {
  // Pass 0: strip comments ('/', ';', '#') and blank lines.
  const lines = src
    .split('\n')
    .map((raw) => {
      let line = raw;
      for (const c of ['/', ';', '#']) {
        const i = line.indexOf(c);
        if (i !== -1) line = line.slice(0, i);
      }
      return line.trim();
    })
    .filter((l) => l !== '');

  const symbols = batpu2Symbols();

  // Pass 1: collect defines, labels (→ instruction index), and instructions.
  let pc = 0;
  const instructions: string[][] = [];
  for (const line of lines) {
    const words = line.split(/\s+/).map((w) => w.toLowerCase());
    if (words[0] === 'define') {
      symbols[words[1]] = parseNumber(words[2]);
    } else if (words[0].startsWith('.')) {
      symbols[words[0]] = pc;
      if (words.length > 1) {
        pc += 1;
        instructions.push(words.slice(1));
      }
    } else {
      pc += 1;
      instructions.push(words);
    }
  }

  const resolve = (word: string): number => {
    if ('-0123456789'.includes(word[0])) return parseNumber(word);
    const v = symbols[word];
    if (v === undefined) throw new AssembleError(`Could not resolve ${word}`);
    return v;
  };

  const REG_A = new Set(['add', 'sub', 'nor', 'and', 'xor', 'rsh', 'ldi', 'adi', 'lod', 'str']);
  const REG_B = new Set(['add', 'sub', 'nor', 'and', 'xor', 'lod', 'str']);
  const REG_C = new Set(['add', 'sub', 'nor', 'and', 'xor', 'rsh']);

  const out: number[] = [];
  for (let i = 0; i < instructions.length; i++) {
    let words = instructions[i].slice();
    const op0 = words[0];

    // Pseudo-instructions (exact expansions from assembler.py).
    if (op0 === 'cmp') words = ['sub', words[1], words[2], 'r0'];
    else if (op0 === 'mov') words = ['add', words[1], 'r0', words[2]];
    else if (op0 === 'lsh') words = ['add', words[1], words[1], words[2]];
    else if (op0 === 'inc') words = ['adi', words[1], '1'];
    else if (op0 === 'dec') words = ['adi', words[1], '-1'];
    else if (op0 === 'not') words = ['nor', words[1], 'r0', words[2]];
    else if (op0 === 'neg') words = ['sub', 'r0', words[1], words[2]];

    // lod/str optional offset → default 0.
    if ((words[0] === 'lod' || words[0] === 'str') && words.length === 3) words.push('0');

    // Space special-case: a `' '`/`" "` literal is split into two quote tokens.
    const n = words.length;
    if ((words[n - 1] === '"' || words[n - 1] === "'") && (words[n - 2] === '"' || words[n - 2] === "'")) {
      words = words.slice(0, n - 1);
      words[words.length - 1] = "' '";
    }

    const opcode = words[0];
    const opIndex = symbols[opcode];
    if (opIndex === undefined) throw new AssembleError(`Unknown opcode "${opcode}"`);
    const nums = words.map(resolve);

    let mc = opIndex << 12;
    if (REG_A.has(opcode)) mc |= (nums[1] & 0xf) << 8;
    if (REG_B.has(opcode)) mc |= (nums[2] & 0xf) << 4;
    if (REG_C.has(opcode)) mc |= nums[nums.length - 1] & 0xf;
    if (opcode === 'ldi' || opcode === 'adi') mc |= nums[2] & 0xff;
    if (opcode === 'jmp' || opcode === 'brh' || opcode === 'cal') mc |= nums[nums.length - 1] & 0x3ff;
    if (opcode === 'brh') mc |= (nums[1] & 0x3) << 10;
    if (opcode === 'lod' || opcode === 'str') mc |= nums[3] & 0xf;

    out.push(mc >>> 0);
  }
  return out;
}

/** Render assembled words as 16-bit binary strings (one per line), like a `.mc` file. */
export function toBits(words: number[]): string[] {
  return words.map((w) => (w >>> 0).toString(2).padStart(16, '0'));
}
