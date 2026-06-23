/**
 * PARKED example blocks — the assembler + ROM primitives, shelved out of the
 * live EXAMPLE_BLOCKS / EXAMPLE_BLOCK_CONTRACTS so users don't see them while
 * this work is on hold. Kept verbatim for when it's picked back up. This module
 * is intentionally NOT imported by the running app.
 */

import type { BlockContract } from '@flow/core';
import type { ExampleBlock } from './examples';

const ARPU_ASSEMBLE = `// ARPU Assembler (EXAMPLE) — assembles the ARPU 8-bit redstone CPU's assembly into
// machine code, built ENTIRELY on the generic 'Asm' primitive (Flow ships no
// ARPU-specific anything). This is the worked "bring your own ISA" template: copy
// it, swap the spec, and you have an assembler for YOUR architecture. Feed 'bytes'
// to the ROM blocks. Ported from github.com/tony-ist/arpuemu.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  bytes: number[];
  words: number;
  hex: string;
};
function generate(inputs) {
  const program = inputs.program;
  const MNEMONICS = ['ADD','SUB','RSH','INC','DEC','BIT','CAL','RET','PST','PLD','IMM','STR','LOD','SOP','BRA','MOV'];
  const A = '%';
  const ALIASES = {
    JMP:{mnemonic:'BRA',operandTokens:['0','0',A]},
    JZ:{mnemonic:'BRA',operandTokens:['0','0b10',A]}, JNZ:{mnemonic:'BRA',operandTokens:['0','0b11',A]},
    JC:{mnemonic:'BRA',operandTokens:['1','0b10',A]}, JNC:{mnemonic:'BRA',operandTokens:['1','0b11',A]},
    JMB:{mnemonic:'BRA',operandTokens:['2','0b10',A]}, JNM:{mnemonic:'BRA',operandTokens:['2','0b11',A]},
    JLB:{mnemonic:'BRA',operandTokens:['3','0b10',A]}, JNL:{mnemonic:'BRA',operandTokens:['3','0b11',A]},
    IMM:{mnemonic:'IMM',operandTokens:[A,'0',A]}, CAL:{mnemonic:'CAL',operandTokens:['0','0',A]},
    PUSH:{mnemonic:'SOP',operandTokens:[A,'0']}, POP:{mnemonic:'SOP',operandTokens:[A,'2']},
    INC:{mnemonic:'INC',operandTokens:[A,A]}, DEC:{mnemonic:'DEC',operandTokens:[A,A]},
    AND:{mnemonic:'BIT',operandTokens:[A,A,'0b0100_0000']}, NAND:{mnemonic:'BIT',operandTokens:[A,A,'0b1100_0000']},
    OR:{mnemonic:'BIT',operandTokens:[A,A,'0b0010_0000']}, NOR:{mnemonic:'BIT',operandTokens:[A,A,'0b1010_0000']},
    XOR:{mnemonic:'BIT',operandTokens:[A,A,'0b0001_0000']}, XNOR:{mnemonic:'BIT',operandTokens:[A,A,'0b1001_0000']},
    NOT:{mnemonic:'BIT',operandTokens:[A,A,'0b0000_0001']}, LSH:{mnemonic:'ADD',operandTokens:[A,A]},
    PLD:{mnemonic:'PLD',operandTokens:[A,'0']}, NOP:{mnemonic:'MOV',operandTokens:['R1','R1']},
    HALT:{mnemonic:'RET',operandTokens:['1']},
  };
  const mnemonics = {};
  MNEMONICS.forEach((m, opcode) => { mnemonics[m] = { opcode: opcode }; });
  const { assemble } = Asm.define({
    wordBits: 8, comment: '//', labelPrefix: '.', macroKeyword: '@DEFINE', macroPrefix: '@',
    dataMnemonic: 'DW', dataSize: 0, aliasOperand: A,
    mnemonics: mnemonics, aliases: ALIASES, parseNumber: Asm.parseNumber,
    parseRegister: (t) => (t.toUpperCase().charAt(0) === 'R' ? parseInt(t.charAt(1), 10) - 1 : undefined),
    instructionSize: (n) => (n === 3 ? 2 : 1),
    resolveLabel: (c) => (c.mnemonic === 'IMM' && c.targetIsData ? 'value' : 'offset'),
    encode: (c) => {
      const o = c.operands;
      const byte1 = Asm.pack([{ value: c.opcode, bits: 4 }, { value: o[0] || 0, bits: 2 }, { value: o[1] || 0, bits: 2 }], { order: 'lsb' });
      return o[2] === undefined ? [byte1] : [byte1, o[2]];
    },
  });
  const bytes = assemble(program || '');
  const hex = bytes.map((b) => (b < 16 ? '0' : '') + b.toString(16).toUpperCase()).join(' ');
  return { bytes: bytes, words: bytes.length, hex: hex };
}
`;

