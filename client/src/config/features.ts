/**
 * Static feature flags.
 *
 * Each flag reads a Vite env var (VITE_FEATURE_*) and falls back to a default
 * when the var is unset. Defaults are ON so local dev keeps every surface; to
 * disable a surface for a deploy, set the matching var to a falsy value
 * (false / 0 / off / no) in that environment, e.g.
 *
 *   VITE_FEATURE_SCHEMATI_NODES=false
 *   VITE_FEATURE_MODULES=false
 *   VITE_FEATURE_API_EXECUTION=false
 *
 * These are build-time values (Vite inlines import.meta.env), so flipping a var
 * requires a rebuild of the client.
 */

function flag(raw: string | boolean | undefined, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return !['false', '0', 'off', 'no'].includes(raw.toLowerCase());
}

export const features = {
  /** Schemati schematic nodes (input/output/viewer) + the Schemati node palette. */
  schematiNodes: flag(import.meta.env.VITE_FEATURE_SCHEMATI_NODES, false),
  /** The module system: publishing, browsing, versioning/releasing code modules. */
  modules: flag(import.meta.env.VITE_FEATURE_MODULES, false),
  /** The external execution API surface: the API panel, its docs and run button. */
  apiExecution: flag(import.meta.env.VITE_FEATURE_API_EXECUTION, false),
} as const;

export type FeatureName = keyof typeof features;
