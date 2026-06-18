/**
 * Generic ROM provider — endows the `Rom` ambient global so block code can turn
 * ANY byte stream into the schematic-api roms.py digit string or spatial
 * placements, with no ISA coupling. Pure JS (no WASM): a thin endowment over
 * asm/rom.ts. Any assembler output (or raw data) can feed it.
 */

import type { RuntimeProvider } from './types.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';
import { romData, romLayout, romLayoutData, digitsPerByte } from '../asm/rom.js';

export const ROM_VERSION = '1.0.0';

export const romProvider: RuntimeProvider = {
  name: 'rom',
  version: ROM_VERSION,
  endowmentKeys: () => PROVIDER_ENDOWMENT_KEYS.rom,
  declarations: () => PROVIDER_DECLARATIONS.rom,

  async create() {
    return {
      Rom: { data: romData, layout: romLayout, layoutData: romLayoutData, digitsPerByte },
    };
  },
};