const CUSTOM_ISA = `// Custom ISA (TEMPLATE) — the smallest "bring your own ISA" example. A 4-instruction
// toy CPU defined with the generic 'Asm' primitive. Copy this, edit the mnemonics/
// encoding, and you have an assembler for YOUR architecture; feed 'bytes' to the
// ROM blocks. 8-bit words; byte1 = (opcode<<4)|regs, immediates/targets in byte2.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  bytes: number[];
  words: number;
};
function generate(inputs) {
  const program = inputs.program;
  const { assemble } = Asm.define({
    wordBits: 8, comment: '//', labelPrefix: '.', parseNumber: Asm.parseNumber,
    parseRegister: (t) => (t.toUpperCase().charAt(0) === 'R' ? parseInt(t.slice(1), 10) : undefined),
    mnemonics: {
      NOP: { opcode: 0, size: 1, encode: () => [0] },
      LDI: { opcode: 1, size: 2, encode: (c) => [Asm.pack([{ value: 1, bits: 4 }, { value: c.operands[0], bits: 4 }]), c.operands[1]] },
      ADD: { opcode: 2, size: 1, encode: (c) => [Asm.pack([{ value: 2, bits: 4 }, { value: c.operands[0], bits: 2 }, { value: c.operands[1], bits: 2 }])] },
      JMP: { opcode: 3, size: 2, encode: (c) => [3, c.operands[0]] },
    },
  });
  const bytes = assemble(program || '');
  return { bytes: bytes, words: bytes.length };
}
`;

const ROM_DATA = `// Bytes → ROM Data (ISA-AGNOSTIC). Serialises ANY byte array into the flat base-N
// digit string the schematic-api Basic ROM Generator (roms.py) consumes as its
// 'data' parameter — pass that generator the same base + bitWidth. Feed it the
// output of any assembler (or raw data).
type Inputs = {
  bytes: number[];
  base: NumberField<{ min: 2; max: 16; step: 1; default: 16 }>;
  bitWidth: NumberField<{ min: 0; max: 64; step: 1; default: 0 }>;
  padTo: NumberField<{ min: 0; max: 65536; step: 1; default: 0 }>;
};
type Outputs = {
  data: string;
  words: number;
};
function generate(inputs) {
  const b = inputs.bytes || [];
  const data = Rom.data(b, {
    base: inputs.base || 16,
    bitWidth: inputs.bitWidth ? inputs.bitWidth : undefined,
    padTo: inputs.padTo ? inputs.padTo : undefined,
  });
  return { data: data, words: b.length };
}
`;

const ROM_SCHEMATIC = `// Bytes → ROM Schematic (ISA-AGNOSTIC). Lays ANY byte array out as a Minecraft ROM
// schematic, mirroring the schematic-api Basic ROM Generator (roms.py): each byte
// is one word, stacked on Y as 'bitWidth' base-N digit cells and tiled across X/Z.
// A visual preview — the canonical artifact for the API is the digit-string from the
// 'Bytes → ROM Data' block (feed it the same base + bitWidth).
// SIGNAL-STRENGTH ROM: each byte is two base-16 digits (0..15) and every data
// cell is a container filled to that comparator signal via the '{signal=N}'
// shorthand (e.g. minecraft:barrel[facing=up]{signal=7}; also works for
// jukeboxes). The grid is auto-sized from the byte count — only wire up 'bytes'.
// Knobs: bitWidth (hex digits per word, 2 for a byte) and the data container.
type Inputs = {
  bytes: number[];
  bitWidth: NumberField<{ min: 1; max: 64; step: 1; default: 2 }>;
  dataBlock: Block<{ default: 'minecraft:barrel[facing=up]' }>;
};
type Outputs = {
  rom: Schematic;
  words: number;
};
function generate(inputs) {
  const data = inputs.bytes || [];
  const words = data.length;
  // Auto-derive a compact word grid (16 words per row) from the byte count.
  const rowWidth = 16;
  const xWordCount = Math.min(rowWidth, words) || 1;
  const zWordCount = Math.max(1, Math.ceil(words / rowWidth));
  const placements = Rom.layout(data, {
    base: 16,
    bitWidth: inputs.bitWidth || 2,
    xWordCount: xWordCount,
    zWordCount: zWordCount,
    xOffsets: [2],
    zOffsets: [4],
    yOffsets: [2],
    invertWord: true,
  });
  const rom = new Schematic();
  for (const p of placements) {
    // role 'zero'/'fifteen' get solid markers (0 and full); the in-between
    // digits 1..14 are containers filled to comparator signal = the digit.
    const block =
      p.role === 'zero' ? 'minecraft:red_concrete' :
      p.role === 'fifteen' ? 'minecraft:redstone_block' :
      inputs.dataBlock + '{signal=' + p.value + '}';
    rom.set_block(p.x, p.y, p.z, block);
  }
  return { rom, words: words };
}
`;

