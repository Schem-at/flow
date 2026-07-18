/**
 * ARPU assembler — a self-contained TypeScript port of the assembler from
 * https://github.com/tony-ist/arpuemu (tony-ist), now expressed as a declarative
 * ISA spec on top of the generic assembler construction kit (./kit.ts). ARPU is
 * the reference ISA proving the kit can reproduce a real CPU byte-for-byte; see
 * arpu.test.ts which checks it against the original's own output fixtures.
 *
 * ARPU ("A Redstone Processing Unit") is an 8-bit Minecraft redstone CPU.
 *
 * Instruction encoding (1 or 2 bytes per instruction):
 *   byte1 = (operand2 << 6) | (operand1 << 4) | opcode
 *   byte2 = operand3            // present only for BIT / IMM / BRA / CAL
 *
 * ROM serialisation lives in ./rom.ts (ISA-agnostic) and is re-exported here for
 * backward compatibility.
 */

import { define, pack, parseNumber, type IsaSpec, type InstructionDef, type AliasDef } from '../kit.js';

// ─── Mnemonics & ISA tables (from mnemonics.ts) ──────────────────────────────

export const ALIAS_OPERAND = '%';
export const DATA_MNEMONIC = 'DW';

/** Opcode = index into this list (ADD=0 … MOV=15). */
export const INSTRUCTION_MNEMONICS = [
  'ADD', 'SUB', 'RSH', 'INC', 'DEC', 'BIT', 'CAL', 'RET',
  'PST', 'PLD', 'IMM', 'STR', 'LOD', 'SOP', 'BRA', 'MOV',
] as const;

/** Instructions that carry a third operand in a trailing second byte. */
export const EXTRA_BYTE_INSTRUCTIONS = ['BIT', 'IMM', 'BRA', 'CAL'] as const;

export interface TargetInstruction extends AliasDef {}

/** Pseudo-instructions: surface mnemonic → real instruction + operand template.
 *  `%` slots are filled positionally from the operands the user wrote. */
export const ALIASES: { [key: string]: TargetInstruction } = {
  JMP: { mnemonic: 'BRA', operandTokens: ['0', '0', ALIAS_OPERAND] },
  JZ: { mnemonic: 'BRA', operandTokens: ['0', '0b10', ALIAS_OPERAND] },
  JNZ: { mnemonic: 'BRA', operandTokens: ['0', '0b11', ALIAS_OPERAND] },
  JC: { mnemonic: 'BRA', operandTokens: ['1', '0b10', ALIAS_OPERAND] },
  JNC: { mnemonic: 'BRA', operandTokens: ['1', '0b11', ALIAS_OPERAND] },
  JMB: { mnemonic: 'BRA', operandTokens: ['2', '0b10', ALIAS_OPERAND] },
  JNM: { mnemonic: 'BRA', operandTokens: ['2', '0b11', ALIAS_OPERAND] },
  JLB: { mnemonic: 'BRA', operandTokens: ['3', '0b10', ALIAS_OPERAND] },
  JNL: { mnemonic: 'BRA', operandTokens: ['3', '0b11', ALIAS_OPERAND] },
  IMM: { mnemonic: 'IMM', operandTokens: [ALIAS_OPERAND, '0', ALIAS_OPERAND] },
  CAL: { mnemonic: 'CAL', operandTokens: ['0', '0', ALIAS_OPERAND] },
  PUSH: { mnemonic: 'SOP', operandTokens: [ALIAS_OPERAND, '0'] },
  POP: { mnemonic: 'SOP', operandTokens: [ALIAS_OPERAND, '2'] },
  INC: { mnemonic: 'INC', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND] },
  DEC: { mnemonic: 'DEC', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND] },
  AND: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b0100_0000'] },
  NAND: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b1100_0000'] },
  OR: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b0010_0000'] },
  NOR: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b1010_0000'] },
  XOR: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b0001_0000'] },
  XNOR: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b1001_0000'] },
  NOT: { mnemonic: 'BIT', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND, '0b0000_0001'] },
  LSH: { mnemonic: 'ADD', operandTokens: [ALIAS_OPERAND, ALIAS_OPERAND] },
  PLD: { mnemonic: 'PLD', operandTokens: [ALIAS_OPERAND, '0'] },
  NOP: { mnemonic: 'MOV', operandTokens: ['R1', 'R1'] },
  HALT: { mnemonic: 'RET', operandTokens: ['1'] },
};

/** Convenience ISA descriptor (mnemonic → opcode + width hint). */
export const ISA = INSTRUCTION_MNEMONICS.map((mnemonic, opcode) => ({
  mnemonic,
  opcode,
  bytes: (EXTRA_BYTE_INSTRUCTIONS as readonly string[]).includes(mnemonic) ? 2 : 1,
}));

// Re-export the kit's error types so existing `arpu.ts` importers keep working.
export { AssembleError, ParseError } from '../kit.js';

// ─── Hex helpers (from asm-util.ts) ──────────────────────────────────────────

export function padHexByte(byte: string): string {
  return byte.length === 1 ? '0' + byte : byte;
}
export function toHex(bytes: number[]): string[] {
  return bytes.map((b) => padHexByte(b.toString(16).toUpperCase()));
}
export function fromHex(hex: string[]): number[] {
  return hex.map((x) => parseInt(x, 16));
}

// ─── ARPU ISA spec (drives the generic kit) ──────────────────────────────────

const ARPU_MNEMONICS: Record<string, InstructionDef> = Object.fromEntries(
  INSTRUCTION_MNEMONICS.map((mnemonic, opcode) => [mnemonic, { opcode }]),
);

const ARPU_SPEC: IsaSpec = {
  wordBits: 8,
  comment: '//',
  labelPrefix: '.',
  macroKeyword: '@DEFINE',
  macroPrefix: '@',
  dataMnemonic: DATA_MNEMONIC,
  dataSize: 0,
  aliasOperand: ALIAS_OPERAND,
  mnemonics: ARPU_MNEMONICS,
  aliases: ALIASES,
  parseNumber,
  // Registers R1–R4 → indices 0–3.
  parseRegister: (t) => (t.toUpperCase().startsWith('R') ? parseInt(t[1], 10) - 1 : undefined),
  // BIT/IMM/BRA/CAL take a 3rd operand → 2 bytes; everything else is 1 byte.
  instructionSize: (n) => (n === 3 ? 2 : 1),
  // A load-immediate targeting a DW line takes the data value; every other
  // label reference resolves to the target's byte offset.
  resolveLabel: ({ mnemonic, targetIsData }) => (mnemonic === 'IMM' && targetIsData ? 'value' : 'offset'),
  // byte1 = (op2 << 6) | (op1 << 4) | opcode ; optional byte2 = op3.
  encode: ({ opcode, operands }) => {
    const [o1, o2, o3] = operands;
    const byte1 = pack(
      [
        { value: opcode, bits: 4 },
        { value: o1 ?? 0, bits: 2 },
        { value: o2 ?? 0, bits: 2 },
      ],
      { order: 'lsb' },
    );
    return o3 === undefined ? [byte1] : [byte1, o3];
  },
};

const arpuAssembler = define(ARPU_SPEC);

/** Assemble a full ARPU assembly program into machine-code bytes (0–255). */
export function assemble(src: string): number[] {
  return arpuAssembler.assemble(src);
}

// ─── ROM serialisation (re-exported from the ISA-agnostic ./rom.ts) ──────────

export {
  digitsPerByte,
  romString,
  romData,
  romLayout,
  type RomStringOptions,
  type RomBlockRole,
  type RomPlacement,
  type RomLayoutConfig,
} from '../rom.js';
