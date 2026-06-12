import type { BlockContract } from '@flow/core';

/**
 * Domain inputs (schematic/image) have no synthesizable default — running a
 * block without them produces opaque null errors. Strings can opt in via
 * TextField<{ required: true }> (an empty string is treated as missing).
 * Returns the human-readable list of such inputs that are still empty.
 */
export function missingRequiredInputs(
  contract: BlockContract | undefined,
  inputs: Record<string, unknown>
): string[] {
  if (!contract) return [];
  return Object.entries(contract.inputs)
    .filter(([name, type]) => {
      const value = inputs[name];
      if (type.kind === 'schematic' || type.kind === 'image') {
        return value === null || value === undefined;
      }
      if (type.kind === 'string' && type.required) {
        return value === null || value === undefined || String(value).trim() === '';
      }
      return false;
    })
    .map(([name, type]) => `${name} (${type.kind})`);
}

export function missingInputsMessage(missing: string[]): string {
  return `Missing required input${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} — connect a source node or provide a file`;
}
