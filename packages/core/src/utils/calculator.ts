/**
 * A collection of mathematical functions exposed to Synthase scripts.
 */
export const Calculator = {
  // Basic operations
  add: (a: number, b: number): number => a + b,
  subtract: (a: number, b: number): number => a - b,
  multiply: (a: number, b: number): number => a * b,
  divide: (a: number, b: number): number => {
    if (b === 0) {
      console.error('Calculator Error: Division by zero.');
      return NaN;
    }
    return a / b;
  },
  
  // Power and roots
  sqrt: (a: number): number => Math.sqrt(a),
  pow: (a: number, b: number): number => Math.pow(a, b),
  cbrt: (a: number): number => Math.cbrt(a),
  
  // Trigonometry
  sin: (a: number): number => Math.sin(a),
  cos: (a: number): number => Math.cos(a),
  tan: (a: number): number => Math.tan(a),
  asin: (a: number): number => Math.asin(a),
  acos: (a: number): number => Math.acos(a),
  atan: (a: number): number => Math.atan(a),
  atan2: (y: number, x: number): number => Math.atan2(y, x),
  
  // Rounding
  floor: (a: number): number => Math.floor(a),
  ceil: (a: number): number => Math.ceil(a),
  round: (a: number): number => Math.round(a),
  trunc: (a: number): number => Math.trunc(a),
  
  // Utility
  abs: (a: number): number => Math.abs(a),
  sign: (a: number): number => Math.sign(a),
  min: (...values: number[]): number => Math.min(...values),
  max: (...values: number[]): number => Math.max(...values),
  clamp: (value: number, min: number, max: number): number => 
    Math.min(Math.max(value, min), max),
  
  // Interpolation
  lerp: (a: number, b: number, t: number): number => a + (b - a) * t,
  inverseLerp: (a: number, b: number, value: number): number => 
    (value - a) / (b - a),
  remap: (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    const t = (value - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  },
  
  // Distance
  distance2D: (x1: number, y1: number, x2: number, y2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
  distance3D: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2),
  manhattanDistance3D: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number =>
    Math.abs(x2 - x1) + Math.abs(y2 - y1) + Math.abs(z2 - z1),
  
  // Constants
  PI: Math.PI,
  E: Math.E,
  TAU: Math.PI * 2,
  DEG_TO_RAD: Math.PI / 180,
  RAD_TO_DEG: 180 / Math.PI,
  
  // Conversion helpers
  degToRad: (degrees: number): number => degrees * (Math.PI / 180),
  radToDeg: (radians: number): number => radians * (180 / Math.PI),
} as const;

export type CalculatorType = typeof Calculator;

