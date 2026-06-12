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
  const stitched = new Schematic();
  const tiles = inputs.tiles || [];
  const spacing = inputs.spacing ?? 2;

  let offsetZ = 0;
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r] || [];
    let offsetX = 0;
    let rowDepth = 0;
    for (let c = 0; c < row.length; c++) {
      const tile = row[c];
      if (!tile || typeof tile.blocks !== 'function') continue;
      const dims = tile.get_dimensions();
      for (const b of tile.blocks()) {
        if (b.name === 'minecraft:air') continue;
        stitched.set_block(offsetX + b.x, b.y, offsetZ + b.z, b.name);
      }
      offsetX += (dims[0] | 0) + spacing;
      rowDepth = Math.max(rowDepth, dims[2] | 0);
    }
    offsetZ += rowDepth + spacing;
  }

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

// ─── Maze & Pathfinder ──────────────────────────────────────────────────────
// Node 1 carves a perfect maze (recursive backtracker, seeded) and emits BOTH
// the schematic and the raw grid; node 2 BFS-solves the grid and draws the
// shortest path in glowstone on a copy of the maze — data and geometry flowing
// side by side between blocks.

const MAZE_GEN_SOURCE = `type Inputs = {
  width: Slider<{ min: 5; max: 41; default: 21 }>;
  height: Slider<{ min: 5; max: 41; default: 21 }>;
  wall: Block<{ default: 'minecraft:stone_bricks' }>;
  seed: number;
};

type Outputs = {
  maze: Schematic;
  grid: number[][];
};

function mulberry32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(inputs) {
  // Odd dimensions so walls and corridors alternate cleanly.
  const w = inputs.width % 2 ? inputs.width : inputs.width + 1;
  const h = inputs.height % 2 ? inputs.height : inputs.height + 1;
  const rand = mulberry32(inputs.seed | 0 || 42);

  const grid = [];
  for (let z = 0; z < h; z++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(1);
    grid.push(row);
  }

  // Recursive backtracker (iterative): carve 2 cells at a time.
  const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const options = [];
    for (const [dx, dz] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx > 0 && nz > 0 && nx < w - 1 && nz < h - 1 && grid[nz][nx] === 1) {
        options.push([nx, nz, dx, dz]);
      }
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, nz, dx, dz] = options[Math.floor(rand() * options.length)];
    grid[nz][nx] = 0;
    grid[cz + dz / 2][cx + dx / 2] = 0;
    stack.push([nx, nz]);
  }

  const maze = new Schematic();
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      maze.set_block(x, 0, z, 'minecraft:polished_andesite');
      if (grid[z][x] === 1) {
        maze.set_block(x, 1, z, inputs.wall);
        maze.set_block(x, 2, z, inputs.wall);
      }
    }
  }

  return { maze, grid };
}
`;

const MAZE_GEN_CONTRACT: BlockContract = {
  inputs: {
    width: { kind: 'number', widget: 'slider', min: 5, max: 41, default: 21 },
    height: { kind: 'number', widget: 'slider', min: 5, max: 41, default: 21 },
    wall: { kind: 'block', default: 'minecraft:stone_bricks' },
    seed: { kind: 'number' },
  },
  outputs: {
    maze: { kind: 'schematic' },
    grid: { kind: 'list', of: { kind: 'list', of: { kind: 'number' } } },
  },
};

const MAZE_SOLVE_SOURCE = `type Inputs = {
  maze: Schematic;
  grid: number[][];
  marker: Block<{ default: 'minecraft:glowstone' }>;
};

type Outputs = {
  solved: Schematic;
  stats: { found: boolean; length: number; explored: number };
};

function generate(inputs) {
  const grid = inputs.grid || [];
  const h = grid.length;
  const w = h ? grid[0].length : 0;
  const goal = [w - 2, h - 2];

  // BFS from entrance to exit — shortest path in a perfect maze.
  const prev = new Map();
  const seen = new Set(['1,1']);
  const queue = [[1, 1]];
  let explored = 0;
  let found = false;
  while (queue.length) {
    const [x, z] = queue.shift();
    explored++;
    if (x === goal[0] && z === goal[1]) {
      found = true;
      break;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nz >= h || nx >= w) continue;
      const key = nx + ',' + nz;
      if (grid[nz][nx] !== 0 || seen.has(key)) continue;
      seen.add(key);
      prev.set(key, x + ',' + z);
      queue.push([nx, nz]);
    }
  }

  const solved = new Schematic();
  for (const b of inputs.maze.blocks()) {
    if (b.name === 'minecraft:air') continue;
    solved.set_block(b.x, b.y, b.z, b.name);
  }

  let length = 0;
  if (found) {
    let cursor = goal[0] + ',' + goal[1];
    while (cursor) {
      const [px, pz] = cursor.split(',').map(Number);
      solved.set_block(px, 1, pz, inputs.marker);
      length++;
      cursor = prev.get(cursor);
    }
  }

  return { solved, stats: { found: found, length: length, explored: explored } };
}
`;

