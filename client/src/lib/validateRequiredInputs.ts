import type { BlockContract } from '@flow/core';

/**
 * Domain inputs (schematic/image) have no synthesizable default — running a
 * block without them produces opaque null errors. Returns the human-readable
 * list of such inputs that are still empty.
 */
export function missingRequiredInputs(
  contract: BlockContract | undefined,
  inputs: Record<string, unknown>
): string[] {
  if (!contract) return [];
  return Object.entries(contract.inputs)
    .filter(
      ([name, type]) =>
        (type.kind === 'schematic' || type.kind === 'image') &&
        (inputs[name] === null || inputs[name] === undefined)
    )
    .map(([name, type]) => `${name} (${type.kind})`);
}

export function missingInputsMessage(missing: string[]): string {
  return `Missing required input${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} — connect a source node or provide a file`;
}