const ROM_GENERATOR = `// ROM Generator (ISA-AGNOSTIC) — a reimplementation of the schematic-api Basic ROM
// Generator (roms.py) as a standalone, publishable MODULE. Takes a base-N digit
// STRING (the 'data' artifact roms.py consumes — e.g. the 'Bytes → ROM Data' node's
// output) and lays it out into a Minecraft ROM schematic with the exact same spatial
// math. Publish this flow as a module, then feed any assembler's ROM-data string in.
type Inputs = {
  data: Textarea<{ required: true }>;
  base: NumberField<{ min: 2; max: 16; step: 1; default: 16 }>;
  bitWidth: NumberField<{ min: 1; max: 64; step: 1; default: 8 }>;
};
type Outputs = {
  rom: Schematic;
};
function generate(inputs) {
  const digits = inputs.data || '';
  const width = inputs.bitWidth || 8;
  const words = Math.floor(digits.length / width);
  const rowWidth = 16;
  const xWordCount = Math.min(rowWidth, words) || 1;
  const zWordCount = Math.max(1, Math.ceil(words / rowWidth));
  const placements = Rom.layoutData(digits, {
    base: inputs.base || 16,
    bitWidth: width,
    xWordCount: xWordCount,
    zWordCount: zWordCount,
    xOffsets: [2],
    zOffsets: [4],
    yOffsets: [2],
    invertWord: true,
  });
  const rom = new Schematic();
  for (const p of placements) {
    const block =
      p.role === 'zero' ? 'minecraft:red_concrete' :
      p.role === 'fifteen' ? 'minecraft:redstone_block' :
      'minecraft:barrel';
    rom.set_block(p.x, p.y, p.z, block);
  }
  return { rom };
}
`;

const BATPU2_ASSEMBLE = `// BatPU-2 Assembler (EXAMPLE) — assembles mattbatwings' BatPU-2, a 16-bit Minecraft
// redstone CPU. Hand-rolled on the generic 'Asm' primitive's helpers (Asm.parseNumber)
// rather than Asm.define, because BatPU-2 has irregularities (a bare 'define', quoted
// character symbols with a space special-case, and operand-repeat pseudo-ops like
// 'lsh A C -> add A A C') that the standalone helpers handle more directly. Verified
// word-for-word against the real assembler.py. Outputs 16-bit machine-code 'words'.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  words: number[];
  count: number;
  bits: string;
};
function generate(inputs) {
  const program = inputs.program;
  const OPCODES = ['nop','hlt','add','sub','nor','and','xor','rsh','ldi','adi','jmp','brh','cal','ret','lod','str'];
  const PORTS = ['pixel_x','pixel_y','draw_pixel','clear_pixel','load_pixel','buffer_screen','clear_screen_buffer','write_char','buffer_chars','clear_chars_buffer','show_number','clear_number','signed_mode','unsigned_mode','rng','controller_input'];
  const CHARS = [' ','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','.','!','?'];
  const symbols = {};
  OPCODES.forEach((m, i) => { symbols[m] = i; });
  for (let i = 0; i < 16; i++) symbols['r' + i] = i;
  const conds = [['eq','ne','ge','lt'],['=','!=','>=','<'],['z','nz','c','nc'],['zero','notzero','carry','notcarry']];
  conds.forEach((g) => g.forEach((m, i) => { symbols[m] = i; }));
  PORTS.forEach((m, i) => { symbols[m] = i + 240; });
  CHARS.forEach((ch, i) => { symbols['"' + ch + '"'] = i; symbols["'" + ch + "'"] = i; });

  const lines = (program || '').split('\\n').map((raw) => {
    let line = raw;
    ['/', ';', '#'].forEach((c) => { const k = line.indexOf(c); if (k !== -1) line = line.slice(0, k); });
    return line.trim();
  }).filter((l) => l !== '');

  let pc = 0;
  const instrs = [];
  for (const line of lines) {
    const words = line.split(/\\s+/).map((w) => w.toLowerCase());
    if (words[0] === 'define') { symbols[words[1]] = Asm.parseNumber(words[2]); }
    else if (words[0].charAt(0) === '.') { symbols[words[0]] = pc; if (words.length > 1) { pc++; instrs.push(words.slice(1)); } }
    else { pc++; instrs.push(words); }
  }

  const resolve = (w) => {
    if ('-0123456789'.indexOf(w.charAt(0)) !== -1) return Asm.parseNumber(w);
    if (symbols[w] === undefined) throw new Error('Could not resolve ' + w);
    return symbols[w];
  };

  const A = ['add','sub','nor','and','xor','rsh','ldi','adi','lod','str'];
  const B = ['add','sub','nor','and','xor','lod','str'];
  const C = ['add','sub','nor','and','xor','rsh'];
  const out = [];
  for (let i = 0; i < instrs.length; i++) {
    let words = instrs[i].slice();
    const op0 = words[0];
    if (op0 === 'cmp') words = ['sub', words[1], words[2], 'r0'];
    else if (op0 === 'mov') words = ['add', words[1], 'r0', words[2]];
    else if (op0 === 'lsh') words = ['add', words[1], words[1], words[2]];
    else if (op0 === 'inc') words = ['adi', words[1], '1'];
    else if (op0 === 'dec') words = ['adi', words[1], '-1'];
    else if (op0 === 'not') words = ['nor', words[1], 'r0', words[2]];
    else if (op0 === 'neg') words = ['sub', 'r0', words[1], words[2]];
    if ((words[0] === 'lod' || words[0] === 'str') && words.length === 3) words.push('0');
    const n = words.length;
    if ((words[n - 1] === '"' || words[n - 1] === "'") && (words[n - 2] === '"' || words[n - 2] === "'")) {
      words = words.slice(0, n - 1); words[words.length - 1] = "' '";
    }
    const opcode = words[0];
    const nums = words.map(resolve);
    let mc = symbols[opcode] << 12;
    if (A.indexOf(opcode) !== -1) mc |= (nums[1] & 15) << 8;
    if (B.indexOf(opcode) !== -1) mc |= (nums[2] & 15) << 4;
    if (C.indexOf(opcode) !== -1) mc |= nums[nums.length - 1] & 15;
    if (opcode === 'ldi' || opcode === 'adi') mc |= nums[2] & 255;
    if (opcode === 'jmp' || opcode === 'brh' || opcode === 'cal') mc |= nums[nums.length - 1] & 1023;
    if (opcode === 'brh') mc |= (nums[1] & 3) << 10;
    if (opcode === 'lod' || opcode === 'str') mc |= nums[3] & 15;
    out.push(mc >>> 0);
  }
  const bits = out.map((w) => { let s = (w >>> 0).toString(2); while (s.length < 16) s = '0' + s; return s; }).join('\\n');
  return { words: out, count: out.length, bits: bits };
}
`;

