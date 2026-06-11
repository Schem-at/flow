/**
 * Simple 2D Vector class for schematic operations
 */
export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static from(x: number, y: number): Vec2 {
    return new Vec2(x, y);
  }

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  add(v: Vec2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vec2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  distanceTo(v: Vec2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }
}

/**
 * 3D Vector class for schematic operations
 */
export class Vec3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  static from(x: number, y: number, z: number): Vec3 {
    return new Vec3(x, y, z);
  }

  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static up(): Vec3 {
    return new Vec3(0, 1, 0);
  }

  static down(): Vec3 {
    return new Vec3(0, -1, 0);
  }

  static north(): Vec3 {
    return new Vec3(0, 0, -1);
  }

  static south(): Vec3 {
    return new Vec3(0, 0, 1);
  }

  static east(): Vec3 {
    return new Vec3(1, 0, 0);
  }

  static west(): Vec3 {
    return new Vec3(-1, 0, 0);
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  add(v: Vec3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vec3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  multiply(v: Vec3): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
      this.z /= len;
    }
    return this;
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vec3): Vec3 {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  distanceTo(v: Vec3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  manhattanDistanceTo(v: Vec3): number {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }

  floor(): this {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    this.z = Math.floor(this.z);
    return this;
  }

  ceil(): this {
    this.x = Math.ceil(this.x);
    this.y = Math.ceil(this.y);
    this.z = Math.ceil(this.z);
    return this;
  }

  round(): this {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);
    this.z = Math.round(this.z);
    return this;
  }

  abs(): this {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);
    this.z = Math.abs(this.z);
    return this;
  }

  min(v: Vec3): this {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }

  max(v: Vec3): this {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }

  clamp(minVal: Vec3, maxVal: Vec3): this {
    this.x = Math.max(minVal.x, Math.min(maxVal.x, this.x));
    this.y = Math.max(minVal.y, Math.min(maxVal.y, this.y));
    this.z = Math.max(minVal.z, Math.min(maxVal.z, this.z));
    return this;
  }

  lerp(v: Vec3, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  equals(v: Vec3): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toString(): string {
    return `Vec3(${this.x}, ${this.y}, ${this.z})`;
  }

  toKey(): string {
    return `${this.x},${this.y},${this.z}`;
  }

  static fromKey(key: string): Vec3 {
    const [x, y, z] = key.split(',').map(Number);
    return new Vec3(x, y, z);
  }
}

/**
 * Vector utilities object exposed to scripts
 */
export const VectorUtils = {
  Vec2,
  Vec3,
  Vector2: Vec2,
  Vector3: Vec3,
  
  // Factory functions
  vec2: (x: number, y: number) => new Vec2(x, y),
  vec3: (x: number, y: number, z: number) => new Vec3(x, y, z),
  
  // Static helpers
  lerp3: (a: Vec3, b: Vec3, t: number): Vec3 => {
    return new Vec3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
  },
  
  distance3: (a: Vec3, b: Vec3): number => {
    return a.distanceTo(b);
  },
  
  manhattan3: (a: Vec3, b: Vec3): number => {
    return a.manhattanDistanceTo(b);
  },
} as const;

export type VectorUtilsType = typeof VectorUtils;

