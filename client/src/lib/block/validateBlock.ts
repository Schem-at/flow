/**
 * Code-node source validation used by the editor's CodePanel: legacy-format
 * check, contract parse, and the `generate` entry-point check.
 */

import type { BlockContract, IODefinition } from '@flow/core';
import { parseBlockSource, type ParsedBlock } from './parser';
import { contractToIO } from './io-compat';

export type BlockValidation =
  | { status: 'valid'; parsed: ParsedBlock; contract: BlockContract; io: IODefinition }
  | { status: 'invalid'; parsed?: ParsedBlock; error: string };

export async function validateBlockSource(code: string): Promise<BlockValidation> {
  if (code.includes('export default')) {
    return {
      status: 'invalid',
      error:
        'Legacy script format (`export default`). Blocks now declare `type Inputs`/`type Outputs` and a top-level `function generate(inputs: Inputs): Outputs` entry, with no exports.',
    };
  }

  let parsed: ParsedBlock;
  try {
    // Types ARE the contract: parse Inputs/Outputs into the descriptor tree.
    parsed = await parseBlockSource(code);
  } catch (error) {
    return { status: 'invalid', error: `Parse error: ${(error as Error).message}` };
  }

  const entryError = generateEntryError(parsed);
  if (entryError) return { status: 'invalid', parsed, error: entryError };

  const contract = parsed.contract;
  return { status: 'valid', parsed, contract, io: contractToIO(contract) };
}

const ENTRY_HINT = 'e.g. `function generate(inputs: Inputs): Outputs { … }`';

/**
 * Structural check of the entry point, matching what the runtime actually calls
 * (packages/core compile: `generate(__inputs)` for the object form, or
 * `generate(a, b, …)` spread from the inputs for typed positional parameters).
 * The parameter NAME is never checked; only shape. Returns null when valid.
 */
export function generateEntryError(parsed: ParsedBlock): string | null {
  const entries = parsed.generateEntries;
  if (entries.length === 0) {
    return `No top-level \`generate\` function found. Declare one at the top level of the block, ${ENTRY_HINT} or \`const generate = (inputs: Inputs): Outputs => …\`. A mention in a comment, a call, or a nested declaration does not count.`;
  }
  if (entries.length > 1) {
    return `\`generate\` is declared ${entries.length} times (lines ${entries.map((e) => e.line).join(', ')}). Keep exactly one entry point.`;
  }

  const [entry] = entries;
  if (entry.form === 'value') {
    return `\`generate\` must be a function (line ${entry.line}), ${ENTRY_HINT} or an arrow function assigned to \`const generate\`.`;
  }

  const inputCount = Object.keys(parsed.contract.inputs).length;
  const { params } = entry;
  if (params.length === 0) {
    return inputCount > 0
      ? `\`generate\` takes no parameter, but the block declares ${inputCount} input${inputCount === 1 ? '' : 's'} it could never read. Take them as one object parameter, ${ENTRY_HINT}.`
      : null;
  }

  const rest = params.find((p) => p.rest);
  if (rest) {
    return `\`generate\` cannot use a rest parameter (\`...${rest.name ?? 'args'}\`). Take the inputs as one object parameter, ${ENTRY_HINT}.`;
  }

  if (params.length > 1) {
    // Positional form: each parameter is one input port, filled by name.
    for (const [i, p] of params.entries()) {
      if (p.name === null) {
        return `\`generate\` parameter ${i + 1} is a destructuring pattern. With several parameters each one is a separate input and must be a plain name with a type, e.g. \`generate(size: number, seed: number)\`.`;
      }
      if (!p.typed) {
        return `\`generate\` parameter \`${p.name}\` has no type annotation. With several parameters each one is a separate input port and needs a type (e.g. \`${p.name}: number\`), otherwise it never receives a value.`;
      }
    }
  }
  return null;
}
