type Inputs = {
  lots: Array<{ x: number; z: number; w: number; d: number; floors: number }>;
  ground: Schematic;
  wall: Block<{ default: 'minecraft:light_gray_concrete' }>;
  glass: Block<{ default: 'minecraft:cyan_stained_glass' }>;
};

type Outputs = {
  city: Schematic;
};

function generate(inputs) {
  // Start from a copy of the road grid, then raise towers on each lot.
  const city = inputs.ground.clone();

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
    // Flat roof slab over the whole lot footprint.
    city.fillPlane(lot.x, lot.z, lot.x + lot.w - 1, lot.z + lot.d - 1, top + 1, 'minecraft:polished_andesite');
  }

  return { city };
}
