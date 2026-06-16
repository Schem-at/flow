type Inputs = {
  width: Slider<{ min: 5; max: 41; default: 21 }>;
  height: Slider<{ min: 5; max: 41; default: 21 }>;
  wall: Block<{ default: 'minecraft:stone_bricks' }>;
  seed: number;
};

type Outputs = {
  maze: Schematic;
  grid: number[][];
};

function generate(inputs) {
  // Odd dimensions so walls and corridors alternate cleanly.
  const w = inputs.width % 2 ? inputs.width : inputs.width + 1;
  const h = inputs.height % 2 ? inputs.height : inputs.height + 1;
  // Random.seeded is the shared deterministic mulberry32 PRNG.
  const rand = Random.seeded(inputs.seed | 0 || 42);

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
    const [nx, nz, dx, dz] = Random.pick(options, rand);
    grid[nz][nx] = 0;
    grid[cz + dz / 2][cx + dx / 2] = 0;
    stack.push([nx, nz]);
  }

  const maze = new Schematic();
  // Floor is a solid plane; walls rise two blocks per filled cell.
  maze.fillPlane(0, 0, w - 1, h - 1, 0, 'minecraft:polished_andesite');
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (grid[z][x] === 1) maze.fillColumn(x, z, 1, 2, inputs.wall);
    }
  }

  return { maze, grid };
}
