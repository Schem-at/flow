/**
 * Grid — a small 2D integer-indexed grid helper for procedural nodes
 * (mazes, cellular automata, pathfinding scaffolds). Replaces the hand-rolled
 * `for/push` allocation, `"x,z"` string-key Maps, neighbour walks, bounds
 * checks and grid BFS that recur across the example blocks.
 *
 * Grids are plain `T[][]` indexed `[x][z]` so they interop with Field/number[][]
 * and with the schematic axes (x = width, z = depth).
 */

export type Grid<T> = T[][];

export interface Cell {
  x: number;
  z: number;
}

const N4: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export const GridOps = {
  /** Allocate a width×height grid, filled with `value` or `fn(x, z)`. */
  create<T>(width: number, height: number, value: T | ((x: number, z: number) => T)): Grid<T> {
    const fn = typeof value === 'function' ? (value as (x: number, z: number) => T) : () => value;
    const grid: Grid<T> = new Array(width);
    for (let x = 0; x < width; x++) {
      const col = new Array<T>(height);
      for (let z = 0; z < height; z++) col[z] = fn(x, z);
      grid[x] = col;
    }
    return grid;
  },

  width(grid: Grid<unknown>): number {
    return grid.length;
  },

  height(grid: Grid<unknown>): number {
    return grid[0]?.length ?? 0;
  },

  inBounds(grid: Grid<unknown>, x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < grid.length && z < (grid[0]?.length ?? 0);
  },

  /** In-bounds 4-neighbours of (x, z). */
  neighbors4(grid: Grid<unknown>, x: number, z: number): Cell[] {
    const out: Cell[] = [];
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (GridOps.inBounds(grid, nx, nz)) out.push({ x: nx, z: nz });
    }
    return out;
  },

  /** In-bounds 8-neighbours of (x, z). */
  neighbors8(grid: Grid<unknown>, x: number, z: number): Cell[] {
    const out: Cell[] = [];
    for (const [dx, dz] of N8) {
      const nx = x + dx, nz = z + dz;
      if (GridOps.inBounds(grid, nx, nz)) out.push({ x: nx, z: nz });
    }
    return out;
  },

  forEach<T>(grid: Grid<T>, fn: (value: T, x: number, z: number) => void): void {
    for (let x = 0; x < grid.length; x++)
      for (let z = 0; z < grid[x].length; z++) fn(grid[x][z], x, z);
  },

  map<T, R>(grid: Grid<T>, fn: (value: T, x: number, z: number) => R): Grid<R> {
    return grid.map((col, x) => col.map((v, z) => fn(v, x, z)));
  },

  /**
   * Shortest 4-connected path from start to goal over passable cells.
   * `passable(x, z)` decides traversability. Returns the path (inclusive of
   * both ends) or null if unreachable.
   */
  bfs(
    grid: Grid<unknown>,
    start: Cell,
    goal: Cell,
    passable: (x: number, z: number) => boolean
  ): Cell[] | null {
    const key = (x: number, z: number) => x * 0x40000 + z;
    const startK = key(start.x, start.z);
    const goalK = key(goal.x, goal.z);
    const prev = new Map<number, number>();
    const seen = new Set<number>([startK]);
    let frontier: Cell[] = [start];

    while (frontier.length) {
      const next: Cell[] = [];
      for (const cell of frontier) {
        if (key(cell.x, cell.z) === goalK) {
          // reconstruct
          const path: Cell[] = [];
          let k: number | undefined = goalK;
          while (k !== undefined) {
            path.push({ x: Math.floor(k / 0x40000), z: k % 0x40000 });
            k = prev.get(k);
          }
          return path.reverse();
        }
        for (const n of GridOps.neighbors4(grid, cell.x, cell.z)) {
          const nk = key(n.x, n.z);
          if (seen.has(nk) || !passable(n.x, n.z)) continue;
          seen.add(nk);
          prev.set(nk, key(cell.x, cell.z));
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  },
} as const;
