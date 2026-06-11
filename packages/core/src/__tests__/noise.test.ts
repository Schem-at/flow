import { describe, it, expect } from 'vitest';
import { createNoiseProvider } from '../utils/noise';

describe('createNoiseProvider', () => {
  describe('determinism', () => {
    it('same seed produces same 2D values', () => {
      const a = createNoiseProvider('test-seed');
      const b = createNoiseProvider('test-seed');
      expect(a.get2D(1.5, 2.5)).toBe(b.get2D(1.5, 2.5));
      expect(a.get2D(100, 200)).toBe(b.get2D(100, 200));
    });

    it('same seed produces same 3D values', () => {
      const a = createNoiseProvider('test-seed');
      const b = createNoiseProvider('test-seed');
      expect(a.get3D(1.5, 2.5, 3.5)).toBe(b.get3D(1.5, 2.5, 3.5));
    });

    it('different seeds produce different values', () => {
      const a = createNoiseProvider('seed-A');
      const b = createNoiseProvider('seed-B');
      // Use non-integer coordinates to avoid grid points where noise is always 0
      const valA = a.get2D(10.3, 20.7);
      const valB = b.get2D(10.3, 20.7);
      expect(valA).not.toBe(valB);
    });

    it('numeric seed works', () => {
      const a = createNoiseProvider(42);
      const b = createNoiseProvider(42);
      expect(a.get2D(5, 5)).toBe(b.get2D(5, 5));
    });
  });

  describe('getSeed', () => {
    it('returns the string seed', () => {
      const n = createNoiseProvider('hello');
      expect(n.getSeed()).toBe('hello');
    });

    it('returns a string representation of numeric seed', () => {
      const n = createNoiseProvider(42);
      expect(n.getSeed()).toBe('42');
    });

    it('returns some seed when none provided', () => {
      const n = createNoiseProvider();
      expect(typeof n.getSeed()).toBe('string');
      expect(n.getSeed().length).toBeGreaterThan(0);
    });
  });

  describe('get2D range [-1, 1]', () => {
    it('returns values in [-1, 1] over many samples', () => {
      const n = createNoiseProvider('range-test');
      for (let i = 0; i < 200; i++) {
        const x = (i * 0.37) - 37;
        const y = (i * 0.53) - 53;
        const val = n.get2D(x, y);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('get3D range [-1, 1]', () => {
    it('returns values in [-1, 1] over many samples', () => {
      const n = createNoiseProvider('range-test-3d');
      for (let i = 0; i < 200; i++) {
        const x = (i * 0.37) - 37;
        const y = (i * 0.53) - 53;
        const z = (i * 0.71) - 71;
        const val = n.get3D(x, y, z);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('get2D_01 range [0, 1]', () => {
    it('returns values in [0, 1] over many samples', () => {
      const n = createNoiseProvider('range-01-2d');
      for (let i = 0; i < 200; i++) {
        const x = (i * 0.37) - 37;
        const y = (i * 0.53) - 53;
        const val = n.get2D_01(x, y);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('get3D_01 range [0, 1]', () => {
    it('returns values in [0, 1] over many samples', () => {
      const n = createNoiseProvider('range-01-3d');
      for (let i = 0; i < 200; i++) {
        const x = (i * 0.37) - 37;
        const y = (i * 0.53) - 53;
        const z = (i * 0.71) - 71;
        const val = n.get3D_01(x, y, z);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('frequency parameter', () => {
    it('different frequencies produce different values', () => {
      const n = createNoiseProvider('freq-test');
      // Use non-integer coordinates to avoid grid points where noise is always 0
      const v1 = n.get2D(5.3, 5.7, 1);
      const v2 = n.get2D(5.3, 5.7, 2);
      expect(v1).not.toBe(v2);
    });
  });

  describe('fractal noise', () => {
    it('getFractal2D returns values in [-1, 1]', () => {
      const n = createNoiseProvider('fractal-2d');
      for (let i = 0; i < 100; i++) {
        const x = (i * 0.37) - 18;
        const y = (i * 0.53) - 26;
        const val = n.getFractal2D(x, y);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('getFractal3D returns values in [-1, 1]', () => {
      const n = createNoiseProvider('fractal-3d');
      for (let i = 0; i < 100; i++) {
        const x = (i * 0.37) - 18;
        const y = (i * 0.53) - 26;
        const z = (i * 0.71) - 35;
        const val = n.getFractal3D(x, y, z);
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('getFractal2D_01 returns values in [0, 1]', () => {
      const n = createNoiseProvider('fractal-01-2d');
      for (let i = 0; i < 100; i++) {
        const val = n.getFractal2D_01(i * 0.5, i * 0.3);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('getFractal3D_01 returns values in [0, 1]', () => {
      const n = createNoiseProvider('fractal-01-3d');
      for (let i = 0; i < 100; i++) {
        const val = n.getFractal3D_01(i * 0.5, i * 0.3, i * 0.7);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('accepts custom fractal options', () => {
      const n = createNoiseProvider('fractal-opts');
      const defaultVal = n.getFractal2D(5, 5);
      const customVal = n.getFractal2D(5, 5, {
        octaves: 2,
        frequency: 0.5,
        lacunarity: 3,
        persistence: 0.3,
      });
      // Different options should produce a different value
      expect(defaultVal).not.toBe(customVal);
    });
  });

  describe('continuity', () => {
    it('nearby 2D coordinates produce similar values', () => {
      const n = createNoiseProvider('continuity-test');
      const base = n.get2D(10, 10);
      const nearby = n.get2D(10.001, 10.001);
      const diff = Math.abs(base - nearby);
      // Perlin noise is continuous, so a tiny step should yield a tiny difference
      expect(diff).toBeLessThan(0.05);
    });

    it('nearby 3D coordinates produce similar values', () => {
      const n = createNoiseProvider('continuity-3d');
      const base = n.get3D(10, 10, 10);
      const nearby = n.get3D(10.001, 10.001, 10.001);
      const diff = Math.abs(base - nearby);
      expect(diff).toBeLessThan(0.05);
    });
  });
});
