import { describe, it, expect } from 'vitest';
import { Easing } from '../utils/easing';

describe('Easing', () => {
  // All easing function names for batch testing
  const allEasingNames = [
    'linear',
    'inQuad', 'outQuad', 'inOutQuad',
    'inCubic', 'outCubic', 'inOutCubic',
    'inQuart', 'outQuart', 'inOutQuart',
    'inQuint', 'outQuint', 'inOutQuint',
    'inSine', 'outSine', 'inOutSine',
    'inExpo', 'outExpo', 'inOutExpo',
    'inCirc', 'outCirc', 'inOutCirc',
    'inBack', 'outBack', 'inOutBack',
    'inElastic', 'outElastic', 'inOutElastic',
    'inBounce', 'outBounce', 'inOutBounce',
  ] as const;

  describe('boundary conditions: f(0) = 0 and f(1) = 1', () => {
    for (const name of allEasingNames) {
      it(`${name}(0) = 0`, () => {
        expect(Easing[name](0)).toBeCloseTo(0, 5);
      });

      it(`${name}(1) = 1`, () => {
        expect(Easing[name](1)).toBeCloseTo(1, 5);
      });
    }
  });

  describe('specific known values', () => {
    it('linear(0.5) = 0.5', () => {
      expect(Easing.linear(0.5)).toBeCloseTo(0.5, 10);
    });

    it('inQuad(0.5) = 0.25', () => {
      expect(Easing.inQuad(0.5)).toBeCloseTo(0.25, 10);
    });

    it('outQuad(0.5) = 0.75', () => {
      expect(Easing.outQuad(0.5)).toBeCloseTo(0.75, 10);
    });

    it('inCubic(0.5) = 0.125', () => {
      expect(Easing.inCubic(0.5)).toBeCloseTo(0.125, 10);
    });

    it('outCubic(0.5) = 0.875', () => {
      expect(Easing.outCubic(0.5)).toBeCloseTo(0.875, 10);
    });

    it('inQuart(0.5) = 0.0625', () => {
      expect(Easing.inQuart(0.5)).toBeCloseTo(0.0625, 10);
    });

    it('inQuint(0.5) = 0.03125', () => {
      expect(Easing.inQuint(0.5)).toBeCloseTo(0.03125, 10);
    });

    it('inOutQuad(0.5) = 0.5', () => {
      expect(Easing.inOutQuad(0.5)).toBeCloseTo(0.5, 10);
    });

    it('inOutCubic(0.5) = 0.5', () => {
      expect(Easing.inOutCubic(0.5)).toBeCloseTo(0.5, 10);
    });

    it('inOutSine(0.5) = 0.5', () => {
      expect(Easing.inOutSine(0.5)).toBeCloseTo(0.5, 10);
    });
  });

  describe('monotonicity for "in" functions: f(t) <= t for 0 < t < 1', () => {
    const inFunctions = [
      'inQuad', 'inCubic', 'inQuart', 'inQuint', 'inSine', 'inCirc',
    ] as const;

    for (const name of inFunctions) {
      it(`${name}(t) <= t for t in (0, 1)`, () => {
        for (let t = 0.05; t < 1; t += 0.05) {
          expect(Easing[name](t)).toBeLessThanOrEqual(t + 1e-10);
        }
      });
    }
  });

  describe('monotonicity for "out" functions: f(t) >= t for 0 < t < 1', () => {
    const outFunctions = [
      'outQuad', 'outCubic', 'outQuart', 'outQuint', 'outSine', 'outCirc',
    ] as const;

    for (const name of outFunctions) {
      it(`${name}(t) >= t for t in (0, 1)`, () => {
        for (let t = 0.05; t < 1; t += 0.05) {
          expect(Easing[name](t)).toBeGreaterThanOrEqual(t - 1e-10);
        }
      });
    }
  });

  describe('symmetry for "inOut" functions: f(0.5) close to 0.5', () => {
    const inOutFunctions = [
      'inOutQuad', 'inOutCubic', 'inOutQuart', 'inOutQuint',
      'inOutSine', 'inOutExpo', 'inOutCirc',
    ] as const;

    for (const name of inOutFunctions) {
      it(`${name}(0.5) is close to 0.5`, () => {
        expect(Easing[name](0.5)).toBeCloseTo(0.5, 2);
      });
    }
  });

  describe('bounce', () => {
    it('outBounce is always >= 0 for t in [0,1]', () => {
      for (let t = 0; t <= 1; t += 0.01) {
        expect(Easing.outBounce(t)).toBeGreaterThanOrEqual(-1e-10);
      }
    });

    it('outBounce is always <= 1 for t in [0,1]', () => {
      for (let t = 0; t <= 1; t += 0.01) {
        expect(Easing.outBounce(t)).toBeLessThanOrEqual(1 + 1e-10);
      }
    });

    it('inBounce is always in [0,1] for t in [0,1]', () => {
      for (let t = 0; t <= 1; t += 0.01) {
        const val = Easing.inBounce(t);
        expect(val).toBeGreaterThanOrEqual(-1e-10);
        expect(val).toBeLessThanOrEqual(1 + 1e-10);
      }
    });

    it('inOutBounce(0.5) is close to 0.5', () => {
      expect(Easing.inOutBounce(0.5)).toBeCloseTo(0.5, 2);
    });
  });

  describe('exponential edge cases', () => {
    it('inExpo(0) returns exactly 0', () => {
      expect(Easing.inExpo(0)).toBe(0);
    });

    it('outExpo(1) returns exactly 1', () => {
      expect(Easing.outExpo(1)).toBe(1);
    });

    it('inOutExpo(0) returns exactly 0 and (1) returns exactly 1', () => {
      expect(Easing.inOutExpo(0)).toBe(0);
      expect(Easing.inOutExpo(1)).toBe(1);
    });
  });
});