const URCL_ASSEMBLE = `// URCL Assembler (EXAMPLE) — URCL ("Universal Redstone Computer Language") is a
// target-INDEPENDENT redstone IR: it has NO single machine encoding (programs are
// translated to a concrete CPU like IRIS). So "assembling" URCL means parse + resolve
// (labels, relatives ~, ports %, immediates, headers) into a structured instruction
// stream — the generic Asm kit's *IR* back-end (Asm.define({ mode: 'ir' }).assembleIR).
// Outputs a readable resolved-IR listing. Covers URCL Core + Basic + IN/OUT + DW.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  ir: string;
  count: number;
};
function generate(inputs) {
  const program = inputs.program;
  const MNEM = ['ADD','RSH','LOD','STR','BGE','NOR','IMM','SUB','JMP','MOV','NOP','LSH','INC','DEC','NEG','AND','OR','NOT','XNOR','XOR','NAND','BRL','BRG','BRE','BNE','BOD','BEV','BLE','BRZ','BNZ','BRN','BRP','PSH','POP','CAL','RET','HLT','CPY','BRC','BNC','IN','OUT'];
  const PORTS = { TEXT: 1, NUMB: 2, SUPPORTED: 3, SPECIAL: 4, PROFILE: 5, RNG: 10, COLOR: 11, NOTE: 12, ADDR: 13, BUS: 14, GAMEPAD: 20, AXIS: 21, KEY: 22, MOUSE: 23 };
  const mnemonics = {};
  MNEM.forEach((m, opcode) => { mnemonics[m] = { opcode: opcode }; });
  const spec = {
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
    dataSize: 1,
    mnemonics: mnemonics,
    symbols: { registers: { SP: 252, PC: 253 }, ports: PORTS },
    parseRegister: (t) => {
      if (/^R\\d+$/i.test(t)) return parseInt(t.slice(1), 10);
      if (/^\\$\\d+$/.test(t)) return parseInt(t.slice(1), 10);
      return undefined;
    },
  };
  const normalised = (program || '').replace(/\\b(IN|OUT)%/gi, '$1 %');
  const ir = Asm.define(spec).assembleIR(normalised);
  const head = Object.keys(ir.headers).map((k) => k + ' ' + ir.headers[k]);
  const body = ir.instructions.map((ins) => {
    const ops = ins.operands.map((o) => o.symbol ? (o.raw + '(' + o.kind + '=' + o.symbol + ')') : (o.raw + '(' + o.kind + '=' + o.value + ')'));
    const lbl = ins.label ? (ins.label + ': ') : '';
    const data = ins.data ? (' [' + ins.data.join(' ') + ']') : '';
    let off = String(ins.offset); while (off.length < 3) off = '0' + off;
    return (off + '  ' + lbl + ins.mnemonic + ' ' + ops.join(' ') + data).replace(/\\s+$/, '');
  });
  return { ir: head.concat(['']).concat(body).join('\\n'), count: ir.instructions.length };
}
`;

