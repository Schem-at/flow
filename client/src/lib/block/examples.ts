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
}

const REDSTONE_BUS = `type Inputs = {
  length: Slider<{ min: 1; max: 128; default: 16 }>;
  material: Block<{ default: 'minecraft:gray_concrete' }>;
};

type Outputs = {
  schematic: Schematic;
};

function generate(inputs) {
  const schematic = new Schematic();
  for (let x = 0; x < inputs.length; x++) {
    schematic.set_block(x, 0, 0, inputs.material);
    if (x % 16 === 15) {
      schematic.set_block(x, 1, 0, 'minecraft:repeater[facing=west]');
    } else {
      schematic.set_block(x, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
    }
  }
  return { schematic };
}
`;

const PARAMETRIC_TERRAIN = `type Inputs = {
  width: Slider<{ min: 8; max: 256; default: 64 }>;
  depth: Slider<{ min: 8; max: 256; default: 64 }>;
  amplitude: Slider<{ min: 1; max: 64; default: 16 }>;
  scale: Slider<{ min: 0.01; max: 0.2; step: 0.01; default: 0.05 }>;
  seed: number;
  surface: Block<{ default: 'minecraft:grass_block' }>;
};

type Outputs = {
  terrain: Schematic;
};

function sampleNoise(x, z, scale, seed) {
  if (typeof Noise !== 'undefined' && typeof Noise.perlin2 === 'function') {
    return Noise.perlin2(x * scale + seed, z * scale + seed);
  }
  // Fallback when no noise provider is available.
  return Math.sin((x + seed) * scale) * Math.cos((z + seed) * scale);
}

function generate(inputs) {
  const terrain = new Schematic();
  for (let x = 0; x < inputs.width; x++) {
    if (x % 8 === 0) Progress.report((x / inputs.width) * 100, 'terrain column ' + x + '/' + inputs.width);
    for (let z = 0; z < inputs.depth; z++) {
      const n = sampleNoise(x, z, inputs.scale, inputs.seed);
      const height = Math.floor((n * 0.5 + 0.5) * inputs.amplitude);
      for (let y = 0; y < height; y++) {
        terrain.set_block(x, y, z, 'minecraft:dirt');
      }
      terrain.set_block(x, height, z, inputs.surface);
    }
  }
  return { terrain };
}
`;

const PARAMETRIC_BUILDING = `type Inputs = {
  width: Slider<{ min: 4; max: 64; default: 12 }>;
  depth: Slider<{ min: 4; max: 64; default: 10 }>;
  floors: Slider<{ min: 1; max: 32; default: 4 }>;
  wall: Block<{ default: 'minecraft:bricks' }>;
  glass: Block<{ default: 'minecraft:glass' }>;
  roof: 'flat' | 'gable' | 'pyramid';
};

type Outputs = {
  building: Schematic;
};

const FLOOR_HEIGHT = 4;

function isEdge(x, z, width, depth) {
  return x === 0 || z === 0 || x === width - 1 || z === depth - 1;
}

function buildWalls(schematic, inputs, baseY) {
  for (let y = baseY; y < baseY + FLOOR_HEIGHT; y++) {
    for (let x = 0; x < inputs.width; x++) {
      for (let z = 0; z < inputs.depth; z++) {
        if (!isEdge(x, z, inputs.width, inputs.depth)) continue;
        const isWindowRow = y % FLOOR_HEIGHT === 2;
        const isWindowColumn = (x + z) % 2 === 0;
        const block = isWindowRow && isWindowColumn ? inputs.glass : inputs.wall;
        schematic.set_block(x, y, z, block);
      }
    }
  }
}

function buildRoof(schematic, inputs, baseY) {
  if (inputs.roof === 'flat') {
    for (let x = 0; x < inputs.width; x++) {
      for (let z = 0; z < inputs.depth; z++) {
        schematic.set_block(x, baseY, z, inputs.wall);
      }
    }
  } else if (inputs.roof === 'gable') {
    // Stepped ridge along the width axis.
    const half = Math.ceil(inputs.depth / 2);
    for (let step = 0; step < half; step++) {
      for (let x = 0; x < inputs.width; x++) {
        for (let z = step; z < inputs.depth - step; z++) {
          if (z === step || z === inputs.depth - 1 - step) {
            schematic.set_block(x, baseY + step, z, inputs.wall);
          }
        }
      }
    }
  } else {
    // Pyramid: inset rings going up.
    const rings = Math.ceil(Math.min(inputs.width, inputs.depth) / 2);
    for (let ring = 0; ring < rings; ring++) {
      for (let x = ring; x < inputs.width - ring; x++) {
        for (let z = ring; z < inputs.depth - ring; z++) {
          if (
            x === ring ||
            z === ring ||
            x === inputs.width - 1 - ring ||
            z === inputs.depth - 1 - ring
          ) {
            schematic.set_block(x, baseY + ring, z, inputs.wall);
          }
        }
      }
    }
  }
}

function generate(inputs) {
  const building = new Schematic();
  for (let floor = 0; floor < inputs.floors; floor++) {
    buildWalls(building, inputs, floor * FLOOR_HEIGHT);
  }
  buildRoof(building, inputs, inputs.floors * FLOOR_HEIGHT);
  return { building };
}
`;

