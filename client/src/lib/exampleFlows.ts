/**
 * Built-in example FLOWS for the node editor — complete node/edge graphs that
 * exercise multi-step execution. The Julia flow chains two v2 blocks: one
 * generates a Schematic[][] grid of Julia-set tiles, the next stitches them
 * into a single schematic, previewed by a viewer and exposed via an output
 * node (so the same flow works through POST /api/execute and the FlowRunner).
 */

import type { FlowData, BlockContract } from '@flow/core';
import { EXAMPLE_BLOCKS, EXAMPLE_BLOCK_CONTRACTS } from './block/examples';
import { contractToIO } from './block/io-compat';
// Carbon programs reused as both assembler test fixtures and editor examples.
import CARBON_FIB from './asm/__fixtures__/carbon/fibonacci.s?raw';
import CARBON_MANDEL from './asm/__fixtures__/carbon/mandelbrot.s?raw';

const JULIA_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'julia-grid')!.source;

const JULIA_CONTRACT: BlockContract = {
  inputs: {
    cols: { kind: 'number', widget: 'slider', min: 1, max: 8, default: 4 },
    rows: { kind: 'number', widget: 'slider', min: 1, max: 6, default: 3 },
    tile: { kind: 'number', widget: 'slider', min: 8, max: 32, default: 16 },
    iterations: { kind: 'number', widget: 'slider', min: 8, max: 64, default: 32 },
  },
  outputs: {
    tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
  },
};

export const STITCH_SOURCE = `type Inputs = {
  tiles: Schematic[][];
  spacing: Slider<{ min: 0; max: 8; default: 2 }>;
};

type Outputs = {
  stitched: Schematic;
};

function generate(inputs) {
  const tiles = inputs.tiles || [];
  const spacing = inputs.spacing ?? 2;

  // tileGrid (packed) lays rows out exactly like the old hand-rolled loop:
  // per-row offsetX += tileWidth + spacing, offsetZ += maxRowDepth + spacing,
  // skipping non-schematic cells and air blocks.
  const stitched = Schematic.tileGrid(tiles, { spacing: spacing, mode: 'packed' });

  return { stitched };
}
`;

const STITCH_CONTRACT: BlockContract = {
  inputs: {
    tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
    spacing: { kind: 'number', widget: 'slider', min: 0, max: 8, default: 2 },
  },
  outputs: {
    stitched: { kind: 'schematic' },
  },
};

export const JULIA_STITCH_FLOW: FlowData = {
  id: 'example-julia-stitch',
  name: 'Julia Set Mosaic',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'cols-input',
      type: 'input',
      position: { x: 0, y: 40 },
      data: {
        label: 'cols',
        value: 4,
        dataType: 'number',
        widgetType: 'slider',
        min: 1,
        max: 8,
        step: 1,
        description: 'Grid columns',
      },
    },
    {
      id: 'julia-gen',
      type: 'code',
      position: { x: 320, y: 0 },
      data: {
        label: 'Julia Grid',
        code: JULIA_SOURCE,
        contract: JULIA_CONTRACT,
        io: contractToIO(JULIA_CONTRACT),
      },
    },
    {
      id: 'stitcher',
      type: 'code',
      position: { x: 780, y: 60 },
      data: {
        label: 'Stitch Tiles',
        code: STITCH_SOURCE,
        contract: STITCH_CONTRACT,
        io: contractToIO(STITCH_CONTRACT),
      },
    },
    {
      id: 'tiles-viewer',
      type: 'viewer',
      position: { x: 780, y: 420 },
      data: { label: 'Tile gallery', isResizable: true },
    },
    {
      id: 'mosaic-viewer',
      type: 'viewer',
      position: { x: 1240, y: 0 },
      data: { label: 'Mosaic preview', isResizable: true },
    },
    {
      id: 'mosaic-output',
      type: 'output',
      position: { x: 1240, y: 380 },
      data: { label: 'mosaic' },
    },
  ],
  edges: [
    {
      id: 'e-cols',
      source: 'cols-input',
      target: 'julia-gen',
      sourceHandle: 'output',
      targetHandle: 'cols',
    },
    {
      id: 'e-tiles',
      source: 'julia-gen',
      target: 'stitcher',
      sourceHandle: 'tiles',
      targetHandle: 'tiles',
    },
    {
      id: 'e-tiles-view',
      source: 'julia-gen',
      target: 'tiles-viewer',
      sourceHandle: 'tiles',
      targetHandle: 'input',
    },
    {
      id: 'e-view',
      source: 'stitcher',
      target: 'mosaic-viewer',
      sourceHandle: 'stitched',
      targetHandle: 'input',
    },
    {
      id: 'e-out',
      source: 'stitcher',
      target: 'mosaic-output',
      sourceHandle: 'stitched',
      targetHandle: 'input',
    },
  ],
};

// ─── Worldgen Studio ────────────────────────────────────────────────────────
// A real procedural-worldgen graph where RAW HEIGHTFIELDS (number[][]) flow
// between nodes: fBm noise minus a Voronoi field (eroded ridges) → exponent/
// terrace shaping → combined with a second noise field as moisture to paint
// biomes and raise the final world. Every stage exposes a preview image.

const WG = (id: string) => ({
  code: EXAMPLE_BLOCKS.find((b) => b.id === id)!.source,
  contract: EXAMPLE_BLOCK_CONTRACTS[id],
  io: contractToIO(EXAMPLE_BLOCK_CONTRACTS[id]),
});

