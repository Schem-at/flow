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

export const EXAMPLE_BLOCKS: ExampleBlock[] = [
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
