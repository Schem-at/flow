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