const MAZE_SOLVE_CONTRACT: BlockContract = {
  inputs: {
    maze: { kind: 'schematic' },
    grid: { kind: 'list', of: { kind: 'list', of: { kind: 'number' } } },
    marker: { kind: 'block', default: 'minecraft:glowstone' },
  },
  outputs: {
    solved: { kind: 'schematic' },
    stats: {
      kind: 'object',
      fields: {
        found: { kind: 'boolean' },
        length: { kind: 'number' },
        explored: { kind: 'number' },
      },
    },
  },
};

export const MAZE_FLOW: FlowData = {
  id: 'example-maze-solver',
  name: 'Maze & Pathfinder',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'maze-size',
      type: 'input',
      position: { x: 0, y: 0 },
      data: {
        label: 'size',
        value: 25,
        dataType: 'number',
        widgetType: 'slider',
        min: 5,
        max: 41,
        step: 2,
        description: 'Maze width & height',
      },
    },
    {
      id: 'maze-seed',
      type: 'input',
      position: { x: 0, y: 180 },
      data: { label: 'seed', value: 7, dataType: 'number', widgetType: 'number' },
    },
    {
      id: 'maze-gen',
      type: 'code',
      position: { x: 320, y: 0 },
      data: {
        label: 'Maze Generator',
        code: MAZE_GEN_SOURCE,
        contract: MAZE_GEN_CONTRACT,
        io: contractToIO(MAZE_GEN_CONTRACT),
      },
    },
    {
      id: 'maze-solve',
      type: 'code',
      position: { x: 800, y: 60 },
      data: {
        label: 'Path Solver',
        code: MAZE_SOLVE_SOURCE,
        contract: MAZE_SOLVE_CONTRACT,
        io: contractToIO(MAZE_SOLVE_CONTRACT),
      },
    },
    {
      id: 'maze-view',
      type: 'viewer',
      position: { x: 1280, y: 0 },
      data: { label: 'Solved maze' },
    },
    {
      id: 'maze-stats',
      type: 'viewer',
      position: { x: 1280, y: 380 },
      data: { label: 'Search stats' },
    },
    {
      id: 'maze-out',
      type: 'output',
      position: { x: 1280, y: 600 },
      data: { label: 'solved' },
    },
  ],
  edges: [
    { id: 'me-w', source: 'maze-size', target: 'maze-gen', sourceHandle: 'output', targetHandle: 'width' },
    { id: 'me-h', source: 'maze-size', target: 'maze-gen', sourceHandle: 'output', targetHandle: 'height' },
    { id: 'me-s', source: 'maze-seed', target: 'maze-gen', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'me-m', source: 'maze-gen', target: 'maze-solve', sourceHandle: 'maze', targetHandle: 'maze' },
    { id: 'me-g', source: 'maze-gen', target: 'maze-solve', sourceHandle: 'grid', targetHandle: 'grid' },
    { id: 'me-v', source: 'maze-solve', target: 'maze-view', sourceHandle: 'solved', targetHandle: 'input' },
    { id: 'me-st', source: 'maze-solve', target: 'maze-stats', sourceHandle: 'stats', targetHandle: 'input' },
    { id: 'me-o', source: 'maze-solve', target: 'maze-out', sourceHandle: 'solved', targetHandle: 'input' },
  ],
};

// ─── Procedural City ────────────────────────────────────────────────────────
// A planner lays out road grid + building lots (a LIST OF OBJECTS — rendered
// as a table by the viewer), then a tower builder raises glass-banded towers
// on each lot. Skyline peaks toward the city center.

