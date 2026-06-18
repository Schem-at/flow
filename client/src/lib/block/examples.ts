/**
 * Built-in example blocks in the v2 block format: a `type Inputs/Outputs`
 * contract plus a plain-JS `function generate(inputs)` entry. No imports or
 * exports — the runtime context (Schematic, Noise, …) is ambient.
 */

import type { BlockContract } from '@flow/core';

export interface ExampleBlock {
  id: string;
  name: string;
  description: string;
  source: string;
  /** 'platform' blocks surface in their own palette category (Schemati). */
  category?: 'platform';
}





const JULIA_GRID = `// Each grid cell is the Julia set for the constant c at the cell's position in
// the complex plane — together the dense cells trace the Mandelbrot set.
const GRADIENT = [
  'minecraft:blue_concrete',
  'minecraft:cyan_concrete',
  'minecraft:light_blue_concrete',
  'minecraft:green_concrete',
  'minecraft:lime_concrete',
  'minecraft:yellow_concrete',
  'minecraft:orange_concrete',
  'minecraft:red_concrete',
  'minecraft:pink_concrete',
  'minecraft:magenta_concrete',
  'minecraft:purple_concrete',
];

const MAX_HEIGHT = 8;

function juliaTile(cRe, cIm, size, maxIterations) {
  const schem = new Schematic();
  let anyEscaped = false;
  for (let px = 0; px < size; px++) {
    for (let pz = 0; pz < size; pz++) {
      let zx = (px / (size - 1)) * 3 - 1.5;
      let zy = (pz / (size - 1)) * 3 - 1.5;
      let it = 0;
      while (zx * zx + zy * zy <= 4 && it < maxIterations) {
        const xt = zx * zx - zy * zy + cRe;
        zy = 2 * zx * zy + cIm;
        zx = xt;
        it++;
      }
      let block;
      let height;
      if (it >= maxIterations) {
        block = 'minecraft:black_concrete';
        height = MAX_HEIGHT;
      } else {
        anyEscaped = true;
        const t = it / maxIterations;
        block = GRADIENT[Math.min(GRADIENT.length - 1, Math.floor(t * GRADIENT.length))];
        height = Math.max(1, Math.round(t * MAX_HEIGHT));
      }
      for (let y = 0; y < height; y++) {
        schem.set_block(px, y, pz, block);
      }
    }
  }
  // A tile fully inside the set would have a single-entry palette, which
  // trips a divide-by-zero in nucleation's region packing — vary one block.
  if (!anyEscaped) {
    schem.set_block(0, MAX_HEIGHT - 1, 0, 'minecraft:gray_concrete');
  }
  return schem;
}

type Inputs = {
  cols: Slider<{ min: 1; max: 8; default: 4 }>;
  rows: Slider<{ min: 1; max: 6; default: 3 }>;
  tile: Slider<{ min: 8; max: 32; default: 16 }>;
  iterations: Slider<{ min: 8; max: 64; default: 32 }>;
};
type Outputs = {
  tiles: Schematic[][];
};
function generate(inputs) {
  const { cols, rows, tile, iterations } = inputs;
  // The region of the complex plane that frames the Mandelbrot set.
  const RE_MIN = -2.0, RE_MAX = 0.6, IM_MIN = -1.2, IM_MAX = 1.2;
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    Progress.report((r / rows) * 100, 'julia row ' + (r + 1) + '/' + rows);
    const row = [];
    for (let c = 0; c < cols; c++) {
      const cRe = RE_MIN + (cols > 1 ? c / (cols - 1) : 0.5) * (RE_MAX - RE_MIN);
      const cIm = IM_MAX - (rows > 1 ? r / (rows - 1) : 0.5) * (IM_MAX - IM_MIN);
      row.push(juliaTile(cRe, cIm, tile, iterations));
    }
    tiles.push(row);
  }
  return { tiles };
}
`;




