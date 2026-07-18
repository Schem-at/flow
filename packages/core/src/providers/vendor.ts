/**
 * vendor provider — wrapped third-party libraries (category: vendor).
 *
 * The home for libraries we pin + wrap rather than author. Today: Pathfinding
 * (graph / A*). Future graph/geometry/noise packages register here. Kept apart
 * from flowlib so "first-party we maintain" vs "external we vendor" is explicit.
 */

import type { RuntimeProvider } from './types.js';
import { Pathfinding } from '../utils/pathfinding.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';

export const vendorProvider: RuntimeProvider = {
  name: 'vendor',
  version: '1.0.0',
  endowmentKeys: () => PROVIDER_ENDOWMENT_KEYS.vendor,
  declarations: () => PROVIDER_DECLARATIONS.vendor,

  async create() {
    return { Pathfinding };
  },
};