export const WORLDGEN_FLOW: FlowData = {
  id: 'example-worldgen',
  name: 'Worldgen Studio',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'wg-seed',
      type: 'input',
      position: { x: 0, y: 40 },
      data: { label: 'seed', value: 11, dataType: 'number', widgetType: 'number' },
    },
    {
      id: 'wg-water',
      type: 'input',
      position: { x: 0, y: 200 },
      data: {
        label: 'waterLevel',
        value: 0.35,
        dataType: 'number',
        widgetType: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    {
      id: 'wg-size',
      type: 'input',
      position: { x: -380, y: -120 },
      data: { label: 'world size', value: 96, dataType: 'number', widgetType: 'slider', min: 32, max: 256 },
    },
    {
      id: 'wg-elev-scale',
      type: 'input',
      position: { x: -380, y: -300 },
      data: { label: 'elevation scale', value: 0.02, dataType: 'number', widgetType: 'slider', min: 0.005, max: 0.1, step: 0.005 },
    },
    {
      id: 'wg-elev-octaves',
      type: 'input',
      position: { x: -380, y: -420 },
      data: { label: 'elevation octaves', value: 4, dataType: 'number', widgetType: 'slider', min: 1, max: 6 },
    },
    {
      id: 'wg-cells',
      type: 'input',
      position: { x: -380, y: 320 },
      data: { label: 'voronoi cells', value: 7, dataType: 'number', widgetType: 'slider', min: 2, max: 24 },
    },
    {
      id: 'wg-moist-scale',
      type: 'input',
      position: { x: -380, y: 560 },
      data: { label: 'moisture scale', value: 0.03, dataType: 'number', widgetType: 'slider', min: 0.005, max: 0.1, step: 0.005 },
    },
    {
      id: 'wg-moist-octaves',
      type: 'input',
      position: { x: -380, y: 680 },
      data: { label: 'moisture octaves', value: 3, dataType: 'number', widgetType: 'slider', min: 1, max: 6 },
    },
    {
      id: 'wg-strength',
      type: 'input',
      position: { x: 560, y: -180 },
      data: { label: 'ridge strength', value: 1, dataType: 'number', widgetType: 'slider', min: 0, max: 1, step: 0.05 },
    },
    {
      id: 'wg-exponent',
      type: 'input',
      position: { x: 1060, y: -160 },
      data: { label: 'shape exponent', value: 1.6, dataType: 'number', widgetType: 'slider', min: 0.3, max: 3, step: 0.1 },
    },
    {
      id: 'wg-terraces',
      type: 'input',
      position: { x: 1060, y: -40 },
      data: { label: 'terraces', value: 0, dataType: 'number', widgetType: 'slider', min: 0, max: 12 },
    },
    {
      id: 'wg-amplitude',
      type: 'input',
      position: { x: 1560, y: 100 },
      data: { label: 'amplitude', value: 30, dataType: 'number', widgetType: 'slider', min: 4, max: 64 },
    },
    {
      id: 'wg-perlin',
      type: 'code',
      position: { x: 300, y: -160 },
      data: { label: 'Elevation Noise', ...WG('noise-field') },
    },
    {
      id: 'wg-voronoi',
      type: 'code',
      position: { x: 300, y: 220 },
      data: { label: 'Voronoi Cells', ...WG('voronoi-field') },
    },
    {
      id: 'wg-moisture',
      type: 'code',
      position: { x: 300, y: 600 },
      data: { label: 'Moisture Noise', ...WG('noise-field') },
    },
    {
      id: 'wg-combine',
      type: 'code',
      position: { x: 800, y: 0 },
      data: { label: 'Perlin − Voronoi', ...WG('combine-fields') },
    },
    {
      id: 'wg-shape',
      type: 'code',
      position: { x: 1300, y: 60 },
      data: { label: 'Shape (peaks)', ...WG('shape-field') },
    },
    {
      id: 'wg-build',
      type: 'code',
      position: { x: 1800, y: 260 },
      data: { label: 'Biome World', ...WG('field-to-terrain') },
    },
    {
      id: 'wg-v-perlin',
      type: 'viewer',
      position: { x: 800, y: -360 },
      data: { label: 'elevation field' },
    },
    {
      id: 'wg-v-voronoi',
      type: 'viewer',
      position: { x: 800, y: 420 },
      data: { label: 'voronoi field' },
    },
    {
      id: 'wg-v-combined',
      type: 'viewer',
      position: { x: 1300, y: -300 },
      data: { label: 'ridged field' },
    },
    {
      id: 'wg-v-shaped',
      type: 'viewer',
      position: { x: 1800, y: -240 },
      data: { label: 'shaped field' },
    },
    {
      id: 'wg-v-biomes',
      type: 'viewer',
      position: { x: 2300, y: 480 },
      data: { label: 'biome map' },
    },
    {
      id: 'wg-v-world',
      type: 'viewer',
      position: { x: 2300, y: 0 },
      data: { label: 'world', isResizable: true },
    },
    {
      id: 'wg-out',
      type: 'output',
      position: { x: 2300, y: 840 },
      data: { label: 'world' },
    },
  ],
  edges: [
    { id: 'wg-e1', source: 'wg-seed', target: 'wg-perlin', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'wg-e2', source: 'wg-seed', target: 'wg-voronoi', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'wg-e3', source: 'wg-seed', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'wg-e4', source: 'wg-seed', target: 'wg-build', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'wg-e5', source: 'wg-perlin', target: 'wg-combine', sourceHandle: 'field', targetHandle: 'a' },
    { id: 'wg-e6', source: 'wg-voronoi', target: 'wg-combine', sourceHandle: 'field', targetHandle: 'b' },
    { id: 'wg-e7', source: 'wg-combine', target: 'wg-shape', sourceHandle: 'field', targetHandle: 'field' },
    { id: 'wg-e8', source: 'wg-shape', target: 'wg-build', sourceHandle: 'field', targetHandle: 'elevation' },
    { id: 'wg-e9', source: 'wg-moisture', target: 'wg-build', sourceHandle: 'field', targetHandle: 'moisture' },
    { id: 'wg-e10', source: 'wg-water', target: 'wg-build', sourceHandle: 'output', targetHandle: 'waterLevel' },
    { id: 'wg-v1', source: 'wg-perlin', target: 'wg-v-perlin', sourceHandle: 'preview', targetHandle: 'input' },
    { id: 'wg-v2', source: 'wg-voronoi', target: 'wg-v-voronoi', sourceHandle: 'preview', targetHandle: 'input' },
    { id: 'wg-v3', source: 'wg-combine', target: 'wg-v-combined', sourceHandle: 'preview', targetHandle: 'input' },
    { id: 'wg-v4', source: 'wg-shape', target: 'wg-v-shaped', sourceHandle: 'preview', targetHandle: 'input' },
    { id: 'wg-v5', source: 'wg-build', target: 'wg-v-biomes', sourceHandle: 'biomes', targetHandle: 'input' },
    { id: 'wg-v6', source: 'wg-build', target: 'wg-v-world', sourceHandle: 'terrain', targetHandle: 'input' },
    { id: 'wg-o1', source: 'wg-build', target: 'wg-out', sourceHandle: 'terrain', targetHandle: 'input' },
    // Parameter input nodes → code-node inputs (full studio).
    { id: 'wg-i1', source: 'wg-size', target: 'wg-perlin', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-i2', source: 'wg-size', target: 'wg-voronoi', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-i3', source: 'wg-size', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-i4', source: 'wg-elev-scale', target: 'wg-perlin', sourceHandle: 'output', targetHandle: 'scale' },
    { id: 'wg-i5', source: 'wg-elev-octaves', target: 'wg-perlin', sourceHandle: 'output', targetHandle: 'octaves' },
    { id: 'wg-i6', source: 'wg-cells', target: 'wg-voronoi', sourceHandle: 'output', targetHandle: 'cells' },
    { id: 'wg-i7', source: 'wg-moist-scale', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'scale' },
    { id: 'wg-i8', source: 'wg-moist-octaves', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'octaves' },
    { id: 'wg-i9', source: 'wg-strength', target: 'wg-combine', sourceHandle: 'output', targetHandle: 'strength' },
    { id: 'wg-i10', source: 'wg-exponent', target: 'wg-shape', sourceHandle: 'output', targetHandle: 'exponent' },
    { id: 'wg-i11', source: 'wg-terraces', target: 'wg-shape', sourceHandle: 'output', targetHandle: 'terraces' },
    { id: 'wg-i12', source: 'wg-amplitude', target: 'wg-build', sourceHandle: 'output', targetHandle: 'amplitude' },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
//  ASM → ROM Studio — the meta-node showcase
// ════════════════════════════════════════════════════════════════════════════
// One purposeful pipeline that exercises EVERY meta-node working together:
// a real ARPU fibonacci program is assembled to machine-code bytes, then those
// bytes fan out two ways — a Map formats each byte as hex, and a Group ("ROM
// Layout") unbundles a settings struct to drive the ROM-data + ROM-schematic
// blocks. A Switch picks the ROM base (hex vs binary), a Bundle packs the
// config, a Reroute keeps the bytes bus tidy, and an Inspect taps the digits.
//
//   Constant×3 → Switch(base) ─┐
//                              Bundle{config} ─────────────┐
//                                                          ▼
//   program → ARPU Asm → Reroute(bytes) ─┬─► Map(hex)      Group "ROM Layout"
//                                        │                  ├ Unbundle config
//                                        └────────────────► ├ rom-data → data
//                                                           └ rom-schematic → rom
//                              data ─► Inspect ─► romData | rom ─► romPreview
//
// Folds + executes hermetically: the PURE outputs (romData digit string, the
// hex list, words) are deterministic; the rom-schematic `rom` needs the WASM
// `Schematic` global, so the showcase test stubs it and only asserts the pure
// data. Meta-nodes demonstrated: Constant, Switch, Bundle, Unbundle, Group,
// Map, Reroute, Inspect (plus Input/Output and the three ASM/ROM code blocks).

const ASM_ROM = (id: string) => ({
  code: EXAMPLE_BLOCKS.find((b) => b.id === id)!.source,
  contract: EXAMPLE_BLOCK_CONTRACTS[id],
  io: contractToIO(EXAMPLE_BLOCK_CONTRACTS[id]),
});

// The verified fibonacci sample — its bytes match arpuemu's own assembler.
const ASM_ROM_PROGRAM = `IMM R1 0 0
IMM R2 0 1
IMM R3 0 6        // Fibonacci: F0=0, F1=1, run 6 iterations
.loop
ADD R1 R2
SOP R1 0
MOV R1 R2
SOP R2 1
DEC R3 R3
BRA 0 0b11 .loop  // loop while R3 != 0
PST R1 0
.end
BRA 0 0 .end      // halt
`;

// Two MORE verified ARPU programs the selector can feed to the assembler. Each
// assembles cleanly with the same generic 'Asm' spec the arpu-assembler block
// uses (verified against @flow/core's Asm.define/pack).

// A simple counter loop: count down from 5, emitting each value (→ 9 bytes).
const ASM_ROM_COUNTER = `IMM R1 0 5        // counter starts at 5
.loop
SOP R1 0          // emit current value
DEC R1 R1         // R1 = R1 - 1
BRA 0 0b11 .loop  // loop while R1 != 0
PST R1 0
.end
BRA 0 0 .end      // halt
`;

// A small arithmetic program: compute (7 + 3) then double it (→ 10 bytes).
const ASM_ROM_ARITH = `IMM R1 0 7        // R1 = 7
IMM R2 0 3        // R2 = 3
ADD R1 R2         // R1 = R1 + R2  (= 10)
MOV R2 R1         // R2 = R1
ADD R1 R2         // R1 = R1 + R2  (= 20, doubled)
PST R1 0          // store result
.end
BRA 0 0 .end      // halt
`;

// Map body: format one byte as a two-char hex string (item:number → result:string).
export const ASM_ROM_HEX_SOURCE = `type Inputs = {
  item: number;
};
type Outputs = {
  result: string;
};
function generate(inputs) {
  const h = (inputs.item & 0xff).toString(16).padStart(2, '0');
  return { result: h };
}
`;
const ASM_ROM_HEX_CONTRACT: BlockContract = {
  inputs: { item: { kind: 'number' } },
  outputs: { result: { kind: 'string' } },
};

const ROM_CONFIG_TYPE = {
  kind: 'object' as const,
  fields: {
    base: { kind: 'number' as const },
    bitWidth: { kind: 'number' as const },
    rowWidth: { kind: 'number' as const },
  },
};

export const SHOWCASE_FLOW: FlowData = {
  id: 'example-asm-rom-studio',
  name: 'ASM → ROM Studio',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    // ── Frames (decorative backdrops behind their clusters) ──────────────────
    // Authored extents are sized to comfortably WRAP each cluster (≈48px padding
    // + 28px header) and the four clusters occupy DISTINCT, well-separated grid
    // quadrants (top-left / bottom-left / top-right / bottom-right) so the frames
    // never overlap. refitFrames() recomputes these same boxes on tidy/auto-
    // arrange; the authored values mirror that geometry so a freshly-loaded flow
    // already looks tidy.
    { id: 'fr-source', type: 'frame', position: { x: -48, y: -36 },
      data: { label: 'Source — Switch picks a program, then assemble it', width: 1052, height: 594, color: 'indigo', zIndex: -1 } },
    { id: 'fr-config', type: 'frame', position: { x: -48, y: 564 },
      data: { label: 'Config — Switch + Bundle a settings struct', width: 866, height: 614, color: 'emerald', zIndex: -1 } },
    { id: 'fr-perbyte', type: 'frame', position: { x: 1592, y: -16 },
      data: { label: 'Per-byte — Map each byte to hex', width: 586, height: 354, color: 'sky', zIndex: -1 } },
    { id: 'fr-rom', type: 'frame', position: { x: 1252, y: 624 },
      data: { label: 'ROM — Group: Unbundle → rom-data + rom-schematic', width: 956, height: 594, color: 'amber', zIndex: -1 } },

    // ── Comments (sticky notes, parked in the gutters between frames) ─────────
    { id: 'cm-source', type: 'comment', position: { x: 1080, y: 360 },
      data: { label: 'Selector → Switch picks fibonacci / counter / arithmetic → assembler → bytes. Inspect taps the bus.', width: 340, height: 90, zIndex: 1 } },
    { id: 'cm-switch', type: 'comment', position: { x: 900, y: 700 },
      data: { label: 'Switch picks hex (base 16) vs binary (base 2) ROM by selector.', width: 320, height: 90, zIndex: 1 } },

    // ── Source ───────────────────────────────────────────────────────────────
    // Program selector: a number constant (0..2) drives a Switch that picks ONE
    // of three ARPU programs (case0 = the verified fibonacci, case1 = a counter
    // loop, case2 = a small arithmetic program). The Switch output is the chosen
    // program text that gets assembled → ROM, so the Switch demonstrates a
    // meaningful choice ("which program do we burn?").
    { id: 'prog', type: 'input', position: { x: 0, y: 40 },
      data: { label: 'fibonacci', value: ASM_ROM_PROGRAM, dataType: 'string', widgetType: 'textarea', description: 'ARPU assembly (case 0)' } },
    { id: 'c-prog-counter', type: 'constant', position: { x: 0, y: 220 },
      data: { label: 'counter loop', dataType: 'string', value: ASM_ROM_COUNTER } },
    { id: 'c-prog-arith', type: 'constant', position: { x: 0, y: 320 },
      data: { label: 'arithmetic', dataType: 'string', value: ASM_ROM_ARITH } },
    { id: 'c-prog-sel', type: 'constant', position: { x: 0, y: 420 },
      data: { label: 'program selector', dataType: 'number', value: 0 } },
    { id: 'sw-prog', type: 'switch', position: { x: 300, y: 180 },
      data: { label: 'which program', caseCount: 3 } },
    { id: 'asm', type: 'code', position: { x: 580, y: 40 },
      data: { label: 'ARPU Assembler', ...ASM_ROM('arpu-assembler') } },
    { id: 'bytes-tap', type: 'inspect', position: { x: 580, y: 300 },
      data: { label: 'peek bytes' } },
    { id: 'reroute', type: 'reroute', position: { x: 1120, y: 150 },
      data: { label: 'bytes' } },

    // ── Config ───────────────────────────────────────────────────────────────
    { id: 'c-base16', type: 'constant', position: { x: 0, y: 640 },
      data: { label: 'base 16 (hex)', dataType: 'number', value: 16 } },
    { id: 'c-base2', type: 'constant', position: { x: 0, y: 740 },
      data: { label: 'base 2 (binary)', dataType: 'number', value: 2 } },
    { id: 'c-sel', type: 'constant', position: { x: 0, y: 840 },
      data: { label: 'selector', dataType: 'number', value: 0 } },
    { id: 'sw-base', type: 'switch', position: { x: 280, y: 700 },
      data: { label: 'ROM base', caseCount: 2 } },
    { id: 'c-bitwidth', type: 'constant', position: { x: 0, y: 940 },
      data: { label: 'bitWidth', dataType: 'number', value: 8 } },
    { id: 'c-rowwidth', type: 'constant', position: { x: 0, y: 1040 },
      data: { label: 'rowWidth', dataType: 'number', value: 16 } },
    { id: 'bundle', type: 'bundle', position: { x: 560, y: 760 },
      data: { label: 'config', bundleFields: [{ name: 'base' }, { name: 'bitWidth' }, { name: 'rowWidth' }] } },

    // ── Per-byte ─────────────────────────────────────────────────────────────
    { id: 'map-hex', type: 'map', position: { x: 1640, y: 60 },
      data: {
        label: 'hex each byte',
        subgraph: {
          nodes: [
            { id: 'mh-body', type: 'code', position: { x: 0, y: 0 },
              data: { label: 'Hex', code: ASM_ROM_HEX_SOURCE, contract: ASM_ROM_HEX_CONTRACT } },
          ],
          edges: [],
        },
        bodyInputs: [
          { name: 'item', internalNodeId: 'mh-body', internalHandle: 'item', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
        ],
        bodyOutputs: [
          { name: 'result', internalNodeId: 'mh-body', internalHandle: 'result', externalNodeId: '', externalHandle: null, type: { kind: 'string' } },
        ],
        resultPort: 'result',
      } },
    { id: 'hex-inspect', type: 'inspect', position: { x: 1920, y: 60 },
      data: { label: 'peek hex' } },
    { id: 'hex-out', type: 'output', position: { x: 1920, y: 200 },
      data: { label: 'hexBytes' } },

    // ── ROM (Group) ──────────────────────────────────────────────────────────
    { id: 'rom-group', type: 'group', position: { x: 1300, y: 700 },
      data: {
        label: 'ROM Layout',
        subgraph: {
          nodes: [
            { id: 'rg-unbundle', type: 'unbundle', position: { x: 0, y: 80 },
              data: { label: 'config', bundleFields: [{ name: 'base' }, { name: 'bitWidth' }, { name: 'rowWidth' }] } },
            { id: 'rg-romdata', type: 'code', position: { x: 280, y: 0 },
              data: { label: 'ROM Data', ...ASM_ROM('rom-data') } },
            { id: 'rg-romsch', type: 'code', position: { x: 280, y: 220 },
              data: { label: 'ROM Schematic', ...ASM_ROM('rom-schematic') } },
          ],
          edges: [
            // base drives the digit string; bitWidth sizes the schematic cells.
            { id: 'rg-e-base', source: 'rg-unbundle', target: 'rg-romdata', sourceHandle: 'base', targetHandle: 'base' },
            { id: 'rg-e-bw', source: 'rg-unbundle', target: 'rg-romsch', sourceHandle: 'bitWidth', targetHandle: 'bitWidth' },
          ],
        },
        groupInputs: [
          { name: 'bytes', internalNodeId: 'rg-romdata', internalHandle: 'bytes', externalNodeId: 'reroute', externalHandle: 'bytes', type: { kind: 'list', of: { kind: 'number' } } },
          { name: 'bytesSch', internalNodeId: 'rg-romsch', internalHandle: 'bytes', externalNodeId: 'reroute', externalHandle: 'bytes', type: { kind: 'list', of: { kind: 'number' } } },
          { name: 'config', internalNodeId: 'rg-unbundle', internalHandle: 'input', externalNodeId: 'bundle', externalHandle: 'output', type: ROM_CONFIG_TYPE },
        ],
        groupOutputs: [
          { name: 'data', internalNodeId: 'rg-romdata', internalHandle: 'data', externalNodeId: 'data-inspect', externalHandle: 'input', type: { kind: 'string' } },
          { name: 'rom', internalNodeId: 'rg-romsch', internalHandle: 'rom', externalNodeId: 'preview-out', externalHandle: 'input', type: { kind: 'schematic' } },
        ],
      } },
    { id: 'data-inspect', type: 'inspect', position: { x: 1640, y: 720 },
      data: { label: 'peek digits' } },
    { id: 'rom-view', type: 'viewer', position: { x: 1900, y: 860 },
      data: { label: 'ROM preview', isResizable: true } },
    { id: 'data-out', type: 'output', position: { x: 1900, y: 700 },
      data: { label: 'romData' } },
    { id: 'preview-out', type: 'output', position: { x: 1900, y: 1080 },
      data: { label: 'romPreview' } },
  ],
  edges: [
    // Source — program selector Switch picks one of three ARPU programs.
    { id: 'sx-psel', source: 'c-prog-sel', target: 'sw-prog', sourceHandle: 'output', targetHandle: 'selector' },
    { id: 'sx-p0', source: 'prog', target: 'sw-prog', sourceHandle: 'output', targetHandle: 'case0' },
    { id: 'sx-p1', source: 'c-prog-counter', target: 'sw-prog', sourceHandle: 'output', targetHandle: 'case1' },
    { id: 'sx-p2', source: 'c-prog-arith', target: 'sw-prog', sourceHandle: 'output', targetHandle: 'case2' },
    { id: 'sx-pdef', source: 'prog', target: 'sw-prog', sourceHandle: 'output', targetHandle: 'default' },
    { id: 'sx-prog', source: 'sw-prog', target: 'asm', sourceHandle: 'output', targetHandle: 'program' },
    { id: 'sx-tap', source: 'asm', target: 'bytes-tap', sourceHandle: 'bytes', targetHandle: 'input' },
    // Reroute the bytes bus. NOTE: passthrough nodes (reroute/inspect) render a
    // single `output` handle — edges LEAVING them must use sourceHandle 'output'
    // (the compiler still resolves transparently to the upstream value).
    { id: 'sx-rr', source: 'asm', target: 'reroute', sourceHandle: 'bytes', targetHandle: 'input' },

    // Config → Switch → Bundle
    { id: 'cf-sel', source: 'c-sel', target: 'sw-base', sourceHandle: 'output', targetHandle: 'selector' },
    { id: 'cf-c0', source: 'c-base16', target: 'sw-base', sourceHandle: 'output', targetHandle: 'case0' },
    { id: 'cf-c1', source: 'c-base2', target: 'sw-base', sourceHandle: 'output', targetHandle: 'case1' },
    { id: 'cf-def', source: 'c-base16', target: 'sw-base', sourceHandle: 'output', targetHandle: 'default' },
    { id: 'cf-base', source: 'sw-base', target: 'bundle', sourceHandle: 'output', targetHandle: 'base' },
    { id: 'cf-bw', source: 'c-bitwidth', target: 'bundle', sourceHandle: 'output', targetHandle: 'bitWidth' },
    { id: 'cf-rw', source: 'c-rowwidth', target: 'bundle', sourceHandle: 'output', targetHandle: 'rowWidth' },

    // Per-byte Map
    { id: 'pb-map', source: 'reroute', target: 'map-hex', sourceHandle: 'output', targetHandle: 'list' },
    { id: 'pb-insp', source: 'map-hex', target: 'hex-inspect', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'pb-out', source: 'map-hex', target: 'hex-out', sourceHandle: 'output', targetHandle: 'input' },

    // ROM Group
    { id: 'rm-bytes', source: 'reroute', target: 'rom-group', sourceHandle: 'output', targetHandle: 'bytes' },
    { id: 'rm-bytes2', source: 'reroute', target: 'rom-group', sourceHandle: 'output', targetHandle: 'bytesSch' },
    { id: 'rm-config', source: 'bundle', target: 'rom-group', sourceHandle: 'output', targetHandle: 'config' },
    { id: 'rm-data-insp', source: 'rom-group', target: 'data-inspect', sourceHandle: 'data', targetHandle: 'input' },
    { id: 'rm-data-out', source: 'data-inspect', target: 'data-out', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'rm-prev', source: 'rom-group', target: 'rom-view', sourceHandle: 'rom', targetHandle: 'input' },
    { id: 'rm-prev-out', source: 'rom-group', target: 'preview-out', sourceHandle: 'rom', targetHandle: 'input' },
  ],
};

// ─── Mandelbrot ─────────────────────────────────────────────────────────────
// Escape-time Mandelbrot rendered as a FLAT (1 block tall) concrete pixel wall.
// You pick the iteration count, the complex-plane window (reMin/reMax/imMin/
// imMax) and the output resolution (width × height in blocks). Each block is one
// pixel: black = inside the set, a cool→warm concrete gradient = escape speed.
export const MANDELBROT_SOURCE = `type Inputs = {
  iterations: Slider<{ min: 16; max: 256; default: 80 }>;
  reMin: number;
  reMax: number;
  imMin: number;
  imMax: number;
  width: Slider<{ min: 16; max: 256; default: 128 }>;
  height: Slider<{ min: 16; max: 192; default: 96 }>;
};

type Outputs = {
  schematic: Schematic;
  preview: Image;
};

// Cool -> warm concrete by escape speed; black = the set interior.
const GRADIENT = [
  'minecraft:blue_concrete',
  'minecraft:cyan_concrete',
  'minecraft:light_blue_concrete',
  'minecraft:lime_concrete',
  'minecraft:yellow_concrete',
  'minecraft:orange_concrete',
  'minecraft:red_concrete',
  'minecraft:white_concrete',
];

function generate(inputs) {
  const maxIter = (inputs.iterations | 0) || 80;
  const W = Math.max(1, inputs.width | 0);
  const H = Math.max(1, inputs.height | 0);
  // Plane window — defaults frame the whole set if an input is missing.
  const reMin = inputs.reMin ?? -2.5;
  const reMax = inputs.reMax ?? 1.0;
  const imMin = inputs.imMin ?? -1.25;
  const imMax = inputs.imMax ?? 1.25;

  const schem = new Schematic();
  const field = [];
  let anyEscaped = false;

  for (let pz = 0; pz < H; pz++) {
    if (pz % 8 === 0) Progress.report((pz / H) * 100, 'mandelbrot row ' + pz + '/' + H);
    const rowField = [];
    // Flip the imaginary axis so +im is at the top (pz = 0).
    const cIm = imMax - (H > 1 ? pz / (H - 1) : 0.5) * (imMax - imMin);
    for (let px = 0; px < W; px++) {
      const cRe = reMin + (W > 1 ? px / (W - 1) : 0.5) * (reMax - reMin);
      let zx = 0, zy = 0, it = 0;
      while (zx * zx + zy * zy <= 4 && it < maxIter) {
        const xt = zx * zx - zy * zy + cRe;
        zy = 2 * zx * zy + cIm;
        zx = xt;
        it++;
      }
      let block;
      let t;
      if (it >= maxIter) {
        block = 'minecraft:black_concrete';
        t = 0; // interior -> dark in the preview
      } else {
        anyEscaped = true;
        t = it / maxIter;
        block = GRADIENT[Math.min(GRADIENT.length - 1, Math.floor(t * GRADIENT.length))];
      }
      schem.set_block(px, 0, pz, block); // flat: single y = 0 plane
      rowField.push(t);
    }
    field.push(rowField);
  }

  // A single-palette schematic trips a divide-by-zero in nucleation's region
  // packing (same guard as the Julia tile) — vary one block when all interior.
  if (!anyEscaped) {
    schem.set_block(0, 0, 0, 'minecraft:gray_concrete');
  }

  return { schematic: schem, preview: Image.fromField(field, 'magma') };
}
`;

const MANDELBROT_CONTRACT: BlockContract = {
  inputs: {
    iterations: { kind: 'number', widget: 'slider', min: 16, max: 256, default: 80 },
    // Plain `number` annotations in the source carry no default (the input nodes
    // supply the values); keep these bare so the embedded contract matches what
    // the parser derives — see exampleFlows.test.ts.
    reMin: { kind: 'number' },
    reMax: { kind: 'number' },
    imMin: { kind: 'number' },
    imMax: { kind: 'number' },
    width: { kind: 'number', widget: 'slider', min: 16, max: 256, default: 128 },
    height: { kind: 'number', widget: 'slider', min: 16, max: 192, default: 96 },
  },
  outputs: {
    schematic: { kind: 'schematic' },
    preview: { kind: 'image' },
  },
};

const MB_IN = (
  id: string,
  label: string,
  value: number,
  y: number,
  extra: Record<string, unknown> = {}
): FlowData['nodes'][number] => ({
  id,
  type: 'input',
  position: { x: 0, y },
  data: { label, value, dataType: 'number', widgetType: 'number', ...extra },
});

export const MANDELBROT_FLOW: FlowData = {
  id: 'example-mandelbrot',
  name: 'Mandelbrot',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    MB_IN('m-iter', 'iterations', 80, 0, { widgetType: 'slider', min: 16, max: 256 }),
    MB_IN('m-remin', 'reMin', -2.5, 110, { step: 0.05 }),
    MB_IN('m-remax', 'reMax', 1.0, 190, { step: 0.05 }),
    MB_IN('m-immin', 'imMin', -1.25, 270, { step: 0.05 }),
    MB_IN('m-immax', 'imMax', 1.25, 350, { step: 0.05 }),
    MB_IN('m-width', 'width', 128, 430, { widgetType: 'slider', min: 16, max: 256 }),
    MB_IN('m-height', 'height', 96, 540, { widgetType: 'slider', min: 16, max: 192 }),
    {
      id: 'm-gen',
      type: 'code',
      position: { x: 360, y: 180 },
      data: {
        label: 'Mandelbrot',
        code: MANDELBROT_SOURCE,
        contract: MANDELBROT_CONTRACT,
        io: contractToIO(MANDELBROT_CONTRACT),
      },
    },
    {
      id: 'm-preview',
      type: 'viewer',
      position: { x: 820, y: 60 },
      data: { label: 'Preview (magma)', isResizable: true },
    },
    {
      id: 'm-out',
      type: 'output',
      position: { x: 820, y: 420 },
      data: { label: 'mandelbrot' },
    },
  ],
  edges: [
    { id: 'me-iter', source: 'm-iter', target: 'm-gen', sourceHandle: 'output', targetHandle: 'iterations' },
    { id: 'me-remin', source: 'm-remin', target: 'm-gen', sourceHandle: 'output', targetHandle: 'reMin' },
    { id: 'me-remax', source: 'm-remax', target: 'm-gen', sourceHandle: 'output', targetHandle: 'reMax' },
    { id: 'me-immin', source: 'm-immin', target: 'm-gen', sourceHandle: 'output', targetHandle: 'imMin' },
    { id: 'me-immax', source: 'm-immax', target: 'm-gen', sourceHandle: 'output', targetHandle: 'imMax' },
    { id: 'me-width', source: 'm-width', target: 'm-gen', sourceHandle: 'output', targetHandle: 'width' },
    { id: 'me-height', source: 'm-height', target: 'm-gen', sourceHandle: 'output', targetHandle: 'height' },
    { id: 'me-prev', source: 'm-gen', target: 'm-preview', sourceHandle: 'preview', targetHandle: 'input' },
    { id: 'me-out', source: 'm-gen', target: 'm-out', sourceHandle: 'schematic', targetHandle: 'input' },
  ],
};

// ─── Carbon 1.1 ─────────────────────────────────────────────────────────────
// Build a program for tony-ist's Carbon 1.1 (8-bit ACC-based redstone CPU): a
// selector picks one of three real Carbon programs, the Carbon assembler turns
// it into machine-code bytes (byte-exact vs the Rust reference), and the bytes
// drive a ROM schematic. The case-0 program is an editable textarea.
const CARBON_COUNTER = `LIM R1 0       // counter = 0
.loop
RLD R1         // acc = counter
PST $0         // emit on port 0
INC R1         // counter++
BRC JMP .loop  // forever`;

const CARBON_LINE = `LIM R3 0       // X
PLD $0
RST R1         // slope
PLD $1
RST R2         // y-intercept
.loop
RLD R1
RST R4
.inner
RLD R2
PST $6         // port Y
INC R2
DEC R4
BRC NEQ .inner
INC R3
RLD R3
PST $7         // port X
BRC JMP .loop`;

const CARBON_MATH = `LIM R0 7
RST R1         // R1 = 7
LIM R0 5       // acc = 5
CMP R1         // flags = acc - R1
BRC GT .bigger
LIM R0 0
PST $1
HLT
.bigger
LIM R0 255
PST $1`;

export const CARBON_FLOW: FlowData = {
  id: 'example-carbon',
  name: 'Carbon 1.1 ASM → ROM',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    { id: 'cb-prog', type: 'input', position: { x: 0, y: 40 },
      data: { label: 'fibonacci', value: CARBON_FIB, dataType: 'string', widgetType: 'textarea', description: 'Carbon assembly (case 0) — the simple validator' } },
    { id: 'cb-counter', type: 'constant', position: { x: 0, y: 300 },
      data: { label: 'counter', dataType: 'string', value: CARBON_COUNTER } },
    { id: 'cb-math', type: 'constant', position: { x: 0, y: 380 },
      data: { label: 'compare', dataType: 'string', value: CARBON_MATH } },
    { id: 'cb-line', type: 'constant', position: { x: 0, y: 460 },
      data: { label: 'line / slope', dataType: 'string', value: CARBON_LINE } },
    { id: 'cb-mandel', type: 'constant', position: { x: 0, y: 540 },
      data: { label: 'mandelbrot (BatPU-2 port)', dataType: 'string', value: CARBON_MANDEL } },
    { id: 'cb-sel', type: 'constant', position: { x: 0, y: 620 },
      data: { label: 'program selector', dataType: 'number', value: 0 } },
    { id: 'cb-switch', type: 'switch', position: { x: 320, y: 240 },
      data: { label: 'which program', caseCount: 5 } },
    { id: 'cb-asm', type: 'code', position: { x: 620, y: 60 },
      data: { label: 'Carbon 1.1 Assembler', ...ASM_ROM('carbon-assembler') } },
    { id: 'cb-hex', type: 'viewer', position: { x: 960, y: 40 },
      data: { label: 'hex', isResizable: true } },
    { id: 'cb-bytes', type: 'inspect', position: { x: 960, y: 320 },
      data: { label: 'peek bytes' } },
    { id: 'cb-rom', type: 'code', position: { x: 1240, y: 220 },
      data: { label: 'Carbon ROM', ...ASM_ROM('carbon-rom') } },
    { id: 'cb-romview', type: 'viewer', position: { x: 1560, y: 80 },
      data: { label: 'ROM preview', isResizable: true } },
    { id: 'cb-out', type: 'output', position: { x: 1560, y: 420 },
      data: { label: 'carbonRom' } },
  ],
  edges: [
    { id: 'cbe-sel', source: 'cb-sel', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'selector' },
    { id: 'cbe-c0', source: 'cb-prog', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'case0' },
    { id: 'cbe-c1', source: 'cb-counter', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'case1' },
    { id: 'cbe-c2', source: 'cb-math', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'case2' },
    { id: 'cbe-c3', source: 'cb-line', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'case3' },
    { id: 'cbe-c4', source: 'cb-mandel', target: 'cb-switch', sourceHandle: 'output', targetHandle: 'case4' },
    { id: 'cbe-prog', source: 'cb-switch', target: 'cb-asm', sourceHandle: 'output', targetHandle: 'program' },
    { id: 'cbe-hex', source: 'cb-asm', target: 'cb-hex', sourceHandle: 'hex', targetHandle: 'input' },
    { id: 'cbe-bytes', source: 'cb-asm', target: 'cb-bytes', sourceHandle: 'bytes', targetHandle: 'input' },
    { id: 'cbe-rom', source: 'cb-asm', target: 'cb-rom', sourceHandle: 'bytes', targetHandle: 'bytes' },
    { id: 'cbe-romview', source: 'cb-rom', target: 'cb-romview', sourceHandle: 'rom', targetHandle: 'input' },
    { id: 'cbe-out', source: 'cb-rom', target: 'cb-out', sourceHandle: 'rom', targetHandle: 'input' },
  ],
};

export const EXAMPLE_FLOWS: FlowData[] = [JULIA_STITCH_FLOW, WORLDGEN_FLOW, SHOWCASE_FLOW, MANDELBROT_FLOW, CARBON_FLOW];
