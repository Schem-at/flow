/**
 * Bridges the v2 BlockContract to the legacy IODefinition consumed by older
 * editor surfaces (port rendering fallbacks, module publishing, input-node
 * auto-creation). New code should use the contract directly.
 */

import type { BlockContract, FlowType, IODefinition, IOPort } from '@flow/core';
import { defaultValueForType } from '@flow/core';

export function flowTypeToLegacyPort(type: FlowType): IOPort {
  switch (type.kind) {
    case 'number':
      return {
        type: 'number',
        default: type.default,
        min: type.min,
        max: type.max,
        step: type.step,
      };
    case 'string':
      return { type: 'string', default: type.default };
    case 'boolean':
      return { type: 'boolean', default: type.default };
    case 'enum':
      return {
        type: 'string',
        options: type.options.map(String),
        default: type.default ?? type.options[0],
      };
    case 'block':
      return { type: 'string', default: type.default ?? 'minecraft:stone' };
    case 'vec3':
      return { type: 'array', default: type.default ?? defaultValueForType(type) };
    case 'list':
      return { type: 'array' };
    case 'schematic':
      return { type: 'schematic' };
    case 'image':
    case 'object':
    case 'unknown':
      return { type: 'object' };
  }
}

export function contractToIO(contract: BlockContract): IODefinition {
  const map = (record: Record<string, FlowType>) =>
    Object.fromEntries(Object.entries(record).map(([k, t]) => [k, flowTypeToLegacyPort(t)]));
  return {
    inputs: map(contract.inputs),
    outputs: map(contract.outputs),
  } as IODefinition;
}

/** Contract matching DEFAULT_BLOCK_SOURCE — new nodes get typed ports immediately. */
export const DEFAULT_BLOCK_CONTRACT: BlockContract = {
  inputs: {
    size: { kind: 'number', widget: 'slider', min: 1, max: 64, default: 8 },
    material: { kind: 'block', default: 'minecraft:stone' },
  },
  outputs: {
    result: { kind: 'schematic' },
  },
};

/** Default source for a freshly added code node — the v2 block format. */
export const DEFAULT_BLOCK_SOURCE = `type Inputs = {
  size: Slider<{ min: 1; max: 64; default: 8 }>;
  material: Block<{ default: 'minecraft:stone' }>;
};

type Outputs = {
  result: Schematic;
};

function generate(inputs) {
  const result = new Schematic();
  for (let x = 0; x < inputs.size; x++) {
    result.set_block(x, 0, 0, inputs.material);
  }
  return { result };
}
`;
