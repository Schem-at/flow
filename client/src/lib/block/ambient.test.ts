import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '@flow/core';
import { AMBIENT_DTS, NUCLEATION_AMBIENT_DTS } from './ambient';

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
const ambientSrc = AMBIENT_DTS + NUCLEATION_AMBIENT_DTS;

const endowedGlobals = [...new Set(createDefaultRegistry().endowmentManifest().flatMap(provider => provider.keys))];

describe('AMBIENT_DTS editor declarations', () => {
  it('declares every endowed runtime global (or allowlists it)', () => {
    const missing = endowedGlobals.filter((name) => {
      if (PROVIDED_ELSEWHERE.has(name)) return false;
      // A global may also be declared via interface-merging (e.g. `Schematic`,
      // whose real class now comes from nucleation's own bundled .d.ts, with
      // ambient.ts only merging in the DX convenience methods).
      return !new RegExp(`declare (const|class|namespace) ${name}\\b|\\binterface ${name}\\b`).test(ambientSrc);
    });
    expect(missing, `endowed globals missing an editor \`declare\` in ambient.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares the assembler/ROM primitives specifically', () => {
    expect(ambientSrc).toMatch(/declare const Asm\b/);
    expect(ambientSrc).toMatch(/declare const Rom\b/);
  });
});
