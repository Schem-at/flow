/**
 * Pluggable runtime providers — each provider contributes a set of endowments
 * (ambient globals) to block execution. Swapping a nucleation version or adding
 * a new domain library is a one-file change: a new provider module + one
 * registry line. Engine and block authors are untouched.
 */

import type { LogCallback } from '../utils/logger.js';

export interface RuntimeEnv {
  /** Where this worker runs. Environment branching belongs INSIDE providers. */
  kind: 'browser' | 'node';
  /** Worker-level log sink (wired to postMessage in the browser worker). */
  logCallback?: LogCallback;
  /** Worker-level progress sink. */
  progressCallback?: (message: string, percent?: number, data?: unknown) => void;
  /** Seed for deterministic providers (Noise). */
  seed?: string | number;
  /**
   * Schemati platform access (the Schemati ambient). Browser workers default
   * to same-origin; node workers fall back to SCHEMATI_URL / SCHEMATI_API_TOKEN.
   */
  schemati?: { baseUrl?: string; token?: string };
}

export interface RuntimeProvider {
  /** e.g. 'nucleation' */
  name: string;
  /** e.g. '0.2.13' */
  version: string;
  /**
   * Called once per worker; returns the endowments to inject (e.g. { Schematic, … }).
   * Heavy init (WASM) happens here, in trusted scope, and is cached by the registry.
   * `context` holds the endowments assembled by earlier providers, so a later
   * provider can build on them (e.g. Schemati.getSchematic uses Schematic).
   */
  create(env: RuntimeEnv, context?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function detectRuntimeEnvKind(): RuntimeEnv['kind'] {
  // Covers window (main thread) and self (dedicated workers).
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { importScripts?: unknown; document?: unknown }).document !==
      'undefined'
  ) {
    return 'browser';
  }
  if (
    typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !==
    'undefined'
  ) {
    return 'browser';
  }
  return 'node';
}
