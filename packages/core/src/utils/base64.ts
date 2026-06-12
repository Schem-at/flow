/**
 * Isomorphic base64 ↔ bytes (browser main thread, web worker, Bun, and —
 * via the emitted copy in the flow compiler — inside SES compartments,
 * where atob/btoa are not endowed).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? ALPHABET[c & 63] : '=';
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const lookup = new Uint8Array(128);
  for (let i = 0; i < ALPHABET.length; i++) lookup[ALPHABET.charCodeAt(i)] = i;
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 3 < clean.length || (i + 1 < clean.length && o < length); i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)] || 0;
    const d = lookup[clean.charCodeAt(i + 3)] || 0;
    if (o < length) out[o++] = (a << 2) | (b >> 4);
    if (o < length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/**
 * The same decoder as compartment-safe source text, emitted once into folded
 * flow scripts so baked assets decode without any endowments.
 */
export const BASE64_DECODER_SOURCE = `function __b64(s) {
  var A = '${ALPHABET}';
  var clean = s.replace(/[^A-Za-z0-9+\\/]/g, '');
  var lookup = {};
  for (var i = 0; i < A.length; i++) lookup[A.charCodeAt(i)] = i;
  var length = Math.floor((clean.length * 3) / 4);
  var out = new Uint8Array(length);
  var o = 0;
  for (var j = 0; j < clean.length; j += 4) {
    var a = lookup[clean.charCodeAt(j)];
    var b = lookup[clean.charCodeAt(j + 1)];
    var c = lookup[clean.charCodeAt(j + 2)] || 0;
    var d = lookup[clean.charCodeAt(j + 3)] || 0;
    if (o < length) out[o++] = (a << 2) | (b >> 4);
    if (o < length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}`;