const IRIS_ASSEMBLE = `// IRIS Assembler (EXAMPLE, BEST-EFFORT) — IRIS is a 24-bit Minecraft redstone CPU,
// the main hardware target URCL compiles to. ⚠️ The encoding here is UNVERIFIED: no
// reference assembler exists and the spec sheet is ambiguous, so only the deterministic
// logic (pseudo-op lowering, C/A/B default-fill, field packing into an ASSUMED 24-bit
// word opcode[5] C[5] flag[4] B[5] A[5]) is faithful. Large immediates / branches (IMM,
// IMMROM, JMP, HLT) are TODO and throw. Outputs 24-bit machine-code 'words'.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  words: number[];
  count: number;
};
function generate(inputs) {
  const program = inputs.program;
  const OPC = { NOP:0, UMLT:1, XOR:2, LOD:3, OR:5, SETX2:6, MLT:7, LINE:8, BSS:9, AND:10, CALR:11, SETX:12, ADD:13, XNOR:14, CALI:15, SETX1:16, BSL:17, INC:18, STR:19, TIMER:20, NOR:21, SETY1:22, MOD:23, TILE:24, BSR:25, NAND:26, RET:27, SETY:28, SUB:29, SETY2:30, DIV:31 };
  const parseReg = (tok) => {
    const t = tok.toUpperCase();
    if (t === 'SP') return 29;
    if (t === 'PC') return 23;
    const m = /^R(\\d+)$/.exec(t);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    if (n < 0 || n > 29) throw new Error('IRIS: register out of range ' + t);
    return n;
  };
  const lower = (M, ops) => {
    M = M.toUpperCase();
    const n = ops.length;
    if (M === 'NOP') return ['NOP','R0','R0','R0'];
    if (M === 'LINE') return ['LINE','R0','R0','R0'];
    if (M === 'RET') return ['RET','R0','R0','R0'];
    if (M === 'CMP') return n >= 2 ? ['SUB','R0',ops[0],ops[1]] : ['ADD','R0',ops[0],'R0'];
    if (M === 'MOV') return n >= 2 ? ['ADD',ops[0],ops[1],'R0'] : ['ADD','R0',ops[0],'R0'];
    if (M === 'RSH') return n >= 2 ? ['BSR',ops[0],ops[1],'1'] : ['BSR',ops[0],ops[0],'1'];
    if (M === 'LSH') return n >= 2 ? ['ADD',ops[0],ops[1],ops[1]] : ['ADD',ops[0],ops[0],ops[0]];
    if (M === 'DEC') return n >= 2 ? ['SUB',ops[0],ops[1],'1'] : ['SUB',ops[0],ops[0],'1'];
    if (M === 'NOT') return n >= 2 ? ['NOR',ops[0],ops[1],'R0'] : ['NOR',ops[0],ops[0],'R0'];
    if (M === 'NEG') return n >= 2 ? ['SUB',ops[0],'R0',ops[1]] : ['SUB',ops[0],'R0',ops[0]];
    if (M === 'INC') return n >= 2 ? ['INC',ops[0],ops[1],'R0'] : ['INC',ops[0],ops[0],'R0'];
    if (M === 'CALR') return ['CALR','R0',ops[0],'R0'];
    if (M === 'LOD' && n === 2) return ['LOD',ops[0],ops[1],'R0'];
    if (M === 'STR' && n === 2) return ['STR','R0',ops[0],ops[1]];
    if ((M === 'SETX'||M==='SETX1'||M==='SETX2'||M==='SETY'||M==='SETY1'||M==='SETY2'||M==='TILE') && n === 1) return [M,'R0',ops[0],'R0'];
    if (M==='HLT'||M==='JMP'||M==='IMMROM'||M==='FLG'||M==='CALI') throw new Error('IRIS: ' + M + ' not encodable (branch/immediate-ROM TODO)');
    if (OPC[M] === undefined) throw new Error('IRIS: unknown instruction ' + M);
    if (n === 0) return [M,'R0','R0','R0'];
    if (n === 1) return [M,ops[0],ops[0],'R0'];
    if (n === 2) return [M,ops[0],ops[0],ops[1]];
    return [M,ops[0],ops[1],ops[2]];
  };
  const lines = (program || '').split('\\n').map((line) => {
    ['//',';'].forEach((c) => { const k = line.indexOf(c); if (k !== -1) line = line.slice(0, k); });
    return line.trim();
  });
  const instrs = [];
  const labels = {};
  for (const line of lines) {
    if (line === '') continue;
    const toks = line.split(/\\s+/);
    if (toks[0].charAt(0) === '.' && OPC[toks[0].slice(1).toUpperCase()] === undefined) {
      labels[toks[0]] = instrs.length;
      if (toks.length > 1) instrs.push(toks.slice(1));
    } else instrs.push(toks);
  }
  const field = (tok) => {
    const r = parseReg(tok);
    if (r !== undefined) return r;
    if (tok.charAt(0) === '.') { if (labels[tok] === undefined) throw new Error('IRIS: unknown label ' + tok); return labels[tok]; }
    const v = Asm.parseNumber(tok);
    if (v < 0 || v > 31) throw new Error('IRIS: value ' + v + ' does not fit a 5-bit field (large immediates need IMMROM, TODO)');
    return v;
  };
  const out = [];
  for (const toks of instrs) {
    const ops = toks.slice(1).filter((t) => t !== '-');
    const low = lower(toks[0], ops);
    const opcode = OPC[low[0].toUpperCase()];
    out.push((((opcode & 31) << 19) | ((field(low[1]) & 31) << 14) | ((field(low[3]) & 31) << 5) | (field(low[2]) & 31)) >>> 0);
  }
  return { words: out, count: out.length };
}
`;