const CITY_PLAN_SOURCE = `type Inputs = {
  size: Slider<{ min: 32; max: 96; default: 64 }>;
  lot: Slider<{ min: 6; max: 16; default: 10 }>;
  density: Slider<{ min: 0.1; max: 1; step: 0.05; default: 0.75 }>;
  seed: number;
};

type Outputs = {
  lots: Array<{ x: number; z: number; w: number; d: number; floors: number }>;
  ground: Schematic;
};

function mulberry32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(inputs) {
  const size = inputs.size | 0;
  const lotSize = inputs.lot | 0;
  const rand = mulberry32(inputs.seed | 0 || 7);
  const pitch = lotSize + 1;

  const ground = new Schematic();
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const onRoad = x % pitch === 0 || z % pitch === 0;
      ground.set_block(x, 0, z, onRoad ? 'minecraft:gray_concrete' : 'minecraft:smooth_stone');
    }
  }

  const lots = [];
  const center = size / 2;
  for (let lx = 1; lx + lotSize <= size; lx += pitch) {
    for (let lz = 1; lz + lotSize <= size; lz += pitch) {
      if (rand() > inputs.density) continue;
      // Skyline: tall towers downtown, low-rise at the edges.
      const dist = Math.hypot(lx + lotSize / 2 - center, lz + lotSize / 2 - center);
      const skyline = Math.max(1, Math.round(9 * (1 - dist / (center * 1.5))));
      const floors = Math.max(1, Math.min(9, skyline + Math.floor(rand() * 3) - 1));
      lots.push({ x: lx + 1, z: lz + 1, w: lotSize - 2, d: lotSize - 2, floors: floors });
    }
  }

  return { lots, ground };
}
`;

const CITY_PLAN_CONTRACT: BlockContract = {
  inputs: {
    size: { kind: 'number', widget: 'slider', min: 32, max: 96, default: 64 },
    lot: { kind: 'number', widget: 'slider', min: 6, max: 16, default: 10 },
    density: { kind: 'number', widget: 'slider', min: 0.1, max: 1, step: 0.05, default: 0.75 },
    seed: { kind: 'number' },
  },
  outputs: {
    lots: {
      kind: 'list',
      of: {
        kind: 'object',
        fields: {
          x: { kind: 'number' },
          z: { kind: 'number' },
          w: { kind: 'number' },
          d: { kind: 'number' },
          floors: { kind: 'number' },
        },
      },
    },
    ground: { kind: 'schematic' },
  },
};

const CITY_BUILD_SOURCE = `type Inputs = {
  lots: Array<{ x: number; z: number; w: number; d: number; floors: number }>;
  ground: Schematic;
  wall: Block<{ default: 'minecraft:light_gray_concrete' }>;
  glass: Block<{ default: 'minecraft:cyan_stained_glass' }>;
};

type Outputs = {
  city: Schematic;
};

function generate(inputs) {
  const city = new Schematic();
  for (const b of inputs.ground.blocks()) {
    if (b.name === 'minecraft:air') continue;
    city.set_block(b.x, b.y, b.z, b.name);
  }

  for (const lot of inputs.lots || []) {
    const top = lot.floors * 4;
    for (let y = 1; y <= top; y++) {
      const band = y % 4 === 2 || y % 4 === 3; // window band on each floor
      for (let x = lot.x; x < lot.x + lot.w; x++) {
        for (let z = lot.z; z < lot.z + lot.d; z++) {
          const onEdgeX = x === lot.x || x === lot.x + lot.w - 1;
          const onEdgeZ = z === lot.z || z === lot.z + lot.d - 1;
          if (!onEdgeX && !onEdgeZ) continue;
          const corner = onEdgeX && onEdgeZ;
          const block = band && !corner && (x + z) % 2 === 0 ? inputs.glass : inputs.wall;
          city.set_block(x, y, z, block);
        }
      }
    }
    for (let x = lot.x; x < lot.x + lot.w; x++) {
      for (let z = lot.z; z < lot.z + lot.d; z++) {
        city.set_block(x, top + 1, z, 'minecraft:polished_andesite');
      }
    }
  }

  return { city };
}
`;

const CITY_BUILD_CONTRACT: BlockContract = {
  inputs: {
    lots: CITY_PLAN_CONTRACT.outputs.lots,
    ground: { kind: 'schematic' },
    wall: { kind: 'block', default: 'minecraft:light_gray_concrete' },
    glass: { kind: 'block', default: 'minecraft:cyan_stained_glass' },
  },
  outputs: {
    city: { kind: 'schematic' },
  },
};

