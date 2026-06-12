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

/** Best-effort inverse: legacy port → FlowType (widget info is lossy). */
export function legacyPortToFlowType(port: IOPort): FlowType {
  switch (port.type) {
    case 'number':
      return {
        kind: 'number',
        min: port.min,
        max: port.max,
        step: port.step,
        default: port.default as number | undefined,
        // A bounded number renders best as a slider; bare numbers stay plain.
        widget: port.min !== undefined && port.max !== undefined ? 'slider' : undefined,
      };
    case 'string':
      if (port.options?.length) {
        return { kind: 'enum', options: port.options, default: port.default as string | undefined };
      }
      return { kind: 'string', default: port.default as string | undefined };
    case 'boolean':
      return { kind: 'boolean', default: port.default as boolean | undefined };
    case 'schematic':
      return { kind: 'schematic' };
    case 'array':
      return { kind: 'list', of: { kind: 'unknown' } };
    default:
      return { kind: 'unknown' };
  }
}

/**
 * Legacy IODefinition → BlockContract, for module records published before
 * folded sources carried type declarations. Prefer parsing the code itself.
 */
export function ioToContract(io: IODefinition): BlockContract {
  const map = (record: Record<string, IOPort> | undefined) =>
    Object.fromEntries(
      Object.entries(record ?? {}).map(([k, p]) => [k, legacyPortToFlowType(p)])
    );
  return { inputs: map(io.inputs), outputs: map(io.outputs) };
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