const NOISE_FIELD = `// Field + Noise + Image ambients replace ~70 lines of hand-rolled value noise,
// fBm stacking, normalization and RGBA byte loops. Inputs come in as one object
// (\`generate(inputs)\`); the contract is the \`type Inputs\`/\`type Outputs\` pair.
type Inputs = {
  size: Slider<{ min: 32; max: 256; default: 96 }>;
  scale: Slider<{ min: 0.005; max: 0.1; step: 0.005; default: 0.02 }>;
  octaves: Slider<{ min: 1; max: 6; default: 4 }>;
  seed: number;
};
type Outputs = {
  field: number[][];
  preview: Image;
};
function generate(inputs) {
  const { size, scale, octaves, seed } = inputs;
  const n = size | 0;
  const seedShift = (seed | 0) * 1009;
  const field = Field.normalize(
    Field.create(n, n, (x, z) =>
      Noise.getFractal2D_01(x + seedShift, z, {
        frequency: scale,
        octaves,
      })
    )
  );
  return { field, preview: Image.fromField(field, 'grayscale') };
}
`;

const VORONOI_FIELD = `type Inputs = {
  size: Slider<{ min: 32; max: 256; default: 96 }>;
  cells: Slider<{ min: 2; max: 24; default: 7 }>;
  seed: number;
};
type Outputs = {
  field: number[][];
  preview: Image;
};
function generate(inputs) {
  const { size, cells, seed } = inputs;
  const n = size | 0;
  const c = cells | 0;
  // F1 Worley/cellular noise: distance to the nearest jittered feature point.
  // frequency = cells/size lays roughly cells features across the span; the
  // seed shifts the sample lattice. Replaces the hand-rolled point grid +
  // nearest-distance scan + RGBA byte loop.
  const field = Field.normalize(
    Field.create(n, n, (x, z) =>
      Noise.worley(x + (seed | 0) * 131, z, { frequency: c / n })
    )
  );
  return { field, preview: Image.fromField(field, 'grayscale') };
}
`;

const COMBINE_FIELDS = `type Inputs = {
  a: number[][];
  b: number[][];
  op: 'subtract' | 'add' | 'multiply' | 'min' | 'max' | 'average';
  strength: Slider<{ min: 0; max: 1; step: 0.05; default: 1 }>;
};
type Outputs = {
  field: number[][];
  preview: Image;
};
function generate(inputs) {
  const { a, b, op, strength } = inputs;
  const fa = a || [];
  const fb = b || [];
  const size = Math.min(fa.length, fb.length);
  if (!size) return { field: [], preview: Image.blank() };

  // Element-wise op with a strength dial; Field.combine walks both fields and
  // Field.normalize rescales the result into [0, 1] (the manual min/max loop).
  const k = strength;
  const merged = Field.combine(fa, fb, (va, raw) => {
    const vb = raw * k;
    if (op === 'add') return va + vb;
    if (op === 'multiply') return va * (1 - k + vb);
    if (op === 'min') return Math.min(va, vb);
    if (op === 'max') return Math.max(va, vb);
    if (op === 'average') return (va + vb) / 2;
    return va - vb; // subtract (perlin minus voronoi = eroded ridges)
  });
  const field = Field.normalize(merged);
  return { field, preview: Image.fromField(field, 'grayscale') };
}
`;

const SHAPE_FIELD = `type Inputs = {
  field: number[][];
  exponent: Slider<{ min: 0.3; max: 3; step: 0.1; default: 1.6 }>;
  terraces: Slider<{ min: 0; max: 12; default: 0 }>;
};
type Outputs = {
  field: number[][];
  preview: Image;
};
function generate(inputs) {
  const { field, exponent, terraces } = inputs;
  const src = field || [];
  if (!src.length) return { field: [], preview: Image.blank() };

  // Field.map walks every cell; exponent > 1 flattens valleys and sharpens
  // peaks, then optional terracing snaps to flat steps. Image.fromField
  // renders the preview (replaces the hand-rolled RGBA byte loop).
  const steps = terraces | 0;
  const out = Field.map(src, (value) => {
    let v = Math.pow(value, exponent);
    if (steps > 0) v = Math.round(v * steps) / steps;
    return v;
  });
  return { field: out, preview: Image.fromField(out, 'grayscale') };
}
`;

