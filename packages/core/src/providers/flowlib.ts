/**
 * flowlib provider — the first-party helper library (category: flowlib).
 *
 * Aggregates the two building-block providers (standard: math/noise/vectors/
 * runtime-services; toolkit: fields/images/random/tables/mcfunction/grid) into
 * one category endowment, minus the vendor bits (Pathfinding lives in the
 * vendor provider). This is the single place a node author's "flowlib" globals
 * come from, and it owns the flowlib slice of flow-runtime.d.ts.
 */

import type { RuntimeProvider, RuntimeEnv } from './types.js';
import { standardProvider } from './standard.js';
import { toolkitProvider } from './toolkit.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';

export const flowlibProvider: RuntimeProvider = {
  name: 'flowlib',
  version: '1.0.0',
  endowmentKeys: () => PROVIDER_ENDOWMENT_KEYS.flowlib,
  declarations: () => PROVIDER_DECLARATIONS.flowlib,

  async create(env: RuntimeEnv, context: Record<string, unknown> = {}) {
    const std = await standardProvider.create(env, context);
    // Pathfinding is re-homed to the vendor provider; flowlib excludes it.
    delete (std as Record<string, unknown>).Pathfinding;
    // Make the just-built endowments (Noise, …) visible to toolkit's
    // context-coupled builders (Field.fromNoise reads context.Noise lazily).
    Object.assign(context, std);
    const tk = await toolkitProvider.create(env, context);
    return { ...std, ...tk };
  },
};