export const CITY_FLOW: FlowData = {
  id: 'example-city',
  name: 'Procedural City',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'city-size',
      type: 'input',
      position: { x: 0, y: 0 },
      data: {
        label: 'size',
        value: 64,
        dataType: 'number',
        widgetType: 'slider',
        min: 32,
        max: 96,
        step: 1,
        description: 'City footprint',
      },
    },
    {
      id: 'city-density',
      type: 'input',
      position: { x: 0, y: 180 },
      data: {
        label: 'density',
        value: 0.75,
        dataType: 'number',
        widgetType: 'slider',
        min: 0.1,
        max: 1,
        step: 0.05,
        description: 'Built-lot probability',
      },
    },
    {
      id: 'city-seed',
      type: 'input',
      position: { x: 0, y: 360 },
      data: { label: 'seed', value: 7, dataType: 'number', widgetType: 'number' },
    },
    {
      id: 'city-plan',
      type: 'code',
      position: { x: 320, y: 60 },
      data: {
        label: 'City Planner',
        code: CITY_PLAN_SOURCE,
        contract: CITY_PLAN_CONTRACT,
        io: contractToIO(CITY_PLAN_CONTRACT),
      },
    },
    {
      id: 'city-build',
      type: 'code',
      position: { x: 800, y: 120 },
      data: {
        label: 'Tower Builder',
        code: CITY_BUILD_SOURCE,
        contract: CITY_BUILD_CONTRACT,
        io: contractToIO(CITY_BUILD_CONTRACT),
      },
    },
    {
      id: 'city-lots-table',
      type: 'viewer',
      position: { x: 800, y: 480 },
      data: { label: 'Zoning table' },
    },
    {
      id: 'city-view',
      type: 'viewer',
      position: { x: 1280, y: 60 },
      data: { label: 'Skyline' },
    },
    {
      id: 'city-out',
      type: 'output',
      position: { x: 1280, y: 520 },
      data: { label: 'city' },
    },
  ],
  edges: [
    { id: 'ce-s', source: 'city-size', target: 'city-plan', sourceHandle: 'output', targetHandle: 'size' },
    { id: 'ce-d', source: 'city-density', target: 'city-plan', sourceHandle: 'output', targetHandle: 'density' },
    { id: 'ce-r', source: 'city-seed', target: 'city-plan', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'ce-l', source: 'city-plan', target: 'city-build', sourceHandle: 'lots', targetHandle: 'lots' },
    { id: 'ce-g', source: 'city-plan', target: 'city-build', sourceHandle: 'ground', targetHandle: 'ground' },
    { id: 'ce-t', source: 'city-plan', target: 'city-lots-table', sourceHandle: 'lots', targetHandle: 'input' },
    { id: 'ce-v', source: 'city-build', target: 'city-view', sourceHandle: 'city', targetHandle: 'input' },
    { id: 'ce-o', source: 'city-build', target: 'city-out', sourceHandle: 'city', targetHandle: 'input' },
  ],
};

// ─── Terrain → Erosion → Analysis ───────────────────────────────────────────
// A three-stage pipeline: noise terrain (the workbench example as a node) →
// thermal erosion (schematic in, schematic out) → the build-analysis block
// fanning out into vec3 / table / image viewers.

const TERRAIN_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'parametric-terrain')!.source;
const ANALYSIS_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'build-analysis')!.source;

