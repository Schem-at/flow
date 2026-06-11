/**
 * Built-in example blocks in the v2 block format: a `type Inputs/Outputs`
 * contract plus a plain-JS `function generate(inputs)` entry. No imports or
 * exports — the runtime context (Schematic, Noise, …) is ambient.
 */

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
];
