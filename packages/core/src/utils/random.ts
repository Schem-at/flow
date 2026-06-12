/**
 * Random — deterministic hashing + seeded RNG (docs/dx-audit.md §1.4).
 * Replaces the per-block `hash2(x, z, seed)` snippets. All functions are
 * pure: same inputs, same outputs, on every run and in every environment.
 */

function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const Random = {
  /** Deterministic hash of (x, z, seed) → [0, 1). */
  hash2(x: number, z: number, seed = 0): number {
    let h = mix((x | 0) * 0x9e3779b1 ^ mix((z | 0) * 0x85ebca6b) ^ mix(seed | 0));
    h = mix(h);
    return h / 4294967296;
  },

  /** Deterministic hash of (x, y, z, seed) → [0, 1). */
  hash3(x: number, y: number, z: number, seed = 0): number {
    return Random.hash2(x, (y | 0) * 0x27d4eb2f ^ (z | 0), seed);
  },

  /** Seeded PRNG (mulberry32): returns a () => number in [0, 1). */
  seeded(seed: number | string = 0): () => number {
    let state =
      typeof seed === 'string'
        ? [...seed].reduce((acc, c) => mix(acc ^ c.charCodeAt(0)), 0x9e3779b1)
        : mix(seed | 0 || 1);
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /** Integer in [min, max] from a generator (or Math.random). */
  int(min: number, max: number, rng: () => number = Math.random): number {
    return min + Math.floor(rng() * (max - min + 1));
  },

  /** Pick one element (deterministic when given a seeded rng). */
  pick<T>(items: T[], rng: () => number = Math.random): T {
    return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  },

  /** Fisher–Yates shuffle (non-mutating). */
  shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },
};
