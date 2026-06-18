/**
 * ProviderRegistry — assembles all runtime providers into the execution context.
 * Providers initialize once per worker (heavy WASM init included) and the
 * assembled context is cached; each execution is endowed with the cached objects.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { detectRuntimeEnvKind } from './types.js';
import { buildRuntimeDts } from '../runtime-types.js';
import { flowlibProvider } from './flowlib.js';
import { vendorProvider } from './vendor.js';
import { nucleationProvider } from './nucleation.js';
import { schematiProvider } from './schemati.js';
import { romProvider } from './rom.js';
import { asmProvider } from './asm.js';

export class ProviderRegistry {
  private providers: RuntimeProvider[] = [];
  private cached: Promise<Record<string, unknown>> | null = null;

  register(provider: RuntimeProvider): this {
    this.providers.push(provider);
    this.cached = null;
    return this;
  }

  list(): Array<{ name: string; version: string }> {
    return this.providers.map(({ name, version }) => ({ name, version }));
  }

  /** Registered providers (for codegen / drift checks). */
  getProviders(): readonly RuntimeProvider[] {
    return this.providers;
  }

  /** Full generated `flow-runtime.d.ts` text, in registration order. */
  runtimeDts(): string {
    return buildRuntimeDts(this.providers.map((p) => p.declarations?.() ?? '').filter(Boolean));
  }

  /** Declared endowment keys per provider — the drift guard's expectation. */
  endowmentManifest(): Array<{ name: string; version: string; keys: string[] }> {
    return this.providers.map((p) => ({ name: p.name, version: p.version, keys: p.endowmentKeys?.() ?? [] }));
  }

  /**
   * Assemble (or return the cached) execution context.
   * Later providers override earlier ones on key collisions.
   */
  createContext(env: Partial<RuntimeEnv> = {}): Promise<Record<string, unknown>> {
    if (!this.cached) {
      const fullEnv: RuntimeEnv = {
        kind: env.kind ?? detectRuntimeEnvKind(),
        logCallback: env.logCallback,
        progressCallback: env.progressCallback,
        seed: env.seed,
      };
      this.cached = this.assemble(fullEnv);
    }
    return this.cached;
  }

  private async assemble(env: RuntimeEnv): Promise<Record<string, unknown>> {
    const context: Record<string, unknown> = {};
    for (const provider of this.providers) {
      try {
        // Later providers receive (and may build on) earlier endowments.
        Object.assign(context, await provider.create(env, context));
      } catch (error) {
        throw new Error(
          `Provider '${provider.name}@${provider.version}' failed to initialize: ${(error as Error).message}`
        );
      }
    }
    return context;
  }
}

/**
 * The default registry: standard pure-JS helpers + nucleation WASM.
 * Adding a domain library = one provider module + one .register() line here.
 */
export function createDefaultRegistry(): ProviderRegistry {
  return new ProviderRegistry()
    // flowlib first (math/noise/fields) — Field.fromNoise reads context.Noise lazily.
    .register(flowlibProvider)
    .register(vendorProvider)
    // Pure-JS, ISA-AGNOSTIC assembler primitives — no deps, order-independent.
    // Asm: build an assembler for any ISA. Rom: bytes → roms.py ROM. (ARPU is example
    // content built on these, not a platform primitive — there is no `Arpu` global.)
    .register(romProvider)
    .register(asmProvider)
    // After nucleation: Schemati.getSchematic / Field.toTerrain build on Schematic.
    .register(nucleationProvider)
    .register(schematiProvider);
}
