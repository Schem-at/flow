/**
 * URCL assembler — an EXAMPLE built on the generic Asm kit, demonstrating the
 * kit's *resolved-IR* back-end (`assembleIR`). URCL ("Universal Redstone
 * Computer Language", github.com/ModPunchtree/URCL) is a target-INDEPENDENT
 * assembly IR: it has no single machine-code encoding — programs are translated
 * to a concrete CPU (e.g. IRIS). So "assembling" URCL means parse + resolve
 * (labels, relatives, ports, immediates, headers) into a structured instruction
 * stream — exactly what `define({ mode: 'ir' }).assembleIR` produces.
 *
 * NOT a platform primitive: there is no `Urcl` ambient global. This is reference
 * content proving the generic `Asm` kit covers a portable IL, alongside the
 * fixed-width binary CPUs (ARPU, BatPU-2, IRIS).
 *
 * Coverage: URCL Core (ADD RSH LOD STR BGE NOR IMM) + Basic (SUB JMP MOV NOP LSH
 * INC DEC NEG AND OR NOT XNOR XOR NAND BRL BRG BRE BNE BOD BEV BLE BRZ BNZ BRN
 * BRP PSH POP CAL RET HLT CPY BRC BNC) + IN/OUT + DW. Complex instructions
 * (MLT/DIV/…) are out of scope for this first pass.
 */

import { define, type IsaSpec, type AsmIR } from '../kit.js';

/** URCL Core + Basic mnemonics (opcode = list index; IR mode needs no encoding). */
export const URCL_MNEMONICS = [
  // Core
  'ADD', 'RSH', 'LOD', 'STR', 'BGE', 'NOR', 'IMM',
  // Basic
  'SUB', 'JMP', 'MOV', 'NOP', 'LSH', 'INC', 'DEC', 'NEG', 'AND', 'OR', 'NOT',
  'XNOR', 'XOR', 'NAND', 'BRL', 'BRG', 'BRE', 'BNE', 'BOD', 'BEV', 'BLE', 'BRZ',
  'BNZ', 'BRN', 'BRP', 'PSH', 'POP', 'CAL', 'RET', 'HLT', 'CPY', 'BRC', 'BNC',
  // I/O
  'IN', 'OUT',
] as const;

/** A small, illustrative URCL port table (the IR keeps the port *name* regardless). */
export const URCL_PORTS: Record<string, number> = {
  TEXT: 1, NUMB: 2, SUPPORTED: 3, SPECIAL: 4, PROFILE: 5,
  RNG: 10, COLOR: 11, NOTE: 12, ADDR: 13, BUS: 14,
  GAMEPAD: 20, AXIS: 21, KEY: 22, MOUSE: 23,
};

const URCL_SPEC: IsaSpec = {
  mode: 'ir',
  wordBits: 8,
  comment: ['//'],
  blockComment: ['/*', '*/'],
  labelPrefix: '.',
  relativePrefix: '~',
  portPrefix: '%',
  memPrefix: ['M', '#'],
  charDelims: ["'"],
  headers: ['BITS', 'MINREG', 'MINHEAP', 'MINSTACK', 'RUN'],
  dataMnemonic: 'DW',
  dataSize: 1, // each data word advances the address space by one in the IR
  mnemonics: Object.fromEntries(URCL_MNEMONICS.map((m, opcode) => [m, { opcode }])),
  symbols: {
    // General registers (R0.. / $0..) are handled by parseRegister; named
    // special registers live here.
    registers: { SP: 252, PC: 253 },
    ports: URCL_PORTS,
  },
  // R0..Rn and $0..$n → register index.
  parseRegister: (t) => {
    if (/^R\d+$/i.test(t)) return parseInt(t.slice(1), 10);
    if (/^\$\d+$/.test(t)) return parseInt(t.slice(1), 10);
    return undefined;
  },
};

const urclAssembler = define(URCL_SPEC);

/**
 * URCL writes I/O ports attached to the mnemonic (`OUT%TEXT R1`, `IN%RNG R1`) as
 * well as detached (`OUT %TEXT R1`). Normalise the attached form to a separate
 * `%PORT` token so the shared tokenizer sees a clean `OUT %TEXT R1`.
 */
function normaliseAttachedPorts(src: string): string {
  return src.replace(/\b(IN|OUT)%/gi, '$1 %');
}

/** Assemble a URCL program into the resolved, target-independent IR. */
export function assembleUrcl(src: string): AsmIR {
  return urclAssembler.assembleIR(normaliseAttachedPorts(src));
}

/** Render an AsmIR as a readable disassembly listing (headers + one line/instr). */
export function formatUrclIR(ir: AsmIR): string {
  const head = Object.entries(ir.headers).map(([k, v]) => `${k} ${v}`);
  const body = ir.instructions.map((ins) => {
    const ops = ins.operands.map((o) => (o.symbol ? `${o.raw}(${o.kind}=${o.symbol})` : `${o.raw}(${o.kind}=${o.value})`));
    const lbl = ins.label ? `${ins.label}: ` : '';
    const data = ins.data ? ` [${ins.data.join(' ')}]` : '';
    return `${String(ins.offset).padStart(3, '0')}  ${lbl}${ins.mnemonic} ${ops.join(' ')}${data}`.trimEnd();
  });
  return [...head, '', ...body].join('\n');
}
