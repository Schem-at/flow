type Inputs = {
  terrain: Schematic;
  iterations: Slider<{ min: 0; max: 60; default: 25 }>;
  talus: Slider<{ min: 1; max: 4; default: 1 }>;
};

type Outputs = {
  eroded: Schematic;
};

function generate(inputs) {
  // heightmap() returns the top block y (or -1) and its name per [x][z] column.
  const map = inputs.terrain.heightmap();
  const w = map.height.length;
  const d = w ? map.height[0].length : 0;
  const height = [];
  const surface = [];
  for (let x = 0; x < w; x++) {
    height.push([]);
    surface.push([]);
    for (let z = 0; z < d; z++) {
      const topY = map.height[x][z];
      // Column height = topY + 1 (1 for empty columns), surface defaults to grass.
      height[x].push(topY >= 0 ? topY + 1 : 1);
      surface[x].push(topY >= 0 ? map.surface[x][z] : 'minecraft:grass_block');
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
      // Dirt body up to h-2 (fillColumn is inclusive), surface block on top.
      if (h > 1) eroded.fillColumn(x, z, 0, h - 2, 'minecraft:dirt');
      eroded.set_block(x, h - 1, z, surface[x][z]);
    }
  }

  return { eroded };
}