const TERRAIN_CONTRACT: BlockContract = {
  inputs: {
    width: { kind: 'number', widget: 'slider', min: 8, max: 256, default: 64 },
    depth: { kind: 'number', widget: 'slider', min: 8, max: 256, default: 64 },
    amplitude: { kind: 'number', widget: 'slider', min: 1, max: 64, default: 16 },
    scale: { kind: 'number', widget: 'slider', min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
    seed: { kind: 'number' },
    surface: { kind: 'block', default: 'minecraft:grass_block' },
  },
  outputs: {
    terrain: { kind: 'schematic' },
  },
};

const ANALYSIS_CONTRACT: BlockContract = {
  inputs: {
    schematic: { kind: 'schematic' },
  },
  outputs: {
    dimensions: { kind: 'vec3' },
    blockCounts: {
      kind: 'list',
      of: {
        kind: 'object',
        fields: { block: { kind: 'block' }, count: { kind: 'number' } },
      },
    },
    heatmap: { kind: 'image' },
  },
};

const ERODE_SOURCE = `type Inputs = {
  terrain: Schematic;
  iterations: Slider<{ min: 0; max: 60; default: 25 }>;
  talus: Slider<{ min: 1; max: 4; default: 1 }>;
};

type Outputs = {
  eroded: Schematic;
};

function generate(inputs) {
  // Read the heightmap (top block per column) out of the input schematic.
  const tops = new Map();
  let maxX = 0;
  let maxZ = 0;
  for (const b of inputs.terrain.blocks()) {
    if (b.name === 'minecraft:air') continue; // blocks() enumerates the full bounding box
    const key = b.x + ',' + b.z;
    const top = tops.get(key);
    if (!top || b.y > top.y) tops.set(key, { y: b.y, name: b.name });
    if (b.x > maxX) maxX = b.x;
    if (b.z > maxZ) maxZ = b.z;
  }
  const w = maxX + 1;
  const d = maxZ + 1;
  const height = [];
  const surface = [];
  for (let x = 0; x < w; x++) {
    height.push([]);
    surface.push([]);
    for (let z = 0; z < d; z++) {
      const top = tops.get(x + ',' + z);
      height[x].push(top ? top.y + 1 : 1);
      surface[x].push(top ? top.name : 'minecraft:grass_block');
    }
  }

  // Thermal erosion: steep slopes shed material onto their lowest neighbour.
  const talus = inputs.talus | 0 || 1;
  for (let it = 0; it < inputs.iterations; it++) {
    if (it % 2 === 0) Progress.report((it / inputs.iterations) * 100, 'erosion pass ' + it + '/' + inputs.iterations);
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        let lx = x;
        let lz = z;
        let lowest = height[x][z];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue;
          if (height[nx][nz] < lowest) {
            lowest = height[nx][nz];
            lx = nx;
            lz = nz;
          }
        }
        if (height[x][z] - lowest > talus) {
          height[x][z]--;
          height[lx][lz]++;
        }
      }
    }
  }

  const eroded = new Schematic();
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const h = Math.max(1, height[x][z]);
      for (let y = 0; y < h - 1; y++) eroded.set_block(x, y, z, 'minecraft:dirt');
      eroded.set_block(x, h - 1, z, surface[x][z]);
    }
  }

  return { eroded };
}
`;

const ERODE_CONTRACT: BlockContract = {
  inputs: {
    terrain: { kind: 'schematic' },
    iterations: { kind: 'number', widget: 'slider', min: 0, max: 60, default: 25 },
    talus: { kind: 'number', widget: 'slider', min: 1, max: 4, default: 1 },
  },
  outputs: {
    eroded: { kind: 'schematic' },
  },
};

export const TERRAIN_PIPELINE_FLOW: FlowData = {
  id: 'example-terrain-pipeline',
  name: 'Terrain → Erosion → Analysis',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'tp-amplitude',
      type: 'input',
      position: { x: 0, y: 0 },
      data: {
        label: 'amplitude',
        value: 22,
        dataType: 'number',
        widgetType: 'slider',
        min: 1,
        max: 64,
        step: 1,
        description: 'Mountain height',
      },
    },
    {
      id: 'tp-seed',
      type: 'input',
      position: { x: 0, y: 180 },
      data: { label: 'seed', value: 3, dataType: 'number', widgetType: 'number' },
    },
    {
      id: 'tp-iterations',
      type: 'input',
      position: { x: 0, y: 340 },
      data: {
        label: 'iterations',
        value: 25,
        dataType: 'number',
        widgetType: 'slider',
        min: 0,
        max: 60,
        step: 1,
        description: 'Erosion passes',
      },
    },
    {
      id: 'tp-terrain',
      type: 'code',
      position: { x: 300, y: 20 },
      data: {
        label: 'Terrain',
        code: TERRAIN_SOURCE,
        contract: TERRAIN_CONTRACT,
        io: contractToIO(TERRAIN_CONTRACT),
      },
    },
    {
      id: 'tp-erode',
      type: 'code',
      position: { x: 760, y: 80 },
      data: {
        label: 'Thermal Erosion',
        code: ERODE_SOURCE,
        contract: ERODE_CONTRACT,
        io: contractToIO(ERODE_CONTRACT),
      },
    },
    {
      id: 'tp-analyze',
      type: 'code',
      position: { x: 1220, y: 300 },
      data: {
        label: 'Build Analysis',
        code: ANALYSIS_SOURCE,
        contract: ANALYSIS_CONTRACT,
        io: contractToIO(ANALYSIS_CONTRACT),
      },
    },
    {
      id: 'tp-eroded-view',
      type: 'viewer',
      position: { x: 1220, y: -60 },
      data: { label: 'Eroded terrain' },
    },
    {
      id: 'tp-heatmap-view',
      type: 'viewer',
      position: { x: 1700, y: 160 },
      data: { label: 'Density heatmap' },
    },
    {
      id: 'tp-counts-view',
      type: 'viewer',
      position: { x: 1700, y: 520 },
      data: { label: 'Block counts' },
    },
    {
      id: 'tp-out',
      type: 'output',
      position: { x: 1700, y: -40 },
      data: { label: 'terrain' },
    },
  ],
  edges: [
    { id: 'te-a', source: 'tp-amplitude', target: 'tp-terrain', sourceHandle: 'output', targetHandle: 'amplitude' },
    { id: 'te-s', source: 'tp-seed', target: 'tp-terrain', sourceHandle: 'output', targetHandle: 'seed' },
    { id: 'te-t', source: 'tp-terrain', target: 'tp-erode', sourceHandle: 'terrain', targetHandle: 'terrain' },
    { id: 'te-i', source: 'tp-iterations', target: 'tp-erode', sourceHandle: 'output', targetHandle: 'iterations' },
    { id: 'te-e', source: 'tp-erode', target: 'tp-analyze', sourceHandle: 'eroded', targetHandle: 'schematic' },
    { id: 'te-ev', source: 'tp-erode', target: 'tp-eroded-view', sourceHandle: 'eroded', targetHandle: 'input' },
    { id: 'te-hv', source: 'tp-analyze', target: 'tp-heatmap-view', sourceHandle: 'heatmap', targetHandle: 'input' },
    { id: 'te-cv', source: 'tp-analyze', target: 'tp-counts-view', sourceHandle: 'blockCounts', targetHandle: 'input' },
    { id: 'te-o', source: 'tp-erode', target: 'tp-out', sourceHandle: 'eroded', targetHandle: 'input' },
  ],
};

