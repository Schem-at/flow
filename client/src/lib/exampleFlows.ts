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
    { id: 'fr-source', type: 'frame', position: { x: -40, y: -60 },
      data: { label: 'Source — Switch picks a program, then assemble it', width: 980, height: 300, color: 'indigo', zIndex: -1 } },
    { id: 'fr-config', type: 'frame', position: { x: -40, y: 260 },
      data: { label: 'Config — Switch + Bundle a settings struct', width: 760, height: 360, color: 'emerald', zIndex: -1 } },
    { id: 'fr-perbyte', type: 'frame', position: { x: 800, y: -60 },
      data: { label: 'Per-byte — Map each byte to hex', width: 520, height: 280, color: 'sky', zIndex: -1 } },
    { id: 'fr-rom', type: 'frame', position: { x: 800, y: 260 },
      data: { label: 'ROM — Group: Unbundle → rom-data + rom-schematic', width: 980, height: 360, color: 'amber', zIndex: -1 } },

    // ── Comments (sticky notes) ──────────────────────────────────────────────
    { id: 'cm-source', type: 'comment', position: { x: 560, y: 160 },
      data: { label: 'Selector → Switch picks fibonacci / counter / arithmetic → assembler → bytes. Inspect taps the bus.', width: 340, height: 70, zIndex: 1 } },
    { id: 'cm-switch', type: 'comment', position: { x: 220, y: 540 },
      data: { label: 'Switch picks hex (base 16) vs binary (base 2) ROM by selector.', width: 320, height: 70, zIndex: 1 } },

    // ── Source ───────────────────────────────────────────────────────────────
    // Program selector: a number constant (0..2) drives a Switch that picks ONE
    // of three ARPU programs (case0 = the verified fibonacci, case1 = a counter
    // loop, case2 = a small arithmetic program). The Switch output is the chosen
    // program text that gets assembled → ROM, so the Switch demonstrates a
    // meaningful choice ("which program do we burn?").
    { id: 'prog', type: 'input', position: { x: 0, y: 40 },
      data: { label: 'fibonacci', value: ASM_ROM_PROGRAM, dataType: 'string', widgetType: 'textarea', description: 'ARPU assembly (case 0)' } },
    { id: 'c-prog-counter', type: 'constant', position: { x: 0, y: 70 },
      data: { label: 'counter loop', dataType: 'string', value: ASM_ROM_COUNTER } },
    { id: 'c-prog-arith', type: 'constant', position: { x: 0, y: 100 },
      data: { label: 'arithmetic', dataType: 'string', value: ASM_ROM_ARITH } },
    { id: 'c-prog-sel', type: 'constant', position: { x: 0, y: 130 },
      data: { label: 'program selector', dataType: 'number', value: 0 } },
    { id: 'sw-prog', type: 'switch', position: { x: 300, y: 40 },
      data: { label: 'which program', caseCount: 3 } },
    { id: 'asm', type: 'code', position: { x: 560, y: 40 },
      data: { label: 'ARPU Assembler', ...ASM_ROM('arpu-assembler') } },
    { id: 'bytes-tap', type: 'inspect', position: { x: 560, y: 230 },
      data: { label: 'peek bytes' } },
    { id: 'reroute', type: 'reroute', position: { x: 900, y: 70 },
      data: { label: 'bytes' } },

    // ── Config ───────────────────────────────────────────────────────────────
    { id: 'c-base16', type: 'constant', position: { x: 0, y: 300 },
      data: { label: 'base 16 (hex)', dataType: 'number', value: 16 } },
    { id: 'c-base2', type: 'constant', position: { x: 0, y: 370 },
      data: { label: 'base 2 (binary)', dataType: 'number', value: 2 } },
    { id: 'c-sel', type: 'constant', position: { x: 0, y: 440 },
      data: { label: 'selector', dataType: 'number', value: 0 } },
    { id: 'sw-base', type: 'switch', position: { x: 260, y: 370 },
      data: { label: 'ROM base', caseCount: 2 } },
    { id: 'c-bitwidth', type: 'constant', position: { x: 0, y: 510 },
      data: { label: 'bitWidth', dataType: 'number', value: 8 } },
    { id: 'c-rowwidth', type: 'constant', position: { x: 0, y: 580 },
      data: { label: 'rowWidth', dataType: 'number', value: 16 } },
    { id: 'bundle', type: 'bundle', position: { x: 500, y: 420 },
      data: { label: 'config', bundleFields: [{ name: 'base' }, { name: 'bitWidth' }, { name: 'rowWidth' }] } },

    // ── Per-byte ─────────────────────────────────────────────────────────────
    { id: 'map-hex', type: 'map', position: { x: 880, y: 40 },
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
    { id: 'hex-inspect', type: 'inspect', position: { x: 1140, y: 40 },
      data: { label: 'peek hex' } },
    { id: 'hex-out', type: 'output', position: { x: 1140, y: 160 },
      data: { label: 'hexBytes' } },

    // ── ROM (Group) ──────────────────────────────────────────────────────────
    { id: 'rom-group', type: 'group', position: { x: 880, y: 330 },
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
    { id: 'data-inspect', type: 'inspect', position: { x: 1340, y: 360 },
      data: { label: 'peek digits' } },
    { id: 'rom-view', type: 'viewer', position: { x: 1560, y: 420 },
      data: { label: 'ROM preview', isResizable: true } },
    { id: 'data-out', type: 'output', position: { x: 1560, y: 360 },
      data: { label: 'romData' } },
    { id: 'preview-out', type: 'output', position: { x: 1560, y: 540 },
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
    // Reroute the bytes bus (transparent: outgoing edges keep the `bytes` handle).
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
    { id: 'pb-map', source: 'reroute', target: 'map-hex', sourceHandle: 'bytes', targetHandle: 'list' },
    { id: 'pb-insp', source: 'map-hex', target: 'hex-inspect', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'pb-out', source: 'map-hex', target: 'hex-out', sourceHandle: 'output', targetHandle: 'input' },

    // ROM Group
    { id: 'rm-bytes', source: 'reroute', target: 'rom-group', sourceHandle: 'bytes', targetHandle: 'bytes' },
    { id: 'rm-bytes2', source: 'reroute', target: 'rom-group', sourceHandle: 'bytes', targetHandle: 'bytesSch' },
    { id: 'rm-config', source: 'bundle', target: 'rom-group', sourceHandle: 'output', targetHandle: 'config' },
    { id: 'rm-data-insp', source: 'rom-group', target: 'data-inspect', sourceHandle: 'data', targetHandle: 'input' },
    { id: 'rm-data-out', source: 'data-inspect', target: 'data-out', sourceHandle: 'data', targetHandle: 'input' },
    { id: 'rm-prev', source: 'rom-group', target: 'rom-view', sourceHandle: 'rom', targetHandle: 'input' },
    { id: 'rm-prev-out', source: 'rom-group', target: 'preview-out', sourceHandle: 'rom', targetHandle: 'input' },
  ],
};

export const EXAMPLE_FLOWS: FlowData[] = [JULIA_STITCH_FLOW, WORLDGEN_FLOW, SHOWCASE_FLOW];