const BUILD_ANALYSIS = `type Inputs = {
  schematic: Schematic;
};

type Outputs = {
  dimensions: Vec3;
  blockCounts: Array<{ block: Block; count: number }>;
  heatmap: Image;
};

function generate(inputs) {
  const schematic = inputs.schematic;

  if (!schematic || typeof schematic.blocks !== 'function') {
    return {
      dimensions: [0, 0, 0],
      blockCounts: [],
      heatmap: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    };
  }

  const dims = typeof schematic.get_dimensions === 'function'
    ? schematic.get_dimensions()
    : [0, 0, 0];
  const dimensions = [dims[0] | 0, dims[1] | 0, dims[2] | 0];

  const counts = new Map();
  const columnDensity = new Map();
  for (const block of schematic.blocks()) {
    const name = block && (block.name || block.block || block.id);
    if (!name) continue;
    if (name === 'minecraft:air') continue; // blocks() enumerates the full bounding box
    counts.set(name, (counts.get(name) || 0) + 1);
    const key = (block.x | 0) + ',' + (block.z | 0);
    columnDensity.set(key, (columnDensity.get(key) || 0) + 1);
  }

  const blockCounts = [...counts.entries()]
    .map(([block, count]) => ({ block, count }))
    .sort((a, b) => b.count - a.count);

  const width = Math.max(1, dimensions[0]);
  const height = Math.max(1, dimensions[2]);
  const maxDensity = Math.max(1, ...columnDensity.values());
  const data = new Uint8ClampedArray(width * height * 4);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const density = columnDensity.get(x + ',' + z) || 0;
      const shade = Math.round((density / maxDensity) * 255);
      const i = (z * width + x) * 4;
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = 255;
    }
  }

  return { dimensions, blockCounts, heatmap: { width, height, data } };
}
`;

const JULIA_GRID = `type Inputs = {
  cols: Slider<{ min: 1; max: 8; default: 4 }>;
  rows: Slider<{ min: 1; max: 6; default: 3 }>;
  tile: Slider<{ min: 8; max: 32; default: 16 }>;
  iterations: Slider<{ min: 8; max: 64; default: 32 }>;
};

type Outputs = {
  tiles: Schematic[][];
};

// Each grid cell is the Julia set for the constant c at the cell's position in
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

function generate(inputs) {
  // The region of the complex plane that frames the Mandelbrot set.
  const RE_MIN = -2.0, RE_MAX = 0.6, IM_MIN = -1.2, IM_MAX = 1.2;
  const tiles = [];
  for (let r = 0; r < inputs.rows; r++) {
    Progress.report((r / inputs.rows) * 100, 'julia row ' + (r + 1) + '/' + inputs.rows);
    const row = [];
    for (let c = 0; c < inputs.cols; c++) {
      const cRe = RE_MIN + (inputs.cols > 1 ? c / (inputs.cols - 1) : 0.5) * (RE_MAX - RE_MIN);
      const cIm = IM_MAX - (inputs.rows > 1 ? r / (inputs.rows - 1) : 0.5) * (IM_MAX - IM_MIN);
      row.push(juliaTile(cRe, cIm, inputs.tile, inputs.iterations));
    }
    tiles.push(row);
  }
  return { tiles };
}
`;