const FIELD_TO_TERRAIN = `const BIOMES = {
  water:    { color: [56, 108, 215],  top: 'minecraft:blue_stained_glass' },
  beach:    { color: [222, 206, 153], top: 'minecraft:sand' },
  plains:   { color: [120, 176, 84],  top: 'minecraft:grass_block' },
  forest:   { color: [52, 116, 56],   top: 'minecraft:grass_block' },
  mountain: { color: [136, 136, 136], top: 'minecraft:stone' },
  snow:     { color: [240, 244, 248], top: 'minecraft:snow_block' },
};

function classify(e, m, waterLevel) {
  if (e <= waterLevel) return 'water';
  if (e <= waterLevel + 0.04) return 'beach';
  if (e > 0.85) return 'snow';
  if (e > 0.68) return 'mountain';
  return m > 0.5 ? 'forest' : 'plains';
}

function plantTree(terrain, x, y, z) {
  for (let i = 0; i < 4; i++) terrain.set_block(x, y + i, z, 'minecraft:oak_log');
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 3; dy <= 5; dy++) {
        if (dy === 5 && (dx !== 0 || dz !== 0)) continue;
        if (dx === 0 && dz === 0 && dy < 5) continue;
        terrain.set_block(x + dx, y + dy, z + dz, 'minecraft:oak_leaves');
      }
    }
  }
}

type Inputs = {
  elevation: number[][];
  moisture: number[][];
  amplitude: Slider<{ min: 4; max: 64; default: 30 }>;
  waterLevel: Slider<{ min: 0; max: 1; step: 0.05; default: 0.35 }>;
  seed: number;
};
type Outputs = {
  terrain: Schematic;
  biomes: Image;
};
function generate(inputs) {
  const { elevation, moisture, amplitude, waterLevel, seed } = inputs;
  const elev = elevation || [];
  const moist = moisture || [];
  const size = elev.length;
  const terrain = new Schematic();
  if (!size) return { terrain, biomes: Image.blank() };

  const biomes = new Image(size, size);
  const waterY = Math.max(1, Math.floor(waterLevel * amplitude));

  for (let x = 0; x < size; x++) {
    if (x % 8 === 0) Progress.report((x / size) * 100, 'building column ' + x);
    for (let z = 0; z < size; z++) {
      const e = elev[x][z];
      const m = moist[x] && moist[x][z] !== undefined ? moist[x][z] : 0.5;
      const biome = classify(e, m, waterLevel);
      const spec = BIOMES[biome];

      biomes.setPixel(x, z, spec.color[0], spec.color[1], spec.color[2]);

      const height = Math.max(1, Math.floor(e * amplitude));
      for (let y = 0; y < height - 1; y++) {
        terrain.set_block(x, y, z, y < height - 4 ? 'minecraft:stone' : 'minecraft:dirt');
      }
      if (biome === 'water') {
        terrain.set_block(x, height - 1, z, 'minecraft:gravel');
        for (let y = height; y <= waterY; y++) {
          terrain.set_block(x, y, z, spec.top);
        }
      } else {
        terrain.set_block(x, height - 1, z, spec.top);
        if (biome === 'forest' && x > 1 && z > 1 && x < size - 2 && z < size - 2 &&
            Random.hash2(x, z, (seed | 0) + 31) < 0.025) {
          plantTree(terrain, x, height, z);
        }
      }
    }
  }

  return { terrain, biomes };
}
`;