// ─── Redstone Logic Lab ─────────────────────────────────────────────────────
// One block builds a REAL redstone gate and simulates it with MCHPRS (inside
// nucleation): levers are toggled through every combination and the output is
// probed each time. The viewer shows the measured truth table; the circuit
// viewer shows the live world state.

const LOGIC_LAB_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'logic-lab')!.source;

const LOGIC_LAB_CONTRACT: BlockContract = {
  inputs: {
    gate: { kind: 'enum', options: ['and', 'nand', 'or', 'not'] },
  },
  outputs: {
    circuit: { kind: 'schematic' },
    truthTable: {
      kind: 'list',
      of: {
        kind: 'object',
        fields: {
          a: { kind: 'boolean' },
          b: { kind: 'boolean' },
          out: { kind: 'boolean' },
        },
      },
    },
  },
};

export const LOGIC_LAB_FLOW: FlowData = {
  id: 'example-logic-lab',
  name: 'Redstone Logic Lab',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'gate-select',
      type: 'input',
      position: { x: 0, y: 60 },
      data: {
        label: 'gate',
        value: 'and',
        dataType: 'string',
        widgetType: 'select',
        options: ['and', 'nand', 'or', 'not'],
        description: 'Which gate to build & simulate',
      },
    },
    {
      id: 'lab',
      type: 'code',
      position: { x: 300, y: 0 },
      data: {
        label: 'Logic Lab',
        code: LOGIC_LAB_SOURCE,
        contract: LOGIC_LAB_CONTRACT,
        io: contractToIO(LOGIC_LAB_CONTRACT),
      },
    },
    {
      id: 'truth-view',
      type: 'viewer',
      position: { x: 800, y: 320 },
      data: { label: 'Measured truth table' },
    },
    {
      id: 'circuit-view',
      type: 'viewer',
      position: { x: 800, y: -40 },
      data: { label: 'Live circuit' },
    },
    {
      id: 'circuit-out',
      type: 'output',
      position: { x: 800, y: 620 },
      data: { label: 'circuit' },
    },
  ],
  edges: [
    { id: 'll-g', source: 'gate-select', target: 'lab', sourceHandle: 'output', targetHandle: 'gate' },
    { id: 'll-t', source: 'lab', target: 'truth-view', sourceHandle: 'truthTable', targetHandle: 'input' },
    { id: 'll-c', source: 'lab', target: 'circuit-view', sourceHandle: 'circuit', targetHandle: 'input' },
    { id: 'll-o', source: 'lab', target: 'circuit-out', sourceHandle: 'circuit', targetHandle: 'input' },
  ],
};

