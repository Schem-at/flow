/**
 * Deterministic top-down preview of a schematic as PNG bytes: highest
 * non-air block per column, colored by a block-name hash and shaded by
 * height. Pure JS so uploads can attach a preview from any environment.
 */

import { encodePng } from './png.js';

interface BlockLike {
  x: number;
  y: number;
  z: number;
  name: string;
}

interface SchematicLike {
  blocks(): Iterable<BlockLike>;
}

/** Stable name → vivid-ish RGB (same block always gets the same color). */
function blockColor(name: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return [80 + (h % 156), 80 + ((h >>> 8) % 156), 80 + ((h >>> 16) % 156)];
}

export function schematicPreviewPng(schematic: SchematicLike, maxSize = 256): Uint8Array {
  // Top-down heightfield: keep the highest non-air block per (x, z).
  const top = new Map<string, { y: number; name: string }>();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const block of schematic.blocks()) {
    if (block.name === 'minecraft:air') continue;
    if (block.x < minX) minX = block.x;
    if (block.x > maxX) maxX = block.x;
    if (block.z < minZ) minZ = block.z;
    if (block.z > maxZ) maxZ = block.z;
    if (block.y < minY) minY = block.y;
    if (block.y > maxY) maxY = block.y;
    const key = `${block.x},${block.z}`;
    const current = top.get(key);
    if (!current || block.y > current.y) top.set(key, { y: block.y, name: block.name });
  }

  if (!top.size) {
    // Empty schematic: a single dark pixel beats a hard failure.
    return encodePng(1, 1, new Uint8Array([20, 20, 24, 255]));
  }

  const cols = maxX - minX + 1;
  const rows = maxZ - minZ + 1;
  const scale = Math.max(1, Math.ceil(Math.max(cols, rows) / maxSize));
  const upscale = Math.max(1, Math.floor(maxSize / Math.max(cols, rows)));
  const width = Math.ceil(cols / scale) * upscale;
  const height = Math.ceil(rows / scale) * upscale;
  const heightRange = Math.max(1, maxY - minY);

  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const bx = minX + Math.floor((px / upscale) * scale);
      const bz = minZ + Math.floor((py / upscale) * scale);
      const cell = top.get(`${bx},${bz}`);
      const i = (py * width + px) * 4;
      if (!cell) {
        rgba[i] = 20; rgba[i + 1] = 20; rgba[i + 2] = 24; rgba[i + 3] = 255;
        continue;
      }
      const [r, g, b] = blockColor(cell.name);
      // Height shading: lower blocks darker, peaks at full brightness.
      const shade = 0.55 + 0.45 * ((cell.y - minY) / heightRange);
      rgba[i] = Math.round(r * shade);
      rgba[i + 1] = Math.round(g * shade);
      rgba[i + 2] = Math.round(b * shade);
      rgba[i + 3] = 255;
    }
  }

  return encodePng(width, height, rgba);
}
