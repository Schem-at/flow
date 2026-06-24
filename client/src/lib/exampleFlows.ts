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
    // Meta-nodes: peek the tile grid and keep the bus tidy on its way to stitch.
    { id: 'tiles-tap', type: 'inspect', position: { x: 600, y: 60 }, data: { label: 'peek tiles' } },
    { id: 'tiles-rr', type: 'reroute', position: { x: 600, y: 180 }, data: { label: 'tiles' } },
  ],
  edges: [
    {
      id: 'e-cols',
      source: 'cols-input',
      target: 'julia-gen',
      sourceHandle: 'output',
      targetHandle: 'cols',
    },
    // grid → inspect → reroute → stitch (inspect/reroute fold transparently)
    { id: 'e-tiles-tap', source: 'julia-gen', target: 'tiles-tap', sourceHandle: 'tiles', targetHandle: 'input' },
    { id: 'e-tap-rr', source: 'tiles-tap', target: 'tiles-rr', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e-rr-stitch', source: 'tiles-rr', target: 'stitcher', sourceHandle: 'output', targetHandle: 'tiles' },
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
    // Meta-nodes: pack the elevation-noise params into one "noiseCfg" bus, unpack
    // it back into the noise node, and tap the scale field — purely for clarity.
    { id: 'wg-elev-bundle', type: 'bundle', position: { x: -120, y: -240 },
      data: { label: 'noiseCfg', bundleFields: [{ name: 'size' }, { name: 'scale' }, { name: 'octaves' }] } },
    { id: 'wg-elev-unbundle', type: 'unbundle', position: { x: 100, y: -240 },
      data: { label: 'noiseCfg', bundleFields: [{ name: 'size' }, { name: 'scale' }, { name: 'octaves' }] } },
    { id: 'wg-elev-tap', type: 'inspect', position: { x: 180, y: -160 }, data: { label: 'peek scale' } },
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
    // Elevation-noise params routed through Bundle → Unbundle (+ an Inspect on scale).
    { id: 'wg-eb-size', source: 'wg-size', target: 'wg-elev-bundle', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-eb-scale', source: 'wg-elev-scale', target: 'wg-elev-bundle', sourceHandle: 'output', targetHandle: 'scale' },
    { id: 'wg-eb-oct', source: 'wg-elev-octaves', target: 'wg-elev-bundle', sourceHandle: 'output', targetHandle: 'octaves' },
    { id: 'wg-eb-bun', source: 'wg-elev-bundle', target: 'wg-elev-unbundle', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'wg-eu-size', source: 'wg-elev-unbundle', target: 'wg-perlin', sourceHandle: 'size', targetHandle: 'size' },
    { id: 'wg-eu-scale-tap', source: 'wg-elev-unbundle', target: 'wg-elev-tap', sourceHandle: 'scale', targetHandle: 'input' },
    { id: 'wg-eu-tap-perlin', source: 'wg-elev-tap', target: 'wg-perlin', sourceHandle: 'output', targetHandle: 'scale' },
    { id: 'wg-eu-oct', source: 'wg-elev-unbundle', target: 'wg-perlin', sourceHandle: 'octaves', targetHandle: 'octaves' },
    { id: 'wg-i2', source: 'wg-size', target: 'wg-voronoi', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-i3', source: 'wg-size', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'wg-i6', source: 'wg-cells', target: 'wg-voronoi', sourceHandle: 'output', targetHandle: 'cells' },
    { id: 'wg-i7', source: 'wg-moist-scale', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'scale' },
    { id: 'wg-i8', source: 'wg-moist-octaves', target: 'wg-moisture', sourceHandle: 'output', targetHandle: 'octaves' },
    { id: 'wg-i9', source: 'wg-strength', target: 'wg-combine', sourceHandle: 'output', targetHandle: 'strength' },
    { id: 'wg-i10', source: 'wg-exponent', target: 'wg-shape', sourceHandle: 'output', targetHandle: 'exponent' },
    { id: 'wg-i11', source: 'wg-terraces', target: 'wg-shape', sourceHandle: 'output', targetHandle: 'terraces' },
    { id: 'wg-i12', source: 'wg-amplitude', target: 'wg-build', sourceHandle: 'output', targetHandle: 'amplitude' },
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

// ── ROM Generator ────────────────────────────────────────────────────────────
// Full port of schematic-api roms.py "Basic ROM Generator". Lays a base-N digit
// string out as a Minecraft ROM via the live Rom.layoutData endowment (the
// ISA-agnostic port of roms.py's spatial math). Each placement role maps to a
// block: data → comparator barrel at signal = digit value, zero → solid block,
// fifteen → redstone block, invalid → sponge.
export const ROM_BUILD_SOURCE = `type Inputs = {
  data: string;
  sourceBase: Slider<{ min: 2; max: 64; default: 16 }>;
  targetBase: Slider<{ min: 2; max: 16; default: 16 }>;
  bitWidth: Slider<{ min: 1; max: 64; default: 2 }>;
  wordsPerRow: Slider<{ min: 1; max: 64; default: 8 }>;
  xOffsets: number[];
  yOffsets: number[];
  zOffsets: number[];
  xStagger: string;
  zStagger: string;
  staggerIntersectionMode: string;
  invertWord: boolean;
  solidBlockOn0: boolean;
  solidBlock: Block<{ default: 'minecraft:red_concrete' }>;
  redstoneBlockOn15: boolean;
};
type Outputs = { rom: Schematic };

function generate(inputs) {
  // Convert the data from sourceBase (compact input, up to 64) to targetBase
  // (<= 16, so every digit fits one comparator barrel: signal 0..15). The data
  // is treated as one number, so leading zeros aren't preserved. Digits use
  // 0-9 a-z A-Z + / (so a single char can address up to base 64).
  const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const sourceBase = Math.max(2, Math.min(64, inputs.sourceBase | 0));
  const targetBase = Math.max(2, Math.min(16, inputs.targetBase | 0));
  const raw = String(inputs.data).replace(/\\s+/g, '');
  let digitStr;
  if (sourceBase === targetBase) {
    digitStr = raw.toLowerCase();
  } else {
    let v = 0n;
    const sb = BigInt(sourceBase);
    for (const ch of raw) {
      const d = ALPHA.indexOf(ch);
      if (d < 0 || d >= sourceBase) continue; // skip whitespace / invalid digits
      v = v * sb + BigInt(d);
    }
    if (v === 0n) {
      digitStr = '0';
    } else {
      const tb = BigInt(targetBase);
      let out = '';
      while (v > 0n) { out = ALPHA[Number(v % tb)] + out; v = v / tb; }
      digitStr = out;
    }
  }

  // The ROM is sized by the (converted) DATA, not a fixed word count: it wraps
  // at \`wordsPerRow\` words per X row, then rolls over down Z for as many rows
  // as the data needs.
  const bitWidth = Math.max(1, inputs.bitWidth);
  const wordsPerRow = Math.max(1, inputs.wordsPerRow);
  const words = Math.max(1, Math.ceil(digitStr.length / bitWidth));
  const cfg = {
    base: targetBase,
    bitWidth: bitWidth,
    xWordCount: wordsPerRow,
    zWordCount: Math.max(1, Math.ceil(words / wordsPerRow)),
    xOffsets: inputs.xOffsets,
    yOffsets: inputs.yOffsets,
    zOffsets: inputs.zOffsets,
    xStagger: inputs.xStagger,
    zStagger: inputs.zStagger,
    staggerIntersectionMode: inputs.staggerIntersectionMode,
    invertWord: inputs.invertWord,
    solidBlockOn0: inputs.solidBlockOn0,
    redstoneBlockOn15: inputs.redstoneBlockOn15,
  };
  const placements = Rom.layoutData(digitStr, cfg);
  const rom = new Schematic();
  for (const p of placements) {
    const block =
      p.role === 'invalid' ? 'minecraft:sponge' :
      p.role === 'zero'    ? inputs.solidBlock :
      p.role === 'fifteen' ? 'minecraft:redstone_block' :
      'minecraft:barrel[facing=up]{signal=' + p.value + '}';
    rom.set_block(p.x, p.y, p.z, block);
  }
  return { rom };
}
`;

// Derived from parseBlockSource(ROM_BUILD_SOURCE) — kept in sync by the
// "ROM build block" test (embedded contract must equal the parser's output).
export const ROM_BUILD_CONTRACT: BlockContract = {
  inputs: {
    data: { kind: 'string' },
    sourceBase: { kind: 'number', widget: 'slider', min: 2, max: 64, default: 16 },
    targetBase: { kind: 'number', widget: 'slider', min: 2, max: 16, default: 16 },
    bitWidth: { kind: 'number', widget: 'slider', min: 1, max: 64, default: 2 },
    wordsPerRow: { kind: 'number', widget: 'slider', min: 1, max: 64, default: 8 },
    xOffsets: { kind: 'list', of: { kind: 'number' } },
    yOffsets: { kind: 'list', of: { kind: 'number' } },
    zOffsets: { kind: 'list', of: { kind: 'number' } },
    xStagger: { kind: 'string' },
    zStagger: { kind: 'string' },
    staggerIntersectionMode: { kind: 'string' },
    invertWord: { kind: 'boolean' },
    solidBlockOn0: { kind: 'boolean' },
    solidBlock: { kind: 'block', default: 'minecraft:red_concrete' },
    redstoneBlockOn15: { kind: 'boolean' },
  },
  outputs: {
    rom: { kind: 'schematic' },
  },
};

// Scalar parameters, edited densely in ONE Form node and bundled into a single
// `params` object that feeds the reusable generator group. (Offset lists are
// kept as separate list constants — the Form widget has no list field.)
const ROM_FORM_FIELDS = [
  { name: 'data', dataType: 'string', widgetType: 'textarea', value: '0123456789abcdef' },
  { name: 'sourceBase', label: 'source base', dataType: 'number', widgetType: 'slider', min: 2, max: 64, value: 16 },
  { name: 'targetBase', label: 'target base', dataType: 'number', widgetType: 'slider', min: 2, max: 16, value: 16 },
  { name: 'bitWidth', dataType: 'number', widgetType: 'slider', min: 1, max: 64, value: 2 },
  { name: 'wordsPerRow', label: 'words / row', dataType: 'number', widgetType: 'slider', min: 1, max: 64, value: 8 },
  { name: 'xStagger', dataType: 'enum', widgetType: 'select', options: ['none', 'even', 'odd'], value: 'none' },
  { name: 'zStagger', dataType: 'enum', widgetType: 'select', options: ['none', 'even', 'odd'], value: 'none' },
  { name: 'staggerIntersectionMode', dataType: 'enum', widgetType: 'select', options: ['xor', 'min', 'max'], value: 'xor' },
  { name: 'invertWord', dataType: 'boolean', widgetType: 'toggle', value: true },
  { name: 'solidBlockOn0', dataType: 'boolean', widgetType: 'toggle', value: true },
  { name: 'redstoneBlockOn15', dataType: 'boolean', widgetType: 'toggle', value: true },
  { name: 'solidBlock', dataType: 'string', widgetType: 'text', value: 'minecraft:red_concrete' },
];

// The same fields as an unbundle field list + an object FlowType (the form's
// bundled `params` output / the group's `params` boundary input).
const ROM_PARAM_BUNDLE_FIELDS = ROM_FORM_FIELDS.map((f) => ({ name: f.name }));
const ROM_PARAMS_TYPE = {
  kind: 'object' as const,
  fields: {
    data: { kind: 'string' as const },
    sourceBase: { kind: 'number' as const },
    targetBase: { kind: 'number' as const },
    bitWidth: { kind: 'number' as const },
    wordsPerRow: { kind: 'number' as const },
    xStagger: { kind: 'string' as const },
    zStagger: { kind: 'string' as const },
    staggerIntersectionMode: { kind: 'string' as const },
    invertWord: { kind: 'boolean' as const },
    solidBlockOn0: { kind: 'boolean' as const },
    redstoneBlockOn15: { kind: 'boolean' as const },
    solidBlock: { kind: 'block' as const, default: 'minecraft:red_concrete' },
  },
};
const ROM_LIST_TYPE = { kind: 'list' as const, of: { kind: 'number' as const } };
const romUnbundleEdge = (field: string) => ({
  id: `rg-e-${field}`,
  source: 'rg-unbundle',
  target: 'rg-build',
  sourceHandle: field,
  targetHandle: field,
});

// roms.py generator, organised cleanly: one dense parameter Form + three
// spatial-offset list constants feed a reusable `group` module (Unbundle →
// build-rom), previewed by a viewer and exposed as an output.
export const EXAMPLE_ROM_GENERATOR_FLOW: FlowData = {
  id: 'example-rom-generator',
  name: 'ROM Generator',
  version: '2',
  createdAt: 0,
  nodes: [
    { id: 'rom-form', type: 'form', position: { x: 0, y: 0 },
      data: { label: 'ROM Parameters', fields: ROM_FORM_FIELDS, bundle: { enabled: true, name: 'params' } } },

    { id: 'c-xoff', type: 'constant', position: { x: 40, y: 560 },
      data: { label: 'xOffsets', dataType: 'list', value: [2] } },
    { id: 'c-yoff', type: 'constant', position: { x: 40, y: 640 },
      data: { label: 'yOffsets', dataType: 'list', value: [2] } },
    { id: 'c-zoff', type: 'constant', position: { x: 40, y: 720 },
      data: { label: 'zOffsets', dataType: 'list', value: [4] } },

    { id: 'rom-group', type: 'group', position: { x: 420, y: 220 },
      data: {
        label: 'ROM Generator',
        subgraph: {
          nodes: [
            { id: 'rg-unbundle', type: 'unbundle', position: { x: 0, y: 0 },
              data: { label: 'params', bundleFields: ROM_PARAM_BUNDLE_FIELDS } },
            { id: 'rg-build', type: 'code', position: { x: 320, y: 0 },
              data: { label: 'build ROM', code: ROM_BUILD_SOURCE, contract: ROM_BUILD_CONTRACT, io: contractToIO(ROM_BUILD_CONTRACT) } },
          ],
          edges: ROM_PARAM_BUNDLE_FIELDS.map((f) => romUnbundleEdge(f.name)),
        },
        groupInputs: [
          { name: 'params', internalNodeId: 'rg-unbundle', internalHandle: 'input', externalNodeId: 'rom-form', externalHandle: 'params', type: ROM_PARAMS_TYPE },
          { name: 'xOffsets', internalNodeId: 'rg-build', internalHandle: 'xOffsets', externalNodeId: 'c-xoff', externalHandle: 'output', type: ROM_LIST_TYPE },
          { name: 'yOffsets', internalNodeId: 'rg-build', internalHandle: 'yOffsets', externalNodeId: 'c-yoff', externalHandle: 'output', type: ROM_LIST_TYPE },
          { name: 'zOffsets', internalNodeId: 'rg-build', internalHandle: 'zOffsets', externalNodeId: 'c-zoff', externalHandle: 'output', type: ROM_LIST_TYPE },
        ],
        groupOutputs: [
          { name: 'rom', internalNodeId: 'rg-build', internalHandle: 'rom', externalNodeId: 'rom-view', externalHandle: 'input', type: { kind: 'schematic' } },
        ],
      } },

    { id: 'rom-view', type: 'viewer', position: { x: 820, y: 220 }, data: { label: 'ROM' } },
    { id: 'rom-out', type: 'output', position: { x: 820, y: 420 }, data: { label: 'rom' } },
  ],
  edges: [
    { id: 'e-params', source: 'rom-form', target: 'rom-group', sourceHandle: 'params', targetHandle: 'params' },
    { id: 'e-xoff', source: 'c-xoff', target: 'rom-group', sourceHandle: 'output', targetHandle: 'xOffsets' },
    { id: 'e-yoff', source: 'c-yoff', target: 'rom-group', sourceHandle: 'output', targetHandle: 'yOffsets' },
    { id: 'e-zoff', source: 'c-zoff', target: 'rom-group', sourceHandle: 'output', targetHandle: 'zOffsets' },
    { id: 'e-rom-view', source: 'rom-group', target: 'rom-view', sourceHandle: 'rom', targetHandle: 'input' },
    { id: 'e-rom-out', source: 'rom-group', target: 'rom-out', sourceHandle: 'rom', targetHandle: 'input' },
  ],
};

export const EXAMPLE_FLOWS: FlowData[] = [JULIA_STITCH_FLOW, WORLDGEN_FLOW, MANDELBROT_FLOW, EXAMPLE_ROM_GENERATOR_FLOW];