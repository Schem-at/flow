/**
 * Easing functions that remap a value (usually 0 to 1) along a non-linear curve.
 * Based on the work of Robert Penner.
 */
export const Easing = {
  // No easing, linear
  linear: (t: number): number => t,

  // --- Quadratic ---
  inQuad: (t: number): number => t * t,
  outQuad: (t: number): number => t * (2 - t),
  inOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,

  // --- Cubic ---
  inCubic: (t: number): number => t * t * t,
  outCubic: (t: number): number => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },
  inOutCubic: (t: number): number => 
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  // --- Quartic ---
  inQuart: (t: number): number => t * t * t * t,
  outQuart: (t: number): number => {
    const t1 = t - 1;
    return 1 - t1 * t1 * t1 * t1;
  },
  inOutQuart: (t: number): number => {
    const t1 = t - 1;
    return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * t1 * t1 * t1 * t1;
  },

  // --- Quintic (very strong) ---
  inQuint: (t: number): number => t * t * t * t * t,
  outQuint: (t: number): number => {
    const t1 = t - 1;
    return 1 + t1 * t1 * t1 * t1 * t1;
  },
  inOutQuint: (t: number): number => {
    const t1 = t - 1;
    return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * t1 * t1 * t1 * t1 * t1;
  },

  // --- Sinusoidal ---
  inSine: (t: number): number => 1 - Math.cos(t * Math.PI / 2),
  outSine: (t: number): number => Math.sin(t * Math.PI / 2),
  inOutSine: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,

  // --- Exponential ---
  inExpo: (t: number): number => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  outExpo: (t: number): number => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inOutExpo: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // --- Circular ---
  inCirc: (t: number): number => 1 - Math.sqrt(1 - t * t),
  outCirc: (t: number): number => Math.sqrt(1 - (t - 1) * (t - 1)),
  inOutCirc: (t: number): number => {
    return t < 0.5
      ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  },

  // --- Back (overshoots) ---
  inBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const t1 = t - 1;
    return 1 + c3 * t1 * t1 * t1 + c1 * t1 * t1;
  },
  inOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // --- Elastic (bouncy) ---
  inElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  outElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  inOutElastic: (t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c5 = (2 * Math.PI) / 4.5;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // --- Bounce ---
  inBounce: (t: number): number => 1 - Easing.outBounce(1 - t),
  outBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      const t1 = t - 1.5 / d1;
      return n1 * t1 * t1 + 0.75;
    } else if (t < 2.5 / d1) {
      const t1 = t - 2.25 / d1;
      return n1 * t1 * t1 + 0.9375;
    } else {
      const t1 = t - 2.625 / d1;
      return n1 * t1 * t1 + 0.984375;
    }
  },
  inOutBounce: (t: number): number => {
    return t < 0.5
      ? (1 - Easing.outBounce(1 - 2 * t)) / 2
      : (1 + Easing.outBounce(2 * t - 1)) / 2;
  },
} as const;

export type EasingType = typeof Easing;
export type EasingFunction = (t: number) => number;
export type EasingName = keyof typeof Easing;