const CARBON_ASSEMBLE = `// Carbon 1.1 Assembler (EXAMPLE) — assembles tony-ist's Carbon 1.1, an 8-bit ACC-based
// Minecraft redstone CPU, hand-rolled in plain JS (its pc-space quirks rule out the
// declarative Asm.define driver). Byte-for-byte vs the Rust reference assembler. Feed
// 'bytes' to the ROM blocks. opcode<<3 | operand; LIM/CAL/PSI/BSL/BSR add an imm byte;
// BRC is 3 bytes [word, addr>>7, (addr%128)-2]; an implicit HLT is appended.
type Inputs = {
  program: Textarea<{ required: true }>;
};
type Outputs = {
  bytes: number[];
  words: number;
  hex: string;
};
function generate(inputs) {
  const OPC = { NOP:0,INC:1,DEC:2,ADD:3,ADR:4,NEG:5,SUB:6,BSB:7,CMP:8,BOR:9,AND:10,XOR:11,BSL:12,BSR:13,LIM:15,RST:16,RLD:17,MST:18,MLD:19,CAL:20,RET:21,BRC:22,JID:23,PSH:24,POP:25,PST:26,PSI:27,PLD:28,PRD:29,HLT:30,FLS:31 };
  const COND = { JMP:0,EVEN:1,EQ:2,NEQ:3,GT:4,LT:5,GTEQ:6,LTEQ:7 };
  const FORMS = {
    NOP:[],RET:[],PSH:[],POP:[],HLT:[],FLS:[],
    INC:['reg'],DEC:['reg'],ADD:['reg'],ADR:['reg'],NEG:['reg'],SUB:['reg'],BSB:['reg'],CMP:['reg'],BOR:['reg'],AND:['reg'],XOR:['reg'],RST:['reg'],RLD:['reg'],MST:['reg'],MLD:['reg'],JID:['reg'],
    BSL:['imm'],BSR:['imm'],LIM:['reg','imm'],CAL:['label'],BRC:['cond','label'],PRD:['cond','label'],PST:['addr'],PSI:['addr','imm'],PLD:['addr'],
  };
  function isDigit(c) { return c >= '0' && c <= '9'; }
  function allDigits(s) { if (!s.length) return false; for (let i = 0; i < s.length; i++) if (!isDigit(s.charAt(i))) return false; return true; }
  function strip(line) {
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line.charAt(i);
      if (c === '"') inStr = !inStr;
      else if (c === '/' && !inStr) return line.slice(0, i);
    }
    return line;
  }
  function parse(src) {
    const out = [];
    const raw = (src || '').split('\\n');
    for (let li = 0; li < raw.length; li++) {
      const s = strip(raw[li]).trim();
      if (!s) continue;
      if (s === 'FUNC' || s.indexOf('FUNC ') === 0 || s === 'END') throw new Error('FUNC/END subroutine blocks are not supported by this example — use labels + CAL/BRC.');
      if (s.charAt(0) === '"') {
        const last = s.lastIndexOf('"');
        if (last <= 0) throw new Error('Unterminated data string: ' + s);
        const text = s.slice(1, last);
        const data = [];
        for (let k = 0; k < text.length; k++) data.push(text.charCodeAt(k) & 255);
        out.push({ kind:'data', data: data });
        continue;
      }
      const toks = s.split(/\\s+/);
      if (toks.length === 1 && toks[0].charAt(0) === '.') { out.push({ kind:'label', name: toks[0] }); continue; }
      out.push({ kind:'instr', mnemonic: toks[0].toUpperCase(), operands: toks.slice(1), raw: s });
    }
    return out;
  }
  function pcSize(m, form) {
    if (m === 'BRC') return 3;
    let n = 1;
    for (let i = 0; i < form.length; i++) { const k = form[i]; if (k === 'imm' || k === 'addr' || k === 'label') n++; }
    return n;
  }
  function resolve(kind, tok, labels, raw) {
    if (kind === 'reg') { const ok = tok.length === 2 && (tok.charAt(0) === 'r' || tok.charAt(0) === 'R') && isDigit(tok.charAt(1)); if (!ok) throw new Error('Expected register rN, got "' + tok + '" — ' + raw); return parseInt(tok.slice(1), 10); }
    if (kind === 'addr') { const ok = tok.length === 2 && tok.charAt(0) === '$' && isDigit(tok.charAt(1)); if (!ok) throw new Error('Expected port $N, got "' + tok + '" — ' + raw); return parseInt(tok.slice(1), 10); }
    if (kind === 'imm') { if (!allDigits(tok)) throw new Error('Expected immediate, got "' + tok + '" — ' + raw); const v = parseInt(tok, 10); if (v > 255) throw new Error('Immediate ' + v + ' out of range (0-255) — ' + raw); return v; }
    if (kind === 'cond') { const c = COND[tok.toUpperCase()]; if (c === undefined) throw new Error('Unknown condition "' + tok + '" — ' + raw); return c; }
    if (tok.charAt(0) !== '.') throw new Error('Expected label .name, got "' + tok + '" — ' + raw);
    const a = labels[tok]; if (a === undefined) throw new Error('Reference to undefined label "' + tok + '" — ' + raw); return a;
  }
  const lines = parse(inputs.program);
  const labels = {};
  let pc = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.kind === 'label') labels[ln.name] = pc;
    else if (ln.kind === 'data') pc = (pc + ln.data.length) & 255;
    else { const f = FORMS[ln.mnemonic]; if (!f) throw new Error('Unknown instruction "' + ln.mnemonic + '"'); pc = (pc + pcSize(ln.mnemonic, f)) & 255; }
  }
  const bytes = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.kind === 'label') continue;
    if (ln.kind === 'data') { for (let k = 0; k < ln.data.length; k++) bytes.push(ln.data[k]); continue; }
    const m = ln.mnemonic; const form = FORMS[m];
    if (!form) throw new Error('Unknown instruction "' + m + '"');
    if (ln.operands.length !== form.length) throw new Error('"' + m + '" expects ' + form.length + ' operand(s), got ' + ln.operands.length + ' — ' + ln.raw);
    let word = (OPC[m] << 3) & 255;
    let pushed = false;
    for (let j = 0; j < form.length; j++) {
      const kind = form[j];
      const value = resolve(kind, ln.operands[j], labels, ln.raw);
      if (kind === 'reg' || kind === 'addr' || kind === 'cond') { word = (word | value) & 255; pushed = true; bytes.push(word); }
      else {
        const a = value & 255;
        if (m === 'BRC') { bytes.push(Math.floor(a / 128) & 255); bytes.push(((a % 128) - 2 + 256) & 255); }
        else { if (!pushed) { bytes.push(word); pushed = true; } bytes.push(a); }
      }
    }
    if (!pushed) bytes.push(word);
  }
  bytes.push((OPC.HLT << 3) & 255);
  const hex = bytes.map((b) => (b < 16 ? '0' : '') + b.toString(16).toUpperCase()).join(' ');
  return { bytes: bytes, words: bytes.length, hex: hex };
}
`;

