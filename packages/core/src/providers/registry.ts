/**
 * ProviderRegistry — assembles all runtime providers into the execution context.
 * Providers initialize once per worker (heavy WASM init included) and the
 * assembled context is cached; each execution is endowed with the cached objects.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { detectRuntimeEnvKind } from './types.js';
import { standardProvider } from './standard.js';
import { nucleationProvider } from './nucleation.js';
import { schematiProvider } from './schemati.js';
import { toolkitProvider } from './toolkit.js';

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
    .register(standardProvider)
    .register(nucleationProvider)
    // After standard + nucleation: Field.fromNoise/toTerrain build on them.
    .register(toolkitProvider)
    // After nucleation: Schemati.getSchematic rehydrates via the Schematic class.
    .register(schematiProvider);
}
