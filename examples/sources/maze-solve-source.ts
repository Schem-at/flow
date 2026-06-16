type Inputs = {
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

  // clone() copies every non-air block — no manual block-by-block loop needed.
  const solved = inputs.maze.clone();

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