const CARBON_ROM = `// Carbon ROM — lays machine-code bytes out as a readable HEX-NIBBLE grid. Each
// byte becomes two cells: HIGH nibble then LOW nibble, with the cell's comparator
// signal = the nibble value (0..15) via the {signal=N} barrel shorthand. A 0
// nibble is solid black concrete (reads as 0). Nibbles run left->right, COLS per
// row, wrapping DOWNWARD (the first byte sits top-left). A redstone_lamp marks
// the top-left origin. e.g. 0x78 -> barrel(7), barrel(8); 0x00 -> block, block.
// (NB: the reference romgen.rs is a broken bit-plane transpose — it emits bogus
// signals >15 — so this readable nibble layout is used instead.)
type Inputs = {
  bytes: number[];
};
type Outputs = {
  rom: Schematic;
  nibbles: number;
  bytes: number;
};
function generate(inputs) {
  const data = inputs.bytes || [];
  const COLS = 16; // nibbles per row (8 bytes)
  const nibbles = [];
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] | 0) & 255;
    nibbles.push((v >> 4) & 15); // high nibble first
    nibbles.push(v & 15);        // then low nibble
  }
  const rows = Math.max(1, Math.ceil(nibbles.length / COLS));
  const rom = new Schematic();
  // Origin/orientation marker at the top-left corner (next to the first nibble).
  rom.set_block(0, 2 + 2 * (rows - 1), 0, 'minecraft:redstone_lamp');
  for (let i = 0; i < nibbles.length; i++) {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const n = nibbles[i];
    const x = 2 + 2 * col;
    const y = 2 + 2 * (rows - 1 - row); // row 0 at the top, wrapping downward
    // A 0 nibble is a solid block (comparator reads 0); else a signal barrel.
    const block = n === 0
      ? 'minecraft:black_concrete'
      : 'minecraft:barrel[facing=north,open=false]{signal=' + n + '}';
    rom.set_block(x, y, 0, block);
  }
  return { rom: rom, nibbles: nibbles.length, bytes: data.length };
}
`;


