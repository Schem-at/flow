/**
 * Assembler-construction-kit provider — endows the `Asm` ambient global so block
 * authors can build an assembler for their OWN ISA: tokeniser, label table,
 * bitfield packer, and the declarative `define()` two-pass driver. Pure JS, a
 * thin endowment over asm/kit.ts. This is what makes Flow a platform for
 * assemblers: bring an IsaSpec → get an assembler for free.
 */

import type { RuntimeProvider } from './types.js';
import { PROVIDER_DECLARATIONS, PROVIDER_ENDOWMENT_KEYS } from '../runtime-types.js';
import {
  define,
  parseNumber,
  stripComments,
  normalizeLines,
  tokenizeLines,
  LabelTable,
  pack,
  packBytes,
} from '../asm/kit.js';

export const ASM_VERSION = '1.0.0';

export const asmProvider: RuntimeProvider = {
  name: 'asm',
  version: ASM_VERSION,
  endowmentKeys: () => PROVIDER_ENDOWMENT_KEYS.asm,
  declarations: () => PROVIDER_DECLARATIONS.asm,

  async create() {
    return {
      Asm: { define, parseNumber, stripComments, normalizeLines, tokenizeLines, LabelTable, pack, packBytes },
    };
  },
};