const BLOCK_CENSUS = `type Inputs = {
  schematic: Schematic;
};

type Outputs = {
  csv: string;
  rows: Array<{ block: Block; count: number; percent: number }>;
};

function generate(inputs) {
  const counts = new Map();
  let total = 0;
  for (const b of inputs.schematic.blocks()) {
    if (!b.name || b.name === 'minecraft:air') continue;
    counts.set(b.name, (counts.get(b.name) || 0) + 1);
    total++;
  }

  const rows = [...counts.entries()]
    .sort((p, q) => q[1] - p[1])
    .map((entry) => ({
      block: entry[0],
      count: entry[1],
      percent: total ? Math.round((entry[1] / total) * 1000) / 10 : 0,
    }));

  let csv = 'block,count,percent';
  for (const row of rows) {
    csv += '\\n' + row.block + ',' + row.count + ',' + row.percent;
  }

  return { csv, rows };
}
`;

const HOLOGRAM_MCFUNCTION = `type Inputs = {
  schematic: Schematic;
  scale: Slider<{ min: 0.05; max: 0.5; step: 0.05; default: 0.125 }>;
  tag: string;
};

type Outputs = {
  mcfunction: string;
  commands: number;
};

function generate(inputs) {
  const scale = inputs.scale;
  const tag = inputs.tag || 'hologram';
  const lines = [
    '# Tiny block_display hologram - generated by Flow',
    '# Paste into a datapack function and run it where the hologram should appear.',
    'kill @e[type=minecraft:block_display,tag=' + tag + ']',
  ];

  const LIMIT = 4000;
  let count = 0;
  for (const b of inputs.schematic.blocks()) {
    if (!b.name || b.name === 'minecraft:air') continue;
    if (count >= LIMIT) {
      lines.push('# ... truncated at ' + LIMIT + ' blocks');
      break;
    }
    // block_display Name takes the bare id; blockstate properties are dropped.
    const name = b.name.split('[')[0];
    const s = scale.toFixed(4) + 'f';
    const pos =
      (b.x * scale).toFixed(4) + 'f,' +
      (b.y * scale + 1).toFixed(4) + 'f,' +
      (b.z * scale).toFixed(4) + 'f';
    lines.push(
      'summon minecraft:block_display ~ ~ ~ {Tags:["' + tag + '"],block_state:{Name:"' + name +
      '"},transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],scale:[' +
      s + ',' + s + ',' + s + '],translation:[' + pos + ']}}'
    );
    count++;
  }

  return { mcfunction: lines.join('\\n'), commands: count };
}
`;

