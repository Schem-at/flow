type Inputs = {
  size: Slider<{ min: 32; max: 96; default: 64 }>;
  lot: Slider<{ min: 6; max: 16; default: 10 }>;
  density: Slider<{ min: 0.1; max: 1; step: 0.05; default: 0.75 }>;
  seed: number;
};

type Outputs = {
  lots: Array<{ x: number; z: number; w: number; d: number; floors: number }>;
  ground: Schematic;
};

function generate(inputs) {
  const size = inputs.size | 0;
  const lotSize = inputs.lot | 0;
  const rand = Random.seeded(inputs.seed | 0 || 7);
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
