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

const NOISE_FIELD = `type Inputs = {
  size: Slider<{ min: 32; max: 256; default: 96 }>;
  scale: Slider<{ min: 0.005; max: 0.1; step: 0.005; default: 0.02 }>;
  octaves: Slider<{ min: 1; max: 6; default: 4 }>;
  seed: number;
};

type Outputs = {
  field: number[][];
  preview: Image;
};

function hash2(ix, iz, seed) {
  let h = ((ix * 374761393) ^ (iz * 668265263) ^ Math.imul(seed | 0, 974711)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx);
  const v = smooth(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fieldToImage(field) {
  const size = field.length;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(field[x][z] * 255);
      const i = (z * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data: data };
}

function generate(inputs) {
  const size = inputs.size | 0;
  const field = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = 0; x < size; x++) {
    if (x % 16 === 0) Progress.report((x / size) * 100, 'noise column ' + x);
    const col = [];
    for (let z = 0; z < size; z++) {
      // fBm: stacked octaves of smoothed value noise.
      let amp = 1;
      let freq = inputs.scale;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < inputs.octaves; o++) {
        sum += amp * valueNoise(x * freq, z * freq, (inputs.seed | 0) + o * 101);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      const v = sum / norm;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      col.push(v);
    }
    field.push(col);
  }
  // Normalize to the full 0..1 range.
  const span = hi - lo || 1;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      field[x][z] = (field[x][z] - lo) / span;
    }
  }
  return { field, preview: fieldToImage(field) };
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

function hash2(ix, iz, seed) {
  let h = ((ix * 374761393) ^ (iz * 668265263) ^ Math.imul(seed | 0, 974711)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fieldToImage(field) {
  const size = field.length;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(field[x][z] * 255);
      const i = (z * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data: data };
}

function generate(inputs) {
  const size = inputs.size | 0;
  const cells = inputs.cells | 0;
  const cellSize = size / cells;

  // One jittered feature point per grid cell.
  const points = [];
  for (let cx = 0; cx < cells; cx++) {
    for (let cz = 0; cz < cells; cz++) {
      points.push([
        (cx + hash2(cx, cz, inputs.seed | 0)) * cellSize,
        (cz + hash2(cx, cz, (inputs.seed | 0) + 7777)) * cellSize,
      ]);
    }
  }

  // F1 Worley noise: distance to the nearest feature point.
  const field = [];
  let hi = 0;
  for (let x = 0; x < size; x++) {
    if (x % 16 === 0) Progress.report((x / size) * 100, 'voronoi column ' + x);
    const col = [];
    for (let z = 0; z < size; z++) {
      let best = Infinity;
      for (const p of points) {
        const dx = p[0] - x;
        const dz = p[1] - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      const v = Math.sqrt(best);
      if (v > hi) hi = v;
      col.push(v);
    }
    field.push(col);
  }
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      field[x][z] = field[x][z] / (hi || 1);
    }
  }
  return { field, preview: fieldToImage(field) };
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

function fieldToImage(field) {
  const size = field.length;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(field[x][z] * 255);
      const i = (z * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data: data };
}

function generate(inputs) {
  const a = inputs.a || [];
  const b = inputs.b || [];
  const size = Math.min(a.length, b.length);
  if (!size) return { field: [], preview: { width: 1, height: 1, data: new Uint8ClampedArray(4) } };

  const k = inputs.strength;
  const field = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = 0; x < size; x++) {
    const col = [];
    for (let z = 0; z < size; z++) {
      const va = a[x][z];
      const vb = b[x][z] * k;
      let v;
      if (inputs.op === 'add') v = va + vb;
      else if (inputs.op === 'multiply') v = va * (1 - k + vb);
      else if (inputs.op === 'min') v = Math.min(va, vb);
      else if (inputs.op === 'max') v = Math.max(va, vb);
      else if (inputs.op === 'average') v = (va + vb) / 2;
      else v = va - vb; // subtract (perlin minus voronoi = eroded ridges)
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      col.push(v);
    }
    field.push(col);
  }
  const span = hi - lo || 1;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      field[x][z] = (field[x][z] - lo) / span;
    }
  }
  return { field, preview: fieldToImage(field) };
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

function fieldToImage(field) {
  const size = field.length;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(field[x][z] * 255);
      const i = (z * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data: data };
}

function generate(inputs) {
  const src = inputs.field || [];
  const size = src.length;
  if (!size) return { field: [], preview: { width: 1, height: 1, data: new Uint8ClampedArray(4) } };

  const steps = inputs.terraces | 0;
  const out = [];
  for (let x = 0; x < size; x++) {
    const col = [];
    for (let z = 0; z < size; z++) {
      // Redistribution: exponent > 1 flattens valleys and sharpens peaks.
      let v = Math.pow(src[x][z], inputs.exponent);
      if (steps > 0) v = Math.round(v * steps) / steps;
      col.push(v);
    }
    out.push(col);
  }
  return { field: out, preview: fieldToImage(out) };
}
`;