const LOGIC_LAB = `type Inputs = {
  gate: 'and' | 'nand' | 'or' | 'not';
};

type Outputs = {
  circuit: Schematic;
  truthTable: Array<{ a: boolean; b: boolean; out: boolean }>;
};

const STONE = 'minecraft:gray_concrete';
const LEVER = 'minecraft:lever[face=floor,facing=north,powered=false]';

function buildNot(s) {
  s.set_block(0, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
  s.set_block(2, 1, 0, 'minecraft:redstone_lamp[lit=true]');
  return { levers: [[0, 2, 0]], probe: [1, 1, 0], probeIsTorch: true };
}

function buildOr(s) {
  s.set_block(0, 1, 0, STONE);
  s.set_block(4, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(4, 2, 0, LEVER);
  for (let x = 1; x <= 3; x++) {
    s.set_block(x, 0, 0, STONE);
    s.set_block(x, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
  }
  return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 0], probeIsTorch: false };
}

function buildAndNand(s, isNand) {
  // Torch logic: levers invert onto a merge wire; wire = NOT a OR NOT b (= NAND).
  // For AND, a repeater strong-powers a block whose torch re-inverts the wire.
  s.set_block(0, 1, 0, STONE);
  s.set_block(4, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(4, 2, 0, LEVER);
  s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
  s.set_block(3, 1, 0, 'minecraft:redstone_wall_torch[facing=west,lit=true]');
  s.set_block(2, 0, 0, STONE);
  s.set_block(2, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
  if (isNand) {
    return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 0], probeIsTorch: false };
  }
  s.set_block(2, 0, 1, STONE);
  s.set_block(2, 1, 1, 'minecraft:repeater[facing=north,delay=1,powered=false]');
  s.set_block(2, 1, 2, STONE);
  s.set_block(2, 1, 3, 'minecraft:redstone_wall_torch[facing=south,lit=false]');
  s.set_block(2, 1, 4, 'minecraft:redstone_lamp[lit=false]');
  return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 3], probeIsTorch: true };
}

function generate(inputs) {
  const s = new Schematic();
  let cfg;
  if (inputs.gate === 'not') cfg = buildNot(s);
  else if (inputs.gate === 'or') cfg = buildOr(s);
  else cfg = buildAndNand(s, inputs.gate === 'nand');

  // Real redstone simulation (MCHPRS inside nucleation): toggle the levers
  // through every combination and probe the output.
  const world = s.create_simulation_world();
  const readOut = () => {
    const p = cfg.probe;
    return cfg.probeIsTorch ? world.is_lit(p[0], p[1], p[2]) : world.get_redstone_power(p[0], p[1], p[2]) > 0;
  };

  const combos =
    cfg.levers.length === 1
      ? [[false], [true]]
      : [[false, false], [false, true], [true, false], [true, true]];

  const truthTable = [];
  for (const combo of combos) {
    for (let i = 0; i < cfg.levers.length; i++) {
      const lever = cfg.levers[i];
      if (world.get_lever_power(lever[0], lever[1], lever[2]) !== combo[i]) {
        world.on_use_block(lever[0], lever[1], lever[2]);
      }
    }
    world.tick(20);
    world.flush();
    truthTable.push({ a: combo[0], b: combo.length > 1 ? combo[1] : false, out: readOut() });
  }

  // Return the live circuit (torch/lamp states from the last combination).
  world.sync_to_schematic();
  return { circuit: world.get_schematic(), truthTable };
}
`;

export const EXAMPLE_BLOCKS: ExampleBlock[] = [
  {
    id: 'redstone-bus',
    name: 'Redstone Bus',
    description:
      'A straight redstone wire bus with repeaters every 16 blocks to keep the signal alive.',
    source: REDSTONE_BUS,
  },
  {
    id: 'parametric-terrain',
    name: 'Parametric Terrain',
    description:
      'Noise-driven heightmap terrain: dirt columns capped with a configurable surface block.',
    source: PARAMETRIC_TERRAIN,
  },
  {
    id: 'parametric-building',
    name: 'Parametric Building',
    description:
      'Multi-floor building with windowed walls and a flat, gable, or pyramid roof.',
    source: PARAMETRIC_BUILDING,
  },
  {
    id: 'build-analysis',
    name: 'Build Analysis',
    description:
      'Analyzes a schematic: dimensions, block counts sorted by frequency, and a column-density heatmap.',
    source: BUILD_ANALYSIS,
  },
  {
    id: 'julia-grid',
    name: 'Julia Set Grid',
    description:
      'A rows×cols grid of 3D Julia-set tiles tracing the Mandelbrot set — outputs a list of lists of schematics.',
    source: JULIA_GRID,
  },
  {
    id: 'block-census',
    name: 'Block Census (CSV)',
    description:
      'Counts every block in a schematic and emits both a sorted table and a ready-to-save CSV.',
    source: BLOCK_CENSUS,
  },
  {
    id: 'hologram-mcfunction',
    name: 'Hologram (mcfunction)',
    description:
      'Turns a schematic into a tiny block_display hologram: an .mcfunction you can paste into a datapack.',
    source: HOLOGRAM_MCFUNCTION,
  },
  {
    id: 'logic-lab',
    name: 'Redstone Logic Lab',
    description:
      'Builds a real redstone gate (AND/NAND/OR/NOT), simulates it with MCHPRS, and returns the live circuit plus its measured truth table.',
    source: LOGIC_LAB,
  },
];