// ─── Build Report ───────────────────────────────────────────────────────────
// One generator fans out into three analysis/export blocks: census (table with
// chart/CSV export), build analysis (heatmap + dimensions), and the hologram
// mcfunction (downloadable). The automated-report pattern: generate → analyze
// → export, all driven by sliders.

const BUILDING_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'parametric-building')!.source;
const CENSUS_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'block-census')!.source;
const HOLOGRAM_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'hologram-mcfunction')!.source;

export const BUILD_REPORT_FLOW: FlowData = {
  id: 'example-build-report',
  name: 'Build Report',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'br-floors',
      type: 'input',
      position: { x: 0, y: 0 },
      data: {
        label: 'floors',
        value: 6,
        dataType: 'number',
        widgetType: 'slider',
        min: 1,
        max: 32,
        step: 1,
      },
    },
    {
      id: 'br-roof',
      type: 'input',
      position: { x: 0, y: 170 },
      data: {
        label: 'roof',
        value: 'gable',
        dataType: 'string',
        widgetType: 'select',
        options: ['flat', 'gable', 'pyramid'],
      },
    },
    {
      id: 'br-building',
      type: 'code',
      position: { x: 300, y: 20 },
      data: {
        label: 'Building',
        code: BUILDING_SOURCE,
        contract: EXAMPLE_BLOCK_CONTRACTS['parametric-building'],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS['parametric-building']),
      },
    },
    {
      id: 'br-census',
      type: 'code',
      position: { x: 800, y: -120 },
      data: {
        label: 'Block Census',
        code: CENSUS_SOURCE,
        contract: EXAMPLE_BLOCK_CONTRACTS['block-census'],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS['block-census']),
      },
    },
    {
      id: 'br-analysis',
      type: 'code',
      position: { x: 800, y: 240 },
      data: {
        label: 'Build Analysis',
        code: EXAMPLE_BLOCKS.find((b) => b.id === 'build-analysis')!.source,
        contract: EXAMPLE_BLOCK_CONTRACTS['build-analysis'],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS['build-analysis']),
      },
    },
    {
      id: 'br-hologram',
      type: 'code',
      position: { x: 800, y: 600 },
      data: {
        label: 'Hologram',
        code: HOLOGRAM_SOURCE,
        contract: EXAMPLE_BLOCK_CONTRACTS['hologram-mcfunction'],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS['hologram-mcfunction']),
      },
    },
    {
      id: 'br-building-view',
      type: 'viewer',
      position: { x: 300, y: 420 },
      data: { label: 'Building' },
    },
    {
      id: 'br-census-view',
      type: 'viewer',
      position: { x: 1300, y: -160 },
      data: { label: 'Census (chart/CSV export)' },
    },
    {
      id: 'br-heatmap-view',
      type: 'viewer',
      position: { x: 1300, y: 240 },
      data: { label: 'Density heatmap' },
    },
    {
      id: 'br-holo-view',
      type: 'viewer',
      position: { x: 1300, y: 600 },
      data: { label: 'mcfunction (download)' },
    },
    {
      id: 'br-csv-out',
      type: 'output',
      position: { x: 1300, y: 60 },
      data: { label: 'census_csv' },
    },
    {
      id: 'br-holo-out',
      type: 'output',
      position: { x: 1300, y: 900 },
      data: { label: 'hologram_mcfunction' },
    },
  ],
  edges: [
    { id: 'br-f', source: 'br-floors', target: 'br-building', sourceHandle: 'output', targetHandle: 'floors' },
    { id: 'br-r', source: 'br-roof', target: 'br-building', sourceHandle: 'output', targetHandle: 'roof' },
    { id: 'br-b1', source: 'br-building', target: 'br-census', sourceHandle: 'building', targetHandle: 'schematic' },
    { id: 'br-b2', source: 'br-building', target: 'br-analysis', sourceHandle: 'building', targetHandle: 'schematic' },
    { id: 'br-b3', source: 'br-building', target: 'br-hologram', sourceHandle: 'building', targetHandle: 'schematic' },
    { id: 'br-bv', source: 'br-building', target: 'br-building-view', sourceHandle: 'building', targetHandle: 'input' },
    { id: 'br-cv', source: 'br-census', target: 'br-census-view', sourceHandle: 'rows', targetHandle: 'input' },
    { id: 'br-hv', source: 'br-analysis', target: 'br-heatmap-view', sourceHandle: 'heatmap', targetHandle: 'input' },
    { id: 'br-mv', source: 'br-hologram', target: 'br-holo-view', sourceHandle: 'mcfunction', targetHandle: 'input' },
    { id: 'br-co', source: 'br-census', target: 'br-csv-out', sourceHandle: 'csv', targetHandle: 'input' },
    { id: 'br-mo', source: 'br-hologram', target: 'br-holo-out', sourceHandle: 'mcfunction', targetHandle: 'input' },
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
  ],
};