const SCHEMATI_SEARCH = `// Searches the schemati platform. In the browser this rides your session;
// on the server it uses SCHEMATI_URL / SCHEMATI_API_TOKEN.
type Inputs = {
  tag: string;
  search: string;
  limit: Slider<{ min: 1; max: 50; default: 10 }>;
};
type Outputs = {
  results: { name: string; id: string; format: string; tags: string; authors: string }[];
  firstId: string;
  count: number;
};
async function generate(inputs) {
  const { tag, search, limit } = inputs;
  const found = await Schemati.searchSchematics({
    tag: tag || undefined,
    search: search || undefined,
    limit: limit,
  });

  const results = found.map((s) => ({
    name: s.name,
    id: Schemati.displayId(s),
    format: s.format,
    tags: s.tags.join(', '),
    authors: s.authors.join(', '),
  }));

  return {
    results,
    firstId: found.length ? Schemati.displayId(found[0]) : '',
    count: found.length,
  };
}
`;

const SCHEMATI_FETCH = `// Downloads a schematic from the platform by id, short id, or slug and
// loads it as a live Schematic (one download, parsed locally). The
// required flag blocks runs until the id is provided.
type Inputs = {
  id: TextField<{ required: true }>;
};
type Outputs = {
  schematic: Schematic;
  name: string;
};
async function generate(inputs) {
  // One step: download + parse into a live Schematic.
  const loaded = await Schemati.loadSchematic(inputs.id);
  return { schematic: loaded.schematic, name: loaded.name };
}
`;




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
// Just two knobs: how tall each word is (bitWidth binary cells) and the block
// used for set bits. The word grid is auto-sized from the byte count, so you
// only ever wire up 'bytes'.
type Inputs = {
  bytes: number[];
  bitWidth: NumberField<{ min: 1; max: 64; step: 1; default: 8 }>;
  dataBlock: Block<{ default: 'minecraft:barrel' }>;
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
    base: 2,
    bitWidth: inputs.bitWidth || 8,
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
      inputs.dataBlock;
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

export const EXAMPLE_BLOCKS: ExampleBlock[] = [
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
    id: 'julia-grid',
    name: 'Julia Set Grid',
    description:
      'A rows×cols grid of 3D Julia-set tiles tracing the Mandelbrot set — outputs a list of lists of schematics.',
    source: JULIA_GRID,
  },
  {
    id: 'schemati-search',
    name: 'Search',
    description:
      'Searches schematics on the schemati platform by tag or text — outputs a result table and the first match id.',
    source: SCHEMATI_SEARCH,
    category: 'platform',
  },
  {
    id: 'schemati-fetch',
    name: 'Fetch',
    description:
      'Downloads a schematic from the platform (by id, short id, or slug) as a live Schematic.',
    source: SCHEMATI_FETCH,
    category: 'platform',
  },
  {
    id: 'noise-field',
    name: 'Noise Field (fBm)',
    description:
      'Multi-octave value-noise heightfield (number[][]), normalized 0..1, with a grayscale preview.',
    source: NOISE_FIELD,
  },
  {
    id: 'voronoi-field',
    name: 'Voronoi Field',
    description:
      'F1 Worley/cellular distance field from jittered grid points — subtract it from noise for eroded ridges.',
    source: VORONOI_FIELD,
  },
  {
    id: 'combine-fields',
    name: 'Combine Fields',
    description:
      'Combines two heightfields (subtract/add/multiply/min/max/average) with a strength dial, renormalized.',
    source: COMBINE_FIELDS,
  },
  {
    id: 'shape-field',
    name: 'Shape Field',
    description:
      'Curve a heightfield: exponent redistribution (sharpen peaks) and optional terracing.',
    source: SHAPE_FIELD,
  },
  {
    id: 'field-to-terrain',
    name: 'Field → Terrain',
    description:
      'Turns elevation + moisture fields into a biome-painted world (water/beach/plains/forest/mountain/snow, trees included) plus a colored biome map.',
    source: FIELD_TO_TERRAIN,
  },
];

/** number[][] — the heightfield currency of the worldgen blocks. */
const FIELD_TYPE = {
  kind: 'list',
  of: { kind: 'list', of: { kind: 'number' } },
} as const;