/**
 * Static contracts for every example block, so they can be dropped into the
 * node editor with typed ports immediately (no parse round-trip). Drift is
 * guarded by tests asserting these equal what the parser derives.
 */
export const EXAMPLE_BLOCK_CONTRACTS: Record<string, BlockContract> = {
  'redstone-bus': {
    inputs: {
      length: { kind: 'number', widget: 'slider', min: 1, max: 128, default: 16 },
      material: { kind: 'block', default: 'minecraft:gray_concrete' },
    },
    outputs: { schematic: { kind: 'schematic' } },
  },
  'parametric-terrain': {
    inputs: {
      width: { kind: 'number', widget: 'slider', min: 8, max: 256, default: 64 },
      depth: { kind: 'number', widget: 'slider', min: 8, max: 256, default: 64 },
      amplitude: { kind: 'number', widget: 'slider', min: 1, max: 64, default: 16 },
      scale: { kind: 'number', widget: 'slider', min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
      seed: { kind: 'number' },
      surface: { kind: 'block', default: 'minecraft:grass_block' },
    },
    outputs: { terrain: { kind: 'schematic' } },
  },
  'parametric-building': {
    inputs: {
      width: { kind: 'number', widget: 'slider', min: 4, max: 64, default: 12 },
      depth: { kind: 'number', widget: 'slider', min: 4, max: 64, default: 10 },
      floors: { kind: 'number', widget: 'slider', min: 1, max: 32, default: 4 },
      wall: { kind: 'block', default: 'minecraft:bricks' },
      glass: { kind: 'block', default: 'minecraft:glass' },
      roof: { kind: 'enum', options: ['flat', 'gable', 'pyramid'] },
    },
    outputs: { building: { kind: 'schematic' } },
  },
  'build-analysis': {
    inputs: { schematic: { kind: 'schematic' } },
    outputs: {
      dimensions: { kind: 'vec3' },
      blockCounts: {
        kind: 'list',
        of: { kind: 'object', fields: { block: { kind: 'block' }, count: { kind: 'number' } } },
      },
      heatmap: { kind: 'image' },
    },
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
  'block-census': {
    inputs: { schematic: { kind: 'schematic' } },
    outputs: {
      csv: { kind: 'string' },
      rows: {
        kind: 'list',
        of: {
          kind: 'object',
          fields: {
            block: { kind: 'block' },
            count: { kind: 'number' },
            percent: { kind: 'number' },
          },
        },
      },
    },
  },
  'hologram-mcfunction': {
    inputs: {
      schematic: { kind: 'schematic' },
      scale: { kind: 'number', widget: 'slider', min: 0.05, max: 0.5, step: 0.05, default: 0.125 },
      tag: { kind: 'string' },
    },
    outputs: { mcfunction: { kind: 'string' }, commands: { kind: 'number' } },
  },
  'logic-lab': {
    inputs: { gate: { kind: 'enum', options: ['and', 'nand', 'or', 'not'] } },
    outputs: {
      circuit: { kind: 'schematic' },
      truthTable: {
        kind: 'list',
        of: {
          kind: 'object',
          fields: { a: { kind: 'boolean' }, b: { kind: 'boolean' }, out: { kind: 'boolean' } },
        },
      },
    },
  },
};
