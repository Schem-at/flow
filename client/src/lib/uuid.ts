/**
 * Generate a RFC-4122 v4 UUID.
 *
 * `crypto.randomUUID()` is only defined in a secure context (https or
 * literal localhost). When the dev server is reached over the LAN IP or
 * `0.0.0.0` it is `undefined`, so fall back to `crypto.getRandomValues`
 * (available in insecure contexts too), and to `Math.random` as a last resort.
 */
export function uuid(): string {
  const c: Crypto | undefined = globalThis.crypto;

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