/**
 * Static contracts for every example block, so they can be dropped into the
 * node editor with typed ports immediately (no parse round-trip). Drift is
 * guarded by tests asserting these equal what the parser derives.
 */
export const EXAMPLE_BLOCK_CONTRACTS: Record<string, BlockContract> = {
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
      bitWidth: { kind: 'number', widget: 'input', min: 1, max: 64, step: 1, default: 8 },
      dataBlock: { kind: 'block', default: 'minecraft:barrel' },
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
  'iris-assembler': {
    inputs: {
      program: { kind: 'string', multiline: true, required: true },
    },
    outputs: {
      words: { kind: 'list', of: { kind: 'number' } },
      count: { kind: 'number' },
    },
  },
  'schemati-search': {
    inputs: {
      tag: { kind: 'string' },
      search: { kind: 'string' },
      limit: { kind: 'number', widget: 'slider', min: 1, max: 50, default: 10 },
    },
    outputs: {
      results: {
        kind: 'list',
        of: {
          kind: 'object',
          fields: {
            name: { kind: 'string' },
            id: { kind: 'string' },
            format: { kind: 'string' },
            tags: { kind: 'string' },
            authors: { kind: 'string' },
          },
        },
      },
      firstId: { kind: 'string' },
      count: { kind: 'number' },
    },
  },
  'schemati-fetch': {
    inputs: { id: { kind: 'string', required: true } },
    outputs: { schematic: { kind: 'schematic' }, name: { kind: 'string' } },
  },
  'julia-grid': {
    inputs: {
      cols: { kind: 'number', widget: 'slider', min: 1, max: 8, default: 4 },
      rows: { kind: 'number', widget: 'slider', min: 1, max: 6, default: 3 },
      tile: { kind: 'number', widget: 'slider', min: 8, max: 32, default: 16 },
      iterations: { kind: 'number', widget: 'slider', min: 8, max: 64, default: 32 },
    },
    outputs: { tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } } },
  },
  'noise-field': {
    inputs: {
      size: { kind: 'number', widget: 'slider', min: 32, max: 256, default: 96 },
      scale: { kind: 'number', widget: 'slider', min: 0.005, max: 0.1, step: 0.005, default: 0.02 },
      octaves: { kind: 'number', widget: 'slider', min: 1, max: 6, default: 4 },
      seed: { kind: 'number' },
    },
    outputs: { field: FIELD_TYPE, preview: { kind: 'image' } },
  },
  'voronoi-field': {
    inputs: {
      size: { kind: 'number', widget: 'slider', min: 32, max: 256, default: 96 },
      cells: { kind: 'number', widget: 'slider', min: 2, max: 24, default: 7 },
      seed: { kind: 'number' },
    },
    outputs: { field: FIELD_TYPE, preview: { kind: 'image' } },
  },
  'combine-fields': {
    inputs: {
      a: FIELD_TYPE,
      b: FIELD_TYPE,
      op: { kind: 'enum', options: ['subtract', 'add', 'multiply', 'min', 'max', 'average'] },
      strength: { kind: 'number', widget: 'slider', min: 0, max: 1, step: 0.05, default: 1 },
    },
    outputs: { field: FIELD_TYPE, preview: { kind: 'image' } },
  },
  'shape-field': {
    inputs: {
      field: FIELD_TYPE,
      exponent: { kind: 'number', widget: 'slider', min: 0.3, max: 3, step: 0.1, default: 1.6 },
      terraces: { kind: 'number', widget: 'slider', min: 0, max: 12, default: 0 },
    },
    outputs: { field: FIELD_TYPE, preview: { kind: 'image' } },
  },
  'field-to-terrain': {
    inputs: {
      elevation: FIELD_TYPE,
      moisture: FIELD_TYPE,
      amplitude: { kind: 'number', widget: 'slider', min: 4, max: 64, default: 30 },
      waterLevel: { kind: 'number', widget: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
      seed: { kind: 'number' },
    },
    outputs: { terrain: { kind: 'schematic' }, biomes: { kind: 'image' } },
  },
};
