import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROVIDER_ENDOWMENT_KEYS } from '@flow/core';

/**
 * Editor ambient-dts drift guard.
 *
 * Block code runs with the provider-endowed globals (PROVIDER_ENDOWMENT_KEYS),
 * but the Monaco editor only knows the globals declared in AMBIENT_DTS. If a new
 * global is endowed at runtime but never declared here, the editor flags it as
 * `Cannot find name 'X'.(2304)` even though the code runs fine. (That happened
 * with Asm/Rom.) This test fails if any endowed global lacks an editor decl.
 */

// Globals that are legitimately NOT in AMBIENT_DTS:
// - Math: a JS built-in TS already knows about.
// - __hostNow: internal infra endowment (host-backed read-only clock used by
//   the trace instrumentation for SES-safe per-node timing); not author-facing,
//   so it is intentionally not surfaced in the Monaco editor types.
const PROVIDED_ELSEWHERE = new Set(['Math', '__hostNow']);

// Read the source directly (avoids importing ambient.ts, which pulls the
// `virtual:nucleation-dts` Vite module). vitest runs with cwd = client root.
const ambientSrc = readFileSync(
  resolve(process.cwd(), 'src/lib/block/ambient.ts'),
  'utf8',
);

const endowedGlobals = [...new Set(Object.values(PROVIDER_ENDOWMENT_KEYS).flat())];

describe('AMBIENT_DTS editor declarations', () => {
  it('declares every endowed runtime global (or allowlists it)', () => {
    const missing = endowedGlobals.filter((name) => {
      if (PROVIDED_ELSEWHERE.has(name)) return false;
      return !new RegExp(`declare (const|class) ${name}\\b`).test(ambientSrc);
    });
    expect(missing, `endowed globals missing an editor \`declare\` in ambient.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares the assembler/ROM primitives specifically', () => {
    expect(ambientSrc).toMatch(/declare const Asm\b/);
    expect(ambientSrc).toMatch(/declare const Rom\b/);
  });
});
