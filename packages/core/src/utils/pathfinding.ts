/**
 * Pathfinding utilities for schematic navigation
 */

import type { SchematicWrapper } from './schematic.js';
import { Vec3 } from './vector.js';

export interface PathfindingOptions {
  /** Custom function to determine if a block is walkable */
  isWalkable?: (x: number, y: number, z: number, schematic: SchematicWrapper) => boolean;
  /** List of block types considered walkable (default: ['minecraft:air']) */
  walkableBlocks?: string[];
  /** Maximum number of nodes to explore (prevents infinite loops) */
  maxIterations?: number;
  /** Whether to allow diagonal movement */
  allowDiagonal?: boolean;
}

export interface PathResult {
  path: Vec3[];
  cost: number;
  explored: number;
}

/**
 * Priority queue implementation for A* pathfinding
 */
class PriorityQueue<T> {
  private items: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number): void {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    return this.items.shift()?.item;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  get size(): number {
    return this.items.length;
  }
}

/**
 * Pathfinding utilities
 */
export const Pathfinding = {
  /**
   * Finds the shortest path between two points within a schematic using A*.
   * @param schematic - The schematic object with a get_block method.
   * @param startPos - The starting position.
   * @param endPos - The ending position.
   * @param options - Optional settings.
   * @returns A path of Vec3 coordinates, or null if no path found.
   */
  findPath(
    schematic: SchematicWrapper,
    startPos: Vec3 | { x: number; y: number; z: number },
    endPos: Vec3 | { x: number; y: number; z: number },
    options: PathfindingOptions = {}
  ): PathResult | null {
    if (!schematic || !startPos || !endPos) {
      console.error('Pathfinding.findPath requires a schematic, start, and end position.');
      return null;
    }

    const {
      walkableBlocks = ['minecraft:air'],
      maxIterations = 100000,
      allowDiagonal = false,
    } = options;

    const isWalkable = options.isWalkable || ((x: number, y: number, z: number, schem: SchematicWrapper) => {
      const block = schem.get_block(x, y, z);
      return block !== null && walkableBlocks.includes(block);
    });

    const start = startPos instanceof Vec3 ? startPos : Vec3.from(startPos.x, startPos.y, startPos.z);
    const end = endPos instanceof Vec3 ? endPos : Vec3.from(endPos.x, endPos.y, endPos.z);

    // Direction vectors for neighbors
    const directions: Vec3[] = [
      Vec3.from(0, 1, 0),  // up
      Vec3.from(0, -1, 0), // down
      Vec3.from(0, 0, 1),  // south
      Vec3.from(0, 0, -1), // north
      Vec3.from(1, 0, 0),  // east
      Vec3.from(-1, 0, 0), // west
    ];

    if (allowDiagonal) {
      // Add diagonal directions
      directions.push(
        Vec3.from(1, 0, 1),
        Vec3.from(1, 0, -1),
        Vec3.from(-1, 0, 1),
        Vec3.from(-1, 0, -1),
        Vec3.from(1, 1, 0),
        Vec3.from(-1, 1, 0),
        Vec3.from(0, 1, 1),
        Vec3.from(0, 1, -1),
        Vec3.from(1, -1, 0),
        Vec3.from(-1, -1, 0),
        Vec3.from(0, -1, 1),
        Vec3.from(0, -1, -1),
      );
    }

    // A* implementation
    const openSet = new PriorityQueue<string>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const startKey = start.toKey();
    const endKey = end.toKey();

    gScore.set(startKey, 0);
    fScore.set(startKey, start.manhattanDistanceTo(end));
    openSet.enqueue(startKey, fScore.get(startKey)!);

    const closedSet = new Set<string>();
    let iterations = 0;

    while (!openSet.isEmpty() && iterations < maxIterations) {
      iterations++;
      const currentKey = openSet.dequeue()!;

      if (currentKey === endKey) {
        // Reconstruct path
        const path: Vec3[] = [];
        let current = currentKey;
        
        while (current) {
          path.unshift(Vec3.fromKey(current));
          current = cameFrom.get(current)!;
        }

        return {
          path,
          cost: gScore.get(endKey)!,
          explored: closedSet.size,
        };
      }

      closedSet.add(currentKey);
      const current = Vec3.fromKey(currentKey);

      for (const dir of directions) {
        const neighborPos = current.clone().add(dir);
        const neighborKey = neighborPos.toKey();

        if (closedSet.has(neighborKey)) continue;
        if (!isWalkable(neighborPos.x, neighborPos.y, neighborPos.z, schematic)) continue;

        const tentativeG = gScore.get(currentKey)! + dir.length();

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)!) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + neighborPos.manhattanDistanceTo(end);
          fScore.set(neighborKey, f);
          openSet.enqueue(neighborKey, f);
        }
      }
    }

    // No path found
    return null;
  },

  /**
   * Check if there's a direct line of sight between two points
   */
  hasLineOfSight(
    schematic: SchematicWrapper,
    from: Vec3 | { x: number; y: number; z: number },
    to: Vec3 | { x: number; y: number; z: number },
    options: { walkableBlocks?: string[] } = {}
  ): boolean {
    const { walkableBlocks = ['minecraft:air'] } = options;
    
    const start = from instanceof Vec3 ? from : Vec3.from(from.x, from.y, from.z);
    const end = to instanceof Vec3 ? to : Vec3.from(to.x, to.y, to.z);
    
    // Bresenham's line algorithm in 3D
    let x = Math.floor(start.x);
    let y = Math.floor(start.y);
    let z = Math.floor(start.z);
    
    const endX = Math.floor(end.x);
    const endY = Math.floor(end.y);
    const endZ = Math.floor(end.z);
    
    const dx = Math.abs(endX - x);
    const dy = Math.abs(endY - y);
    const dz = Math.abs(endZ - z);
    
    const steps = Math.max(dx, dy, dz);
    
    for (let i = 0; i <= steps; i++) {
      const block = schematic.get_block(x, y, z);
      if (block === null || !walkableBlocks.includes(block)) {
        return false;
      }
      
      const t = i / steps;
      x = Math.floor(start.x + t * (end.x - start.x));
      y = Math.floor(start.y + t * (end.y - start.y));
      z = Math.floor(start.z + t * (end.z - start.z));
    }
    
    return true;
  },

  /**
   * Get all neighbors of a position that are walkable
   */
  getWalkableNeighbors(
    schematic: SchematicWrapper,
    pos: Vec3 | { x: number; y: number; z: number },
    options: PathfindingOptions = {}
  ): Vec3[] {
    const {
      walkableBlocks = ['minecraft:air'],
    } = options;

    const isWalkable = options.isWalkable || ((x: number, y: number, z: number, schem: SchematicWrapper) => {
      const block = schem.get_block(x, y, z);
      return block !== null && walkableBlocks.includes(block);
    });

    const position = pos instanceof Vec3 ? pos : Vec3.from(pos.x, pos.y, pos.z);
    const neighbors: Vec3[] = [];

    const directions = [
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
      [1, 0, 0], [-1, 0, 0],
    ];

    for (const [dx, dy, dz] of directions) {
      const nx = position.x + dx;
      const ny = position.y + dy;
      const nz = position.z + dz;
      
      if (isWalkable(nx, ny, nz, schematic)) {
        neighbors.push(Vec3.from(nx, ny, nz));
      }
    }

    return neighbors;
  },
} as const;

export type PathfindingType = typeof Pathfinding;

