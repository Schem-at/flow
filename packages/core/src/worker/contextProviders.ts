/**
 * Context providers for the execution environment.
 *
 * Thin wrapper around the ProviderRegistry (../providers): all endowments —
 * nucleation WASM included — come from registered RuntimeProviders, initialized
 * once per worker and cached.
 */

import type { LogCallback } from '../utils/logger.js';
import { Calculator } from '../utils/calculator.js';
import { Easing } from '../utils/easing.js';
import { createNoiseProvider } from '../utils/noise.js';
import { VectorUtils } from '../utils/vector.js';
import type { ContextProviders } from '../services/SynthaseService.js';
import { createDefaultRegistry, ProviderRegistry } from '../providers/index.js';

export type { ProgressReporter } from '../providers/standard.js';

export interface ContextProviderOptions {
  logCallback?: LogCallback;
  progressCallback?: (message: string, percent?: number, data?: unknown) => void;
  seed?: string | number;
  customProviders?: Record<string, unknown>;
  /** Override the provider registry (defaults to standard + nucleation). */
  registry?: ProviderRegistry;
}

/** One registry per worker — providers init once, context is cached. */
let defaultRegistry: ProviderRegistry | null = null;

function getDefaultRegistry(): ProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createDefaultRegistry();
  }
  return defaultRegistry;
}

/**
 * Create all context providers for block execution (async — may load WASM once).
 */
export async function createContextProviders(
  options: ContextProviderOptions = {}
): Promise<ContextProviders> {
  const { logCallback, progressCallback, seed, customProviders = {}, registry } = options;

  const context = await (registry ?? getDefaultRegistry()).createContext({
    logCallback,
    progressCallback,
    seed,
  });

  return {
    ...context,
    // Spread custom providers last so they can override defaults
    ...customProviders,
  };
}

/**
 * Create minimal context providers (no async initialization)
 * Useful for validation or quick operations
 */
export function createMinimalContextProviders(
  options: Omit<ContextProviderOptions, 'logCallback' | 'progressCallback'> = {}
): ContextProviders {
  const { seed, customProviders = {} } = options;

  const Noise = createNoiseProvider(seed);

  return {
    Calculator,
    Easing,
    Noise,
    Vec: VectorUtils,
    Vec2: VectorUtils.Vec2,
    Vec3: VectorUtils.Vec3,
    Math: Object.assign({}, Math, {
      TAU: Math.PI * 2,
    }),
    ...customProviders,
  };
}
