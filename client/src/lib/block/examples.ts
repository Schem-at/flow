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

const REDSTONE_BUS = `function generate(
  length: Slider<{ min: 1; max: 128; default: 16 }>,
  material: Block<{ default: 'minecraft:gray_concrete' }>,
): {
  schematic: Schematic;
} {
  const schematic = new Schematic();
  for (let x = 0; x < length; x++) {
    schematic.set_block(x, 0, 0, material);
    if (x % 16 === 15) {
      schematic.set_block(x, 1, 0, 'minecraft:repeater[facing=west]');
    } else {
      schematic.set_block(x, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
    }
  }
  return { schematic };
}
`;

const PARAMETRIC_TERRAIN = `function sampleNoise(x, z, scale, seed) {
  // Noise is an ambient runtime provider; get2D returns roughly [-1, 1].
  return Noise.get2D(x * scale + seed, z * scale + seed);
}

function generate(
  width: Slider<{ min: 8; max: 256; default: 64 }>,
  depth: Slider<{ min: 8; max: 256; default: 64 }>,
  amplitude: Slider<{ min: 1; max: 64; default: 16 }>,
  scale: Slider<{ min: 0.01; max: 0.2; step: 0.01; default: 0.05 }>,
  seed: number,
  surface: Block<{ default: 'minecraft:grass_block' }>,
): {
  terrain: Schematic;
} {
  const terrain = new Schematic();
  for (let x = 0; x < width; x++) {
    if (x % 8 === 0) Progress.report((x / width) * 100, 'terrain column ' + x + '/' + width);
    for (let z = 0; z < depth; z++) {
      const n = sampleNoise(x, z, scale, seed);
      const height = Math.floor((n * 0.5 + 0.5) * amplitude);
      for (let y = 0; y < height; y++) {
        terrain.set_block(x, y, z, 'minecraft:dirt');
      }
      terrain.set_block(x, height, z, surface);
    }
  }
  return { terrain };
}
`;

const PARAMETRIC_BUILDING = `const FLOOR_HEIGHT = 4;

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

function generate(
  width: Slider<{ min: 4; max: 64; default: 12 }>,
  depth: Slider<{ min: 4; max: 64; default: 10 }>,
  floors: Slider<{ min: 1; max: 32; default: 4 }>,
  wall: Block<{ default: 'minecraft:bricks' }>,
  glass: Block<{ default: 'minecraft:glass' }>,
  roof: 'flat' | 'gable' | 'pyramid',
): {
  building: Schematic;
} {
  const opts = { width, depth, floors, wall, glass, roof };
  const building = new Schematic();
  for (let floor = 0; floor < floors; floor++) {
    buildWalls(building, opts, floor * FLOOR_HEIGHT);
  }
  buildRoof(building, opts, floors * FLOOR_HEIGHT);
  return { building };
}
`;

const BUILD_ANALYSIS = `function generate(
  schematic: Schematic,
): {
  dimensions: Vec3;
  blockCounts: Array<{ block: Block; count: number }>;
  heatmap: Image;
} {
  if (!schematic || typeof schematic.blocks !== 'function') {
    return { dimensions: [0, 0, 0], blockCounts: [], heatmap: Image.blank() };
  }

  // bounds + blockCounts() are native queries on the schematic.
  const b = schematic.bounds;
  const dimensions = [b.width | 0, b.height | 0, b.depth | 0];

  const blockCounts = [...schematic.blockCounts().entries()]
    .map(([block, count]) => ({ block, count }))
    .sort((a, b) => b.count - a.count);

  // Top-down density heatmap: non-air blocks stacked in each XZ column.
  const columnDensity = new Map();
  for (const block of schematic.blocks()) {
    const key = (block.x | 0) + ',' + (block.z | 0);
    columnDensity.set(key, (columnDensity.get(key) || 0) + 1);
  }

  const width = Math.max(1, dimensions[0]);
  const height = Math.max(1, dimensions[2]);
  const maxDensity = Math.max(1, ...columnDensity.values());
  const heatmap = new Image(width, height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const density = columnDensity.get(x + ',' + z) || 0;
      const shade = Math.round((density / maxDensity) * 255);
      heatmap.setPixel(x, z, shade, shade, shade);
    }
  }

  return { dimensions, blockCounts, heatmap };
}
`;

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

