import { describe, it, expect } from 'vitest';
import { Calculator } from '../utils/calculator';

describe('Calculator', () => {
  describe('basic operations', () => {
    it('adds two numbers', () => {
      expect(Calculator.add(2, 3)).toBe(5);
      expect(Calculator.add(-1, 1)).toBe(0);
      expect(Calculator.add(0, 0)).toBe(0);
    });

    it('subtracts two numbers', () => {
      expect(Calculator.subtract(5, 3)).toBe(2);
      expect(Calculator.subtract(3, 5)).toBe(-2);
      expect(Calculator.subtract(0, 0)).toBe(0);
    });

    it('multiplies two numbers', () => {
      expect(Calculator.multiply(2, 3)).toBe(6);
      expect(Calculator.multiply(-2, 3)).toBe(-6);
      expect(Calculator.multiply(0, 100)).toBe(0);
    });

    it('divides two numbers', () => {
      expect(Calculator.divide(6, 3)).toBe(2);
      expect(Calculator.divide(7, 2)).toBe(3.5);
      expect(Calculator.divide(-6, 3)).toBe(-2);
    });

    it('returns NaN when dividing by zero', () => {
      expect(Calculator.divide(5, 0)).toBeNaN();
      expect(Calculator.divide(0, 0)).toBeNaN();
    });
  });

  describe('power and roots', () => {
    it('computes square root', () => {
      expect(Calculator.sqrt(4)).toBe(2);
      expect(Calculator.sqrt(9)).toBe(3);
      expect(Calculator.sqrt(0)).toBe(0);
      expect(Calculator.sqrt(2)).toBeCloseTo(1.41421356, 5);
    });

    it('computes power', () => {
      expect(Calculator.pow(2, 3)).toBe(8);
      expect(Calculator.pow(5, 0)).toBe(1);
      expect(Calculator.pow(2, -1)).toBe(0.5);
    });

    it('computes cube root', () => {
      expect(Calculator.cbrt(27)).toBe(3);
      expect(Calculator.cbrt(8)).toBe(2);
      expect(Calculator.cbrt(0)).toBe(0);
      expect(Calculator.cbrt(-8)).toBe(-2);
    });
  });

  describe('trigonometry', () => {
    it('computes sin at known values', () => {
      expect(Calculator.sin(0)).toBeCloseTo(0, 10);
      expect(Calculator.sin(Calculator.PI / 2)).toBeCloseTo(1, 10);
      expect(Calculator.sin(Calculator.PI)).toBeCloseTo(0, 10);
    });

    it('computes cos at known values', () => {
      expect(Calculator.cos(0)).toBeCloseTo(1, 10);
      expect(Calculator.cos(Calculator.PI / 2)).toBeCloseTo(0, 10);
      expect(Calculator.cos(Calculator.PI)).toBeCloseTo(-1, 10);
    });

    it('computes tan at known values', () => {
      expect(Calculator.tan(0)).toBeCloseTo(0, 10);
      expect(Calculator.tan(Calculator.PI)).toBeCloseTo(0, 10);
    });

    it('computes inverse trig functions', () => {
      expect(Calculator.asin(0)).toBeCloseTo(0, 10);
      expect(Calculator.asin(1)).toBeCloseTo(Calculator.PI / 2, 10);
      expect(Calculator.acos(1)).toBeCloseTo(0, 10);
      expect(Calculator.atan(0)).toBeCloseTo(0, 10);
    });

    it('computes atan2', () => {
      expect(Calculator.atan2(0, 1)).toBeCloseTo(0, 10);
      expect(Calculator.atan2(1, 0)).toBeCloseTo(Calculator.PI / 2, 10);
    });
  });

  describe('rounding', () => {
    it('floors numbers', () => {
      expect(Calculator.floor(4.7)).toBe(4);
      expect(Calculator.floor(-4.3)).toBe(-5);
      expect(Calculator.floor(5)).toBe(5);
    });

    it('ceils numbers', () => {
      expect(Calculator.ceil(4.3)).toBe(5);
      expect(Calculator.ceil(-4.7)).toBe(-4);
      expect(Calculator.ceil(5)).toBe(5);
    });

    it('rounds numbers', () => {
      expect(Calculator.round(4.5)).toBe(5);
      expect(Calculator.round(4.4)).toBe(4);
      expect(Calculator.round(-4.5)).toBe(-4);
    });

    it('truncates numbers', () => {
      expect(Calculator.trunc(4.7)).toBe(4);
      expect(Calculator.trunc(-4.7)).toBe(-4);
      expect(Calculator.trunc(5)).toBe(5);
    });
  });

  describe('utility', () => {
    it('computes absolute value', () => {
      expect(Calculator.abs(-5)).toBe(5);
      expect(Calculator.abs(5)).toBe(5);
      expect(Calculator.abs(0)).toBe(0);
    });

    it('computes sign', () => {
      expect(Calculator.sign(-5)).toBe(-1);
      expect(Calculator.sign(5)).toBe(1);
      expect(Calculator.sign(0)).toBe(0);
    });

    it('computes min', () => {
      expect(Calculator.min(1, 2, 3)).toBe(1);
      expect(Calculator.min(-1, -2, -3)).toBe(-3);
      expect(Calculator.min(5)).toBe(5);
    });

    it('computes max', () => {
      expect(Calculator.max(1, 2, 3)).toBe(3);
      expect(Calculator.max(-1, -2, -3)).toBe(-1);
      expect(Calculator.max(5)).toBe(5);
    });

    it('clamps values within range', () => {
      expect(Calculator.clamp(5, 0, 10)).toBe(5);
      expect(Calculator.clamp(-5, 0, 10)).toBe(0);
      expect(Calculator.clamp(15, 0, 10)).toBe(10);
      expect(Calculator.clamp(0, 0, 10)).toBe(0);
      expect(Calculator.clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('interpolation', () => {
    it('lerps between two values', () => {
      expect(Calculator.lerp(0, 10, 0)).toBe(0);
      expect(Calculator.lerp(0, 10, 0.5)).toBe(5);
      expect(Calculator.lerp(0, 10, 1)).toBe(10);
      expect(Calculator.lerp(-10, 10, 0.5)).toBe(0);
    });

    it('computes inverse lerp', () => {
      expect(Calculator.inverseLerp(0, 10, 5)).toBeCloseTo(0.5, 10);
      expect(Calculator.inverseLerp(0, 10, 0)).toBeCloseTo(0, 10);
      expect(Calculator.inverseLerp(0, 10, 10)).toBeCloseTo(1, 10);
    });

    it('remaps values between ranges', () => {
      expect(Calculator.remap(5, 0, 10, 0, 100)).toBeCloseTo(50, 10);
      expect(Calculator.remap(0, 0, 10, 0, 100)).toBeCloseTo(0, 10);
      expect(Calculator.remap(10, 0, 10, 0, 100)).toBeCloseTo(100, 10);
      expect(Calculator.remap(5, 0, 10, 100, 200)).toBeCloseTo(150, 10);
    });
  });

  describe('distance', () => {
    it('computes 2D distance', () => {
      expect(Calculator.distance2D(0, 0, 3, 4)).toBeCloseTo(5, 10);
      expect(Calculator.distance2D(0, 0, 0, 0)).toBe(0);
      expect(Calculator.distance2D(1, 1, 4, 5)).toBeCloseTo(5, 10);
    });

    it('computes 3D distance', () => {
      expect(Calculator.distance3D(0, 0, 0, 1, 2, 2)).toBe(3);
      expect(Calculator.distance3D(0, 0, 0, 0, 0, 0)).toBe(0);
    });

    it('computes manhattan distance 3D', () => {
      expect(Calculator.manhattanDistance3D(0, 0, 0, 1, 2, 3)).toBe(6);
      expect(Calculator.manhattanDistance3D(0, 0, 0, 0, 0, 0)).toBe(0);
      expect(Calculator.manhattanDistance3D(1, 1, 1, -1, -1, -1)).toBe(6);
    });
  });

  describe('constants', () => {
    it('has correct PI', () => {
      expect(Calculator.PI).toBeCloseTo(Math.PI, 10);
    });

    it('has correct E', () => {
      expect(Calculator.E).toBeCloseTo(Math.E, 10);
    });

    it('has correct TAU (2*PI)', () => {
      expect(Calculator.TAU).toBeCloseTo(Math.PI * 2, 10);
    });

    it('has correct DEG_TO_RAD', () => {
      expect(Calculator.DEG_TO_RAD).toBeCloseTo(Math.PI / 180, 10);
    });

    it('has correct RAD_TO_DEG', () => {
      expect(Calculator.RAD_TO_DEG).toBeCloseTo(180 / Math.PI, 10);
    });
  });

  describe('conversion', () => {
    it('converts degrees to radians', () => {
      expect(Calculator.degToRad(180)).toBeCloseTo(Math.PI, 10);
      expect(Calculator.degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
      expect(Calculator.degToRad(360)).toBeCloseTo(Math.PI * 2, 10);
      expect(Calculator.degToRad(0)).toBe(0);
    });

    it('converts radians to degrees', () => {
      expect(Calculator.radToDeg(Math.PI)).toBeCloseTo(180, 10);
      expect(Calculator.radToDeg(Math.PI / 2)).toBeCloseTo(90, 10);
      expect(Calculator.radToDeg(Math.PI * 2)).toBeCloseTo(360, 10);
      expect(Calculator.radToDeg(0)).toBe(0);
    });
  });
});
