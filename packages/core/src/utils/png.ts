/**
 * Minimal pure-JS PNG encoder — RGBA pixels → PNG bytes using stored
 * (uncompressed) zlib deflate blocks. No canvas, no dependencies, so it works
 * identically in browser workers, Bun workers, and SES-adjacent trusted scope.
 * Output is larger than a compressed PNG but perfectly valid; previews are
 * small (≤256²) so size is irrelevant.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: Uint8Array): number[] {
  const typeBytes = [...type].map((c) => c.charCodeAt(0));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** Wrap raw bytes in a zlib stream using stored (type-0) deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const out = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  let offset = 0;
  out[offset++] = 0x78; // CMF: deflate, 32K window
  out[offset++] = 0x01; // FLG: no preset dict, fastest
  for (let i = 0; i < blockCount; i++) {
    const start = i * MAX_BLOCK;
    const len = Math.min(MAX_BLOCK, raw.length - start);
    out[offset++] = i === blockCount - 1 ? 1 : 0; // BFINAL
    out[offset++] = len & 0xff;
    out[offset++] = (len >>> 8) & 0xff;
    out[offset++] = ~len & 0xff;
    out[offset++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), offset);
    offset += len;
  }
  out.set(u32(adler32(raw)), offset);
  return out;
}

/** Encode width×height RGBA pixels (4 bytes per pixel) as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePng: expected ${width * height * 4} bytes, got ${rgba.length}`);
  }
  // Raw image data: each scanline prefixed with filter byte 0 (None).
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }

  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]); // 8-bit RGBA
  const png = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', new Uint8Array(0)),
  ];
  return new Uint8Array(png);
}
