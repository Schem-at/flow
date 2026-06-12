/**
 * Standard pure-JS providers: Vec, Noise, Logger, Calculator, Easing,
 * Pathfinding, Progress, Math. No WASM, no env branching.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { Calculator } from '../utils/calculator.js';
import { Easing } from '../utils/easing.js';
import { createLogger } from '../utils/logger.js';
import { createNoiseProvider } from '../utils/noise.js';
import { VectorUtils } from '../utils/vector.js';
import { Pathfinding } from '../utils/pathfinding.js';

export interface ProgressReporter {
  report: (percent: number, message?: string, data?: unknown) => void;
  step: (current: number, total: number, message?: string) => void;
  log: (message: string, data?: unknown) => void;
  /** step(i+1, total) sugar for loops: `for (...) Progress.tick(i, total)`. */
  tick: (index: number, total: number, message?: string) => void;
  /** Iterate `items`, reporting progress per element — no manual percent math. */
  wrap: <T, R>(items: T[], fn: (item: T, index: number) => R, message?: string) => R[];
}

function createProgressReporter(
  callback?: (message: string, percent?: number, data?: unknown) => void
): ProgressReporter {
  const reporter: ProgressReporter = {
    report: (percent: number, message = '', data = null) => {
      const clampedPercent = Math.max(0, Math.min(100, percent));
      callback?.(message || `Progress: ${clampedPercent}%`, clampedPercent, data);
    },
    step: (current: number, total: number, message = '') => {
      const percent = (current / total) * 100;
      const stepMessage = message || `Step ${current} of ${total}`;
      callback?.(stepMessage, percent, null);
    },
    log: (message: string, data = null) => {
      callback?.(message, undefined, data);
    },
    tick: (index: number, total: number, message = '') => {
      reporter.step(index + 1, Math.max(1, total), message);
    },
    wrap: (items, fn, message = '') => {
      return items.map((item, index) => {
        reporter.tick(index, items.length, message);
        return fn(item, index);
      });
    },
  };
  return reporter;
}

export const standardProvider: RuntimeProvider = {
  name: 'standard',
  version: '1.0.0',

  async create(env: RuntimeEnv) {
    return {
      Calculator,
      Easing,
      Logger: createLogger(env.logCallback),
      Noise: createNoiseProvider(env.seed),
      Progress: createProgressReporter(env.progressCallback),

      Vec: VectorUtils,
      Vec2: VectorUtils.Vec2,
      Vec3: VectorUtils.Vec3,

      Pathfinding,

      // Math's built-ins are non-enumerable — spread/assign would produce an
      // empty shadow. Prototype-chain it instead so sin/cos/… resolve.
      Math: Object.assign(Object.create(Math), {
        TAU: Math.PI * 2,
      }),
    };
  },
};
