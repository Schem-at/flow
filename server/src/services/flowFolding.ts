/**
 * Flow folding cache — compile a flow graph into a single script ONCE per
 * content hash and reuse it across requests. Compilation is pure string
 * transformation (no user code runs), so it's safe on the main thread; the
 * folded script itself still executes inside the killable worker.
 */

import { compileFlow, hashFlow, type CompiledFlow, type FlowLike } from '@flow/core';

const MAX_ENTRIES = 100;
const cache = new Map<string, CompiledFlow>();

export interface FoldOutcome {
  folded: CompiledFlow | null;
  cached: boolean;
  /** Why folding was skipped (falls back to per-node engine execution). */
  reason?: string;
}

export function getFoldedFlow(flow: FlowLike): FoldOutcome {
  let hash: string;
  try {
    hash = hashFlow(flow);
  } catch (error) {
    return { folded: null, cached: false, reason: (error as Error).message };
  }

  const hit = cache.get(hash);
  if (hit) {
    // LRU refresh
    cache.delete(hash);
    cache.set(hash, hit);
    return { folded: hit, cached: true };
  }

  try {
    const folded = compileFlow(flow);
    cache.set(hash, folded);
    if (cache.size > MAX_ENTRIES) {
      cache.delete(cache.keys().next().value!);
    }
    return { folded, cached: false };
  } catch (error) {
    return { folded: null, cached: false, reason: (error as Error).message };
  }
}

export function foldCacheStats(): { entries: number } {
  return { entries: cache.size };
}