function generate(
  cols: Slider<{ min: 1; max: 8; default: 4 }>,
  rows: Slider<{ min: 1; max: 6; default: 3 }>,
  tile: Slider<{ min: 8; max: 32; default: 16 }>,
  iterations: Slider<{ min: 8; max: 64; default: 32 }>,
): {
  tiles: Schematic[][];
} {
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

const BLOCK_CENSUS = `function generate(
  schematic: Schematic,
): {
  csv: string;
  rows: Array<{ block: Block; count: number; percent: number }>;
} {
  // blockCounts() tallies every non-air block by id (the manual blocks() loop).
  const counts = schematic.blockCounts();
  let total = 0;
  for (const n of counts.values()) total += n;

  const rows = [...counts.entries()]
    .sort((p, q) => q[1] - p[1])
    .map((entry) => ({
      block: entry[0],
      count: entry[1],
      percent: total ? Math.round((entry[1] / total) * 1000) / 10 : 0,
    }));

  return { csv: Table.toCsv(rows), rows };
}
`;

const HOLOGRAM_MCFUNCTION = `function generate(
  schematic: Schematic,
  scale: Slider<{ min: 0.05; max: 0.5; step: 0.05; default: 0.125 }>,
  tag: string,
): {
  mcfunction: string;
  commands: number;
} {
  const tagName = tag || 'hologram';
  const f = Mcfunction.builder()
    .comment('Tiny block_display hologram - generated by Flow')
    .comment('Paste into a datapack function and run it where the hologram should appear.')
    .killTagged(tagName);

  const LIMIT = 4000;
  let count = 0;
  for (const b of schematic.blocks()) {
    if (count >= LIMIT) {
      f.comment('... truncated at ' + LIMIT + ' blocks');
      break;
    }
    // block_display Name takes the bare id; blockstate properties are dropped.
    const name = b.name.split('[')[0];
    f.summonBlockDisplay(
      { x: b.x * scale, y: b.y * scale + 1, z: b.z * scale },
      name,
      scale,
      tagName
    );
    count++;
  }

  return { mcfunction: f.toString(), commands: count };
}
`;

const LOGIC_LAB = `const STONE = 'minecraft:gray_concrete';
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

function generate(
  gate: 'and' | 'nand' | 'or' | 'not',
): {
  circuit: Schematic;
  truthTable: Array<{ a: boolean; b: boolean; out: boolean }>;
} {
  const s = new Schematic();
  let cfg;
  if (gate === 'not') cfg = buildNot(s);
  else if (gate === 'or') cfg = buildOr(s);
  else cfg = buildAndNand(s, gate === 'nand');

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

const NOISE_FIELD = `// Field + Noise + Image ambients replace ~70 lines of hand-rolled value noise,
// fBm stacking, normalization and RGBA byte loops. Inputs are positional params
// on generate (no inputs object); Outputs are the return type.
function generate(
  size: Slider<{ min: 32; max: 256; default: 96 }>,
  scale: Slider<{ min: 0.005; max: 0.1; step: 0.005; default: 0.02 }>,
  octaves: Slider<{ min: 1; max: 6; default: 4 }>,
  seed: number,
): {
  field: number[][];
  preview: Image;
} {
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

const VORONOI_FIELD = `function generate(
  size: Slider<{ min: 32; max: 256; default: 96 }>,
  cells: Slider<{ min: 2; max: 24; default: 7 }>,
  seed: number,
): {
  field: number[][];
  preview: Image;
} {
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

const COMBINE_FIELDS = `function generate(
  a: number[][],
  b: number[][],
  op: 'subtract' | 'add' | 'multiply' | 'min' | 'max' | 'average',
  strength: Slider<{ min: 0; max: 1; step: 0.05; default: 1 }>,
): {
  field: number[][];
  preview: Image;
} {
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

const SHAPE_FIELD = `function generate(
  field: number[][],
  exponent: Slider<{ min: 0.3; max: 3; step: 0.1; default: 1.6 }>,
  terraces: Slider<{ min: 0; max: 12; default: 0 }>,
): {
  field: number[][];
  preview: Image;
} {
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

function generate(
  elevation: number[][],
  moisture: number[][],
  amplitude: Slider<{ min: 4; max: 64; default: 30 }>,
  waterLevel: Slider<{ min: 0; max: 1; step: 0.05; default: 0.35 }>,
  seed: number,
): {
  terrain: Schematic;
  biomes: Image;
} {
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
async function generate(
  tag: string,
  search: string,
  limit: Slider<{ min: 1; max: 50; default: 10 }>,
): {
  results: { name: string; id: string; format: string; tags: string; authors: string }[];
  firstId: string;
  count: number;
} {
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
async function generate(
  id: TextField<{ required: true }>,
): {
  schematic: Schematic;
  name: string;
} {
  // One step: download + parse into a live Schematic.
  const loaded = await Schemati.loadSchematic(id);
  return { schematic: loaded.schematic, name: loaded.name };
}
`;

const SCHEMATI_UPLOAD = `// Publishes a schematic to the schemati platform. In the browser you must be
// signed in; on the server SCHEMATI_API_TOKEN is used. Tags are comma-separated
// platform tag names. A top-down preview image is generated automatically.
async function generate(
  schematic: Schematic,
  name: string,
  description: string,
  tags: string,
  isPublic: Toggle<{ default: true }>,
): {
  id: string;
  url: string;
  summary: string;
} {
  if (!name) throw new Error('Give the upload a name');
  const tagList = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const uploaded = await Schemati.uploadSchematic(schematic, {
    name: name,
    description: description || undefined,
    tags: tagList,
    isPublic: isPublic,
  });

  const id = Schemati.displayId(uploaded);
  return {
    id,
    url: uploaded.webUrl || '',
    summary: 'Uploaded "' + uploaded.name + '" (' + id + ')',
  };
}
`;

const PICK_ITEM = `// Plumbing node: take element [index] from a list (negative counts from the
// end), optionally drilling into a named field — so upstream blocks don't
// need single-purpose outputs like "firstId".
function generate(
  list: any[],
  index: NumberField<{ min: 0; default: 0 }>,
  fieldName: string,
): {
  item: any;
} {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) throw new Error('Pick: the list is empty');
  const i = index < 0 ? items.length + index : index;
  if (i < 0 || i >= items.length) {
    throw new Error('Pick: index ' + index + ' out of range (0..' + (items.length - 1) + ')');
  }
  const item = items[i];
  if (fieldName) {
    if (item === null || typeof item !== 'object' || !(fieldName in item)) {
      throw new Error('Pick: item has no field "' + fieldName + '"');
    }
    return { item: item[fieldName] };
  }
  return { item };
}
`;

const STITCH_GRID = `// Arrange a 2D grid of schematics into one mosaic. Uses paste() — the
// centralized copy (a native WASM offset-paste will slot in transparently).
function generate(
  tiles: Schematic[][],
  spacing: Slider<{ min: 0; max: 8; default: 1 }>,
): {
  stitched: Schematic;
} {
  const rows = tiles;
  if (!rows || !rows.length) throw new Error('Stitch: no tiles');

  // tileGrid lays the rows into one mosaic on a uniform cell grid (sized to
  // the largest tile) with the requested spacing — the manual paste loop.
  const stitched = Schematic.tileGrid(rows, { spacing: spacing, mode: 'uniform' });
  return { stitched };
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
    id: 'pick-item',
    name: 'Pick Item',
    description:
      'Plumbing: takes element [index] from a list (negative = from the end), optionally drilling into a named field.',
    source: PICK_ITEM,
  },
  {
    id: 'stitch-grid',
    name: 'Stitch Grid',
    description:
      'Arranges a 2D grid of schematics into one mosaic with configurable spacing.',
    source: STITCH_GRID,
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
    inputs: { id: { kind: 'string', required: true } },
    outputs: { schematic: { kind: 'schematic' }, name: { kind: 'string' } },
  },
  'pick-item': {
    inputs: {
      list: { kind: 'list', of: { kind: 'unknown' } },
      index: { kind: 'number', widget: 'input', min: 0, default: 0 },
      fieldName: { kind: 'string' },
    },
    outputs: { item: { kind: 'unknown' } },
  },
  'stitch-grid': {
    inputs: {
      tiles: { kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } },
      spacing: { kind: 'number', widget: 'slider', min: 0, max: 8, default: 1 },
    },
    outputs: { stitched: { kind: 'schematic' } },
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