export const PARKED_EXAMPLE_BLOCKS: ExampleBlock[] = [
  {
    id: 'rom-data',
    name: 'Bytes → ROM Data',
    description:
      'ISA-agnostic: serialises any byte array into the base-N digit string the schematic-api ROM generator (roms.py) consumes. Feed it any assembler output.',
    source: ROM_DATA,
  },
  {
    id: 'rom-schematic',
    name: 'Bytes → ROM Schematic',
    description:
      'ISA-agnostic: lays any byte array out as a Minecraft ROM schematic (roms.py layout: words tiled across X/Z, digit cells stacked on Y) for an in-editor preview.',
    source: ROM_SCHEMATIC,
  },
  {
    id: 'rom-generator',
    name: 'ROM Generator',
    description:
      'ISA-agnostic: turns a base-N digit string (roms.py data) into a configurable ROM schematic. Publish this flow as a module, then feed it any assembler ROM-data string.',
    source: ROM_GENERATOR,
  },
  {
    id: 'arpu-assembler',
    name: 'ARPU Assembler (example)',
    description:
      'Example: an assembler for the ARPU 8-bit redstone CPU, built entirely on the generic Asm primitive — the "bring your own ISA" template. Outputs machine-code bytes.',
    source: ARPU_ASSEMBLE,
  },
  {
    id: 'custom-isa',
    name: 'Custom ISA (template)',
    description:
      'Smallest "bring your own ISA" starter: a 4-instruction toy CPU defined with Asm.define. Copy, edit the spec, assemble your own machine code.',
    source: CUSTOM_ISA,
  },
  {
    id: 'batpu2-assembler',
    name: 'BatPU-2 Assembler (example)',
    description:
      'Example: an assembler for the BatPU-2 16-bit redstone CPU (by mattbatwings), hand-rolled on the generic Asm helpers. Verified word-for-word against its real assembler.py. Outputs 16-bit machine-code words + binary text.',
    source: BATPU2_ASSEMBLE,
  },
  {
    id: 'urcl-assembler',
    name: 'URCL Assembler (IR)',
    description:
      'Example: an assembler for URCL — a target-independent redstone IR (by ModPunchtree). Built on the generic Asm primitive (IR back-end, assembleIR): URCL has no fixed machine encoding, so it resolves to a structured instruction listing instead of bytes.',
    source: URCL_ASSEMBLE,
  },
  {
    id: 'iris-assembler',
    name: 'IRIS Assembler (best-effort)',
    description:
      'Example: an assembler for the IRIS 24-bit redstone CPU (the main hardware target URCL compiles to). BEST-EFFORT: its encoding is per the IRIS spec sheet and NOT hardware-verified (no reference assembler exists), so only the deterministic pseudo-op lowering + C/A/B default-fill are faithful. Outputs 24-bit words.',
    source: IRIS_ASSEMBLE,
  },
  {
    id: 'carbon-assembler',
    name: 'Carbon 1.1 Assembler (example)',
    description:
      'Example: an assembler for Carbon 1.1, an 8-bit ACC-based Minecraft redstone CPU (by tony-ist), hand-rolled on plain JS. Verified byte-for-byte against the Rust reference assembler. Outputs machine-code bytes.',
    source: CARBON_ASSEMBLE,
  },
  {
    id: 'carbon-rom',
    name: 'Carbon ROM (hex nibbles)',
    description:
      'Lays machine-code bytes out as a readable hex-nibble ROM: each byte is a high-nibble then low-nibble cell, comparator signal = nibble value, 0 = solid block. Nibbles run left→right, 16 per row, wrapping down from the top-left origin.',
    source: CARBON_ROM,
  },
];

export const PARKED_EXAMPLE_BLOCK_CONTRACTS: Record<string, BlockContract> = {
  'rom-data': {
    inputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
      base: { kind: 'number', widget: 'input', min: 2, max: 16, step: 1, default: 16 },
      bitWidth: { kind: 'number', widget: 'input', min: 0, max: 64, step: 1, default: 0 },
      padTo: { kind: 'number', widget: 'input', min: 0, max: 65536, step: 1, default: 0 },
    },
    outputs: {
      data: { kind: 'string' },
      words: { kind: 'number' },
    },
  },
  'rom-schematic': {
    inputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
      bitWidth: { kind: 'number', widget: 'input', min: 1, max: 64, step: 1, default: 2 },
      dataBlock: { kind: 'block', default: 'minecraft:barrel[facing=up]' },
    },
    outputs: {
      rom: { kind: 'schematic' },
      words: { kind: 'number' },
    },
  },
  'rom-generator': {
    inputs: {
      data: { kind: 'string', multiline: true, required: true },
      base: { kind: 'number', widget: 'input', min: 2, max: 16, step: 1, default: 16 },
      bitWidth: { kind: 'number', widget: 'input', min: 1, max: 64, step: 1, default: 8 },
    },
    outputs: {
      rom: { kind: 'schematic' },
    },
  },
  'arpu-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
      words: { kind: 'number' },
      hex: { kind: 'string' },
    },
  },
  'custom-isa': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
      words: { kind: 'number' },
    },
  },
  'batpu2-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      words: { kind: 'list', of: { kind: 'number' } },
      count: { kind: 'number' },
      bits: { kind: 'string' },
    },
  },
  'urcl-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      ir: { kind: 'string' },
      count: { kind: 'number' },
    },
  },
  'carbon-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
      words: { kind: 'number' },
      hex: { kind: 'string' },
    },
  },
  'carbon-rom': {
    inputs: {
      bytes: { kind: 'list', of: { kind: 'number' } },
    },
    outputs: {
      rom: { kind: 'schematic' },
      nibbles: { kind: 'number' },
      bytes: { kind: 'number' },
    },
  },
  'iris-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      words: { kind: 'list', of: { kind: 'number' } },
      count: { kind: 'number' },
    },
  },
};
