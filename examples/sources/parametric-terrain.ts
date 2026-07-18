function sampleNoise(x, z, scale, seed) {
  if (typeof Noise !== 'undefined' && typeof Noise.perlin2 === 'function') {
    return Noise.perlin2(x * scale + seed, z * scale + seed);
  }
  // Fallback when no noise provider is available.
  return Math.sin((x + seed) * scale) * Math.cos((z + seed) * scale);
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
