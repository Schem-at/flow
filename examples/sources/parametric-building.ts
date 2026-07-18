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