const FIELD_TO_TERRAIN = `type Inputs = {
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

function hash2(ix, iz, seed) {
  let h = ((ix * 374761393) ^ (iz * 668265263) ^ Math.imul(seed | 0, 974711)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BIOMES = {
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

function generate(inputs) {
  const elevation = inputs.elevation || [];
  const moisture = inputs.moisture || [];
  const size = elevation.length;
  const terrain = new Schematic();
  const data = new Uint8ClampedArray(Math.max(1, size * size * 4));
  if (!size) return { terrain, biomes: { width: 1, height: 1, data: data } };

  const amplitude = inputs.amplitude;
  const waterY = Math.max(1, Math.floor(inputs.waterLevel * amplitude));

  for (let x = 0; x < size; x++) {
    if (x % 8 === 0) Progress.report((x / size) * 100, 'building column ' + x);
    for (let z = 0; z < size; z++) {
      const e = elevation[x][z];
      const m = moisture[x] && moisture[x][z] !== undefined ? moisture[x][z] : 0.5;
      const biome = classify(e, m, inputs.waterLevel);
      const spec = BIOMES[biome];

      const i = (z * size + x) * 4;
      data[i] = spec.color[0];
      data[i + 1] = spec.color[1];
      data[i + 2] = spec.color[2];
      data[i + 3] = 255;

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
            hash2(x, z, (inputs.seed | 0) + 31) < 0.025) {
          plantTree(terrain, x, height, z);
        }
      }
    }
  }

  return { terrain, biomes: { width: size, height: size, data: data } };
}
`;

const SCHEMATI_SEARCH = `type Inputs = {
  tag: string;
  search: string;
  limit: Slider<{ min: 1; max: 50; default: 10 }>;
};

type Outputs = {
  results: { name: string; id: string; format: string; tags: string; authors: string }[];
  firstId: string;
  count: number;
};

// Searches the schemati platform. In the browser this rides your session;
// on the server it uses SCHEMATI_URL / SCHEMATI_API_TOKEN.
async function generate(inputs) {
  const found = await Schemati.searchSchematics({
    tag: inputs.tag || undefined,
    search: inputs.search || undefined,
    limit: inputs.limit,
  });

  const results = found.map((s) => ({
    name: s.name,
    id: s.shortId || s.id,
    format: s.format,
    tags: s.tags.join(', '),
    authors: s.authors.join(', '),
  }));

  return {
    results,
    firstId: found.length ? (found[0].shortId || found[0].id) : '',
    count: found.length,
  };
}
`;

const SCHEMATI_FETCH = `type Inputs = {
  id: string;
};

type Outputs = {
  schematic: Schematic;
  name: string;
};

// Downloads a schematic from the platform by id, short id, or slug and
// loads it as a live Schematic (one download, parsed locally).
async function generate(inputs) {
  if (!inputs.id) throw new Error('Provide a schematic id, short id, or slug');
  const file = await Schemati.getSchematicData(inputs.id);
  const schematic = new Schematic();
  schematic.from_data(file.data);
  return { schematic, name: file.metadata.name };
}
`;

const SCHEMATI_UPLOAD = `type Inputs = {
  schematic: Schematic;
  name: string;
  description: string;
  tags: string;
  isPublic: Toggle<{ default: true }>;
};

type Outputs = {
  id: string;
  url: string;
  summary: string;
};

// Publishes a schematic to the schemati platform. In the browser you must be
// signed in; on the server SCHEMATI_API_TOKEN is used. Tags are comma-separated
// platform tag names. A top-down preview image is generated automatically.
async function generate(inputs) {
  if (!inputs.name) throw new Error('Give the upload a name');
  const tags = inputs.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const uploaded = await Schemati.uploadSchematic(inputs.schematic, {
    name: inputs.name,
    description: inputs.description || undefined,
    tags,
    isPublic: inputs.isPublic,
  });

  return {
    id: uploaded.shortId || uploaded.id,
    url: uploaded.webUrl || '',
    summary: 'Uploaded "' + uploaded.name + '" (' + (uploaded.shortId || uploaded.id) + ')',
  };
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
    id: 'schemati-upload',
    name: 'Upload',
    description:
      'Publishes a schematic to the platform with tags and an auto-generated preview — sign in required in the browser.',
    source: SCHEMATI_UPLOAD,
    category: 'platform',
  },
  {
    id: 'logic-lab',
    name: 'Redstone Logic Lab',
    description:
      'Builds a real redstone gate (AND/NAND/OR/NOT), simulates it with MCHPRS, and returns the live circuit plus its measured truth table.',
    source: LOGIC_LAB,
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
    inputs: { id: { kind: 'string' } },
    outputs: { schematic: { kind: 'schematic' }, name: { kind: 'string' } },
  },
  'schemati-upload': {
    inputs: {
      schematic: { kind: 'schematic' },
      name: { kind: 'string' },
      description: { kind: 'string' },
      tags: { kind: 'string' },
      isPublic: { kind: 'boolean', default: true },
    },
    outputs: { id: { kind: 'string' }, url: { kind: 'string' }, summary: { kind: 'string' } },
  },
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
