import { describe, it, expect } from 'vitest';
import { Vec2, Vec3, VectorUtils } from '../utils/vector';

describe('Vec2', () => {
  it('constructs with default values', () => {
    const v = new Vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('constructs with given values', () => {
    const v = new Vec2(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('creates from static factory', () => {
    const v = Vec2.from(5, 6);
    expect(v.x).toBe(5);
    expect(v.y).toBe(6);
  });

  it('creates a zero vector', () => {
    const v = Vec2.zero();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('clones without sharing reference', () => {
    const v = new Vec2(1, 2);
    const c = v.clone();
    expect(c.x).toBe(1);
    expect(c.y).toBe(2);
    c.x = 99;
    expect(v.x).toBe(1);
  });

  it('sets values and returns this', () => {
    const v = new Vec2();
    const ret = v.set(7, 8);
    expect(v.x).toBe(7);
    expect(v.y).toBe(8);
    expect(ret).toBe(v);
  });

  it('adds another vector (mutating)', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    const ret = a.add(b);
    expect(a.x).toBe(4);
    expect(a.y).toBe(6);
    expect(ret).toBe(a);
  });

  it('subtracts another vector (mutating)', () => {
    const a = new Vec2(5, 7);
    const b = new Vec2(2, 3);
    const ret = a.sub(b);
    expect(a.x).toBe(3);
    expect(a.y).toBe(4);
    expect(ret).toBe(a);
  });

  it('scales by a scalar (mutating)', () => {
    const v = new Vec2(3, 4);
    const ret = v.scale(2);
    expect(v.x).toBe(6);
    expect(v.y).toBe(8);
    expect(ret).toBe(v);
  });

  it('computes length', () => {
    expect(new Vec2(3, 4).length()).toBeCloseTo(5, 10);
    expect(new Vec2(0, 0).length()).toBe(0);
    expect(new Vec2(1, 0).length()).toBe(1);
  });

  it('normalizes (mutating)', () => {
    const v = new Vec2(3, 4);
    const ret = v.normalize();
    expect(v.length()).toBeCloseTo(1, 10);
    expect(ret).toBe(v);
  });

  it('normalizes a zero vector without error', () => {
    const v = new Vec2(0, 0);
    v.normalize();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('computes dot product', () => {
    expect(new Vec2(1, 0).dot(new Vec2(0, 1))).toBe(0);
    expect(new Vec2(2, 3).dot(new Vec2(4, 5))).toBe(23);
  });

  it('computes distance to another vector', () => {
    expect(new Vec2(0, 0).distanceTo(new Vec2(3, 4))).toBeCloseTo(5, 10);
    expect(new Vec2(1, 1).distanceTo(new Vec2(1, 1))).toBe(0);
  });

  it('converts to array', () => {
    const arr = new Vec2(3, 4).toArray();
    expect(arr).toEqual([3, 4]);
  });
});

describe('Vec3', () => {
  it('constructs with default values', () => {
    const v = new Vec3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('constructs with given values', () => {
    const v = new Vec3(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('creates from static factory', () => {
    const v = Vec3.from(4, 5, 6);
    expect(v.x).toBe(4);
    expect(v.y).toBe(5);
    expect(v.z).toBe(6);
  });

  it('creates a zero vector', () => {
    const v = Vec3.zero();
    expect(v.toArray()).toEqual([0, 0, 0]);
  });

  describe('static direction vectors', () => {
    it('up is (0, 1, 0)', () => {
      expect(Vec3.up().toArray()).toEqual([0, 1, 0]);
    });

    it('down is (0, -1, 0)', () => {
      expect(Vec3.down().toArray()).toEqual([0, -1, 0]);
    });

    it('north is (0, 0, -1)', () => {
      expect(Vec3.north().toArray()).toEqual([0, 0, -1]);
    });

    it('south is (0, 0, 1)', () => {
      expect(Vec3.south().toArray()).toEqual([0, 0, 1]);
    });

    it('east is (1, 0, 0)', () => {
      expect(Vec3.east().toArray()).toEqual([1, 0, 0]);
    });

    it('west is (-1, 0, 0)', () => {
      expect(Vec3.west().toArray()).toEqual([-1, 0, 0]);
    });
  });

  it('clones without sharing reference', () => {
    const v = new Vec3(1, 2, 3);
    const c = v.clone();
    expect(c.toArray()).toEqual([1, 2, 3]);
    c.x = 99;
    expect(v.x).toBe(1);
  });

  it('sets values and returns this', () => {
    const v = new Vec3();
    const ret = v.set(7, 8, 9);
    expect(v.toArray()).toEqual([7, 8, 9]);
    expect(ret).toBe(v);
  });

  it('adds another vector (mutating)', () => {
    const a = new Vec3(1, 2, 3);
    const b = new Vec3(4, 5, 6);
    const ret = a.add(b);
    expect(a.toArray()).toEqual([5, 7, 9]);
    expect(ret).toBe(a);
  });

  it('subtracts another vector (mutating)', () => {
    const a = new Vec3(5, 7, 9);
    const b = new Vec3(1, 2, 3);
    const ret = a.sub(b);
    expect(a.toArray()).toEqual([4, 5, 6]);
    expect(ret).toBe(a);
  });

  it('scales by a scalar (mutating)', () => {
    const v = new Vec3(1, 2, 3);
    const ret = v.scale(3);
    expect(v.toArray()).toEqual([3, 6, 9]);
    expect(ret).toBe(v);
  });

  it('multiplies component-wise (mutating)', () => {
    const a = new Vec3(2, 3, 4);
    const b = new Vec3(5, 6, 7);
    const ret = a.multiply(b);
    expect(a.toArray()).toEqual([10, 18, 28]);
    expect(ret).toBe(a);
  });

  it('computes length', () => {
    expect(new Vec3(1, 2, 2).length()).toBe(3);
    expect(new Vec3(0, 0, 0).length()).toBe(0);
  });

  it('computes lengthSq', () => {
    expect(new Vec3(1, 2, 2).lengthSq()).toBe(9);
    expect(new Vec3(3, 4, 0).lengthSq()).toBe(25);
  });

  it('normalizes (mutating)', () => {
    const v = new Vec3(0, 3, 4);
    const ret = v.normalize();
    expect(v.length()).toBeCloseTo(1, 10);
    expect(ret).toBe(v);
  });

  it('normalizes a zero vector without error', () => {
    const v = new Vec3(0, 0, 0);
    v.normalize();
    expect(v.toArray()).toEqual([0, 0, 0]);
  });

  it('computes dot product', () => {
    expect(new Vec3(1, 0, 0).dot(new Vec3(0, 1, 0))).toBe(0);
    expect(new Vec3(1, 2, 3).dot(new Vec3(4, 5, 6))).toBe(32);
  });

  it('computes cross product', () => {
    const result = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
    expect(result.toArray()).toEqual([0, 0, 1]);

    const r2 = new Vec3(0, 1, 0).cross(new Vec3(1, 0, 0));
    expect(r2.toArray()).toEqual([0, 0, -1]);
  });

  it('cross product returns a new vector (not mutating)', () => {
    const a = new Vec3(1, 0, 0);
    const b = new Vec3(0, 1, 0);
    const result = a.cross(b);
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(a.toArray()).toEqual([1, 0, 0]);
  });

  it('computes distanceTo', () => {
    expect(new Vec3(0, 0, 0).distanceTo(new Vec3(1, 2, 2))).toBe(3);
    expect(new Vec3(1, 1, 1).distanceTo(new Vec3(1, 1, 1))).toBe(0);
  });

  it('computes manhattanDistanceTo', () => {
    expect(new Vec3(0, 0, 0).manhattanDistanceTo(new Vec3(1, 2, 3))).toBe(6);
    expect(new Vec3(1, 1, 1).manhattanDistanceTo(new Vec3(-1, -1, -1))).toBe(6);
  });

  it('min selects component-wise minimum (mutating)', () => {
    const a = new Vec3(3, 1, 5);
    const b = new Vec3(1, 4, 2);
    const ret = a.min(b);
    expect(a.toArray()).toEqual([1, 1, 2]);
    expect(ret).toBe(a);
  });

  it('max selects component-wise maximum (mutating)', () => {
    const a = new Vec3(3, 1, 5);
    const b = new Vec3(1, 4, 2);
    const ret = a.max(b);
    expect(a.toArray()).toEqual([3, 4, 5]);
    expect(ret).toBe(a);
  });

  it('clamps to a range (mutating)', () => {
    const v = new Vec3(15, -5, 5);
    const minV = new Vec3(0, 0, 0);
    const maxV = new Vec3(10, 10, 10);
    const ret = v.clamp(minV, maxV);
    expect(v.toArray()).toEqual([10, 0, 5]);
    expect(ret).toBe(v);
  });

  it('lerps toward another vector (mutating)', () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(10, 20, 30);
    const ret = a.lerp(b, 0.5);
    expect(a.toArray()).toEqual([5, 10, 15]);
    expect(ret).toBe(a);
  });

  it('lerp at t=0 stays in place', () => {
    const a = new Vec3(1, 2, 3);
    a.lerp(new Vec3(10, 20, 30), 0);
    expect(a.toArray()).toEqual([1, 2, 3]);
  });

  it('lerp at t=1 reaches target', () => {
    const a = new Vec3(1, 2, 3);
    a.lerp(new Vec3(10, 20, 30), 1);
    expect(a.toArray()).toEqual([10, 20, 30]);
  });

  it('tests equality', () => {
    expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 3))).toBe(true);
    expect(new Vec3(1, 2, 3).equals(new Vec3(1, 2, 4))).toBe(false);
  });

  it('converts to array', () => {
    expect(new Vec3(1, 2, 3).toArray()).toEqual([1, 2, 3]);
  });

  it('converts to string', () => {
    expect(new Vec3(1, 2, 3).toString()).toBe('Vec3(1, 2, 3)');
  });

  it('converts to key and back', () => {
    const v = new Vec3(10, 20, 30);
    const key = v.toKey();
    expect(key).toBe('10,20,30');
    const restored = Vec3.fromKey(key);
    expect(restored.toArray()).toEqual([10, 20, 30]);
  });

  describe('additional mutating methods', () => {
    it('floor (mutating)', () => {
      const v = new Vec3(1.7, 2.3, -0.1);
      const ret = v.floor();
      expect(v.toArray()).toEqual([1, 2, -1]);
      expect(ret).toBe(v);
    });

    it('ceil (mutating)', () => {
      const v = new Vec3(1.1, 2.9, -1.1);
      const ret = v.ceil();
      expect(v.toArray()).toEqual([2, 3, -1]);
      expect(ret).toBe(v);
    });

    it('round (mutating)', () => {
      const v = new Vec3(1.4, 2.5, 3.6);
      const ret = v.round();
      expect(v.toArray()).toEqual([1, 3, 4]);
      expect(ret).toBe(v);
    });

    it('abs (mutating)', () => {
      const v = new Vec3(-1, -2, 3);
      const ret = v.abs();
      expect(v.toArray()).toEqual([1, 2, 3]);
      expect(ret).toBe(v);
    });
  });
});

describe('VectorUtils', () => {
  it('exposes Vec2 and Vec3 constructors', () => {
    expect(VectorUtils.Vec2).toBe(Vec2);
    expect(VectorUtils.Vec3).toBe(Vec3);
    expect(VectorUtils.Vector2).toBe(Vec2);
    expect(VectorUtils.Vector3).toBe(Vec3);
  });

  it('vec2 factory creates Vec2', () => {
    const v = VectorUtils.vec2(3, 4);
    expect(v).toBeInstanceOf(Vec2);
    expect(v.toArray()).toEqual([3, 4]);
  });

  it('vec3 factory creates Vec3', () => {
    const v = VectorUtils.vec3(1, 2, 3);
    expect(v).toBeInstanceOf(Vec3);
    expect(v.toArray()).toEqual([1, 2, 3]);
  });

  it('lerp3 interpolates between two Vec3 without mutating', () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(10, 20, 30);
    const result = VectorUtils.lerp3(a, b, 0.5);
    expect(result.toArray()).toEqual([5, 10, 15]);
    expect(a.toArray()).toEqual([0, 0, 0]);
    expect(b.toArray()).toEqual([10, 20, 30]);
  });

  it('distance3 computes distance between two Vec3', () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(1, 2, 2);
    expect(VectorUtils.distance3(a, b)).toBe(3);
  });

  it('manhattan3 computes manhattan distance', () => {
    const a = new Vec3(0, 0, 0);
    const b = new Vec3(1, 2, 3);
    expect(VectorUtils.manhattan3(a, b)).toBe(6);
  });
});
