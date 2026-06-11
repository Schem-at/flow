import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256 } from './cryptoPolyfill';

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function reference(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('sha256 polyfill', () => {
  it('matches known vectors', () => {
    expect(hex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches node:crypto across sizes (incl. padding boundaries)', () => {
    for (const size of [1, 55, 56, 63, 64, 65, 1000, 1 << 16, (1 << 20) + 3]) {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) & 0xff;
      expect(hex(sha256(bytes))).toBe(reference(bytes));
    }
  });
});
