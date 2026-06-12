import { describe, it, expect } from 'vitest';
import { encodePng } from './png.js';
import { schematicPreviewPng } from './schematic-preview.js';

/** Parse PNG chunks: [{type, data}] — throws on malformed framing. */
function chunks(png: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: Array<{ type: string; data: Uint8Array }> = [];
  let offset = 8;
  while (offset < png.length) {
    const len = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3];
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    out.push({ type, data: png.slice(offset + 8, offset + 8 + len) });
    offset += 12 + len; // len + type + data + crc
  }
  expect(offset).toBe(png.length);
  return out;
}

/** Inflate a stored-blocks-only zlib stream (mirrors the encoder's format). */
function inflateStored(z: Uint8Array): Uint8Array {
  const parts: number[] = [];
  let offset = 2; // skip CMF/FLG
  for (;;) {
    const final = z[offset] & 1;
    const len = z[offset + 1] | (z[offset + 2] << 8);
    offset += 5;
    parts.push(...z.slice(offset, offset + len));
    offset += len;
    if (final) break;
  }
  return new Uint8Array(parts);
}

describe('encodePng', () => {
  it('produces valid framing with IHDR/IDAT/IEND', () => {
    const png = encodePng(2, 2, new Uint8Array(16).fill(128));
    const parsed = chunks(png);
    expect(parsed.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = parsed[0].data;
    expect((ihdr[0] << 24) | (ihdr[1] << 16) | (ihdr[2] << 8) | ihdr[3]).toBe(2); // width
    expect((ihdr[4] << 24) | (ihdr[5] << 16) | (ihdr[6] << 8) | ihdr[7]).toBe(2); // height
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // RGBA
  });

  it('round-trips pixel data through the stored zlib stream', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]);
    const png = encodePng(2, 2, rgba);
    const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = inflateStored(idat);
    // Two scanlines, each: filter byte 0 + 8 pixel bytes.
    expect(raw.length).toBe(2 * 9);
    expect(raw[0]).toBe(0);
    expect(Array.from(raw.slice(1, 9))).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect(raw[9]).toBe(0);
    expect(Array.from(raw.slice(10, 18))).toEqual([0, 0, 255, 255, 9, 9, 9, 255]);
  });

  it('rejects mismatched buffer sizes', () => {
    expect(() => encodePng(2, 2, new Uint8Array(5))).toThrow(/expected 16 bytes/);
  });

  it('handles images larger than one deflate stored block (>64KB raw)', () => {
    const size = 160; // 160*160*4 + scanline bytes > 65535
    const png = encodePng(size, size, new Uint8Array(size * size * 4).fill(7));
    const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = inflateStored(idat);
    expect(raw.length).toBe(size * (1 + size * 4));
  });
});

describe('schematicPreviewPng', () => {
  const fake = (blocks: Array<{ x: number; y: number; z: number; name: string }>) => ({
    blocks: () => blocks,
  });

  it('renders the highest block per column and ignores air', () => {
    const png = schematicPreviewPng(
      fake([
        { x: 0, y: 0, z: 0, name: 'minecraft:stone' },
        { x: 0, y: 5, z: 0, name: 'minecraft:gold_block' }, // tops the stone
        { x: 1, y: 9, z: 0, name: 'minecraft:air' }, // ignored
        { x: 1, y: 1, z: 0, name: 'minecraft:stone' },
      ])
    );
    const parsed = chunks(png);
    expect(parsed.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    // 2 columns wide, upscaled to ≤256: deterministic output for same input.
    const again = schematicPreviewPng(
      fake([
        { x: 0, y: 0, z: 0, name: 'minecraft:stone' },
        { x: 0, y: 5, z: 0, name: 'minecraft:gold_block' },
        { x: 1, y: 9, z: 0, name: 'minecraft:air' },
        { x: 1, y: 1, z: 0, name: 'minecraft:stone' },
      ])
    );
    expect(Array.from(png)).toEqual(Array.from(again));
  });

  it('survives an empty schematic', () => {
    const png = schematicPreviewPng(fake([]));
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
});