/**
 * Schemati Browser — talks to the host platform: search schematics by tag,
 * download the top hit, and inspect it. The Schemati ambient rides the page
 * session in the browser and SCHEMATI_URL/SCHEMATI_API_TOKEN on the server,
 * so the same flow works in the editor, tool mode, and the API.
 */
const SCHEMATI_SEARCH_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'schemati-search')!.source;
const SCHEMATI_FETCH_SOURCE = EXAMPLE_BLOCKS.find((b) => b.id === 'schemati-fetch')!.source;
const SCHEMATI_SEARCH_CONTRACT = EXAMPLE_BLOCK_CONTRACTS['schemati-search'];
const SCHEMATI_FETCH_CONTRACT = EXAMPLE_BLOCK_CONTRACTS['schemati-fetch'];

export const SCHEMATI_BROWSER_FLOW: FlowData = {
  id: 'example-schemati-browser',
  name: 'Schemati Browser',
  version: '1.0.0',
  createdAt: 0,
  nodes: [
    {
      id: 'sb-tag',
      type: 'input',
      position: { x: 0, y: 0 },
      data: {
        label: 'tag',
        value: 'door',
        dataType: 'string',
        widgetType: 'text',
        description: 'Platform tag name to filter by',
      },
    },
    {
      id: 'sb-limit',
      type: 'input',
      position: { x: 0, y: 160 },
      data: {
        label: 'limit',
        value: 10,
        dataType: 'number',
        widgetType: 'slider',
        min: 1,
        max: 50,
        step: 1,
      },
    },
    {
      id: 'sb-search',
      type: 'code',
      position: { x: 320, y: 0 },
      data: {
        label: 'Schemati Search',
        code: SCHEMATI_SEARCH_SOURCE,
        contract: SCHEMATI_SEARCH_CONTRACT,
        io: contractToIO(SCHEMATI_SEARCH_CONTRACT),
      },
    },
    {
      id: 'sb-results-viewer',
      type: 'viewer',
      position: { x: 800, y: 260 },
      data: { label: 'Search results', isResizable: true },
    },
    {
      id: 'sb-fetch',
      type: 'code',
      position: { x: 800, y: 0 },
      data: {
        label: 'Schemati Fetch',
        code: SCHEMATI_FETCH_SOURCE,
        contract: SCHEMATI_FETCH_CONTRACT,
        io: contractToIO(SCHEMATI_FETCH_CONTRACT),
      },
    },
    {
      id: 'sb-preview',
      type: 'viewer',
      position: { x: 1260, y: 0 },
      data: { label: 'Top match', isResizable: true },
    },
    {
      id: 'sb-out',
      type: 'output',
      position: { x: 1260, y: 380 },
      data: { label: 'schematic' },
    },
  ],
  edges: [
    { id: 'sb-e1', source: 'sb-tag', target: 'sb-search', sourceHandle: 'output', targetHandle: 'tag' },
    { id: 'sb-e2', source: 'sb-limit', target: 'sb-search', sourceHandle: 'output', targetHandle: 'limit' },
    { id: 'sb-e3', source: 'sb-search', target: 'sb-results-viewer', sourceHandle: 'results', targetHandle: 'input' },
    { id: 'sb-e4', source: 'sb-search', target: 'sb-fetch', sourceHandle: 'firstId', targetHandle: 'id' },
    { id: 'sb-e5', source: 'sb-fetch', target: 'sb-preview', sourceHandle: 'schematic', targetHandle: 'input' },
    { id: 'sb-e6', source: 'sb-fetch', target: 'sb-out', sourceHandle: 'schematic', targetHandle: 'input' },
  ],
};

export const EXAMPLE_FLOWS: FlowData[] = [
  JULIA_STITCH_FLOW,
  MAZE_FLOW,
  CITY_FLOW,
  TERRAIN_PIPELINE_FLOW,
  LOGIC_LAB_FLOW,
  BUILD_REPORT_FLOW,
  WORLDGEN_FLOW,
  SCHEMATI_BROWSER_FLOW,
];
