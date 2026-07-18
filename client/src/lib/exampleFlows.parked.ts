/**
 * PARKED example FLOWS — the ASM → ROM Studio and Carbon 1.1 showcases, shelved
 * out of the live EXAMPLE_FLOWS so users don't see them while assembler work is
 * on hold. Kept verbatim for later; NOT imported by the running app.
 */

import type { FlowData, BlockContract } from '@flow/core';
import { PARKED_EXAMPLE_BLOCKS, PARKED_EXAMPLE_BLOCK_CONTRACTS } from './block/examples.parked';
import { contractToIO } from './block/io-compat';
import CARBON_FIB from './asm/__fixtures__/carbon/fibonacci.s?raw';
import CARBON_MANDEL from './asm/__fixtures__/carbon/mandelbrot.s?raw';

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
  code: PARKED_EXAMPLE_BLOCKS.find((b) => b.id === id)!.source,
  contract: PARKED_EXAMPLE_BLOCK_CONTRACTS[id],
  io: contractToIO(PARKED_EXAMPLE_BLOCK_CONTRACTS[id]),
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

export const PARKED_EXAMPLE_FLOWS: FlowData[] = [SHOWCASE_FLOW, CARBON_FLOW];
