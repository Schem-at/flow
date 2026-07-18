/**
 * FlowType — the canonical, serializable type descriptor.
 *
 * Every block contract type resolves to this plain-JSON discriminated union so it
 * crosses the worker boundary, persists, and drives the UI uniformly (input
 * widgets + output viewers recurse over the tree). The set of kinds is
 * extensible: new domain kinds are added here and in the client type registry.
 */

export type FlowType =
  | {
      kind: 'number';
      min?: number;
      max?: number;
      step?: number;
      default?: number;
      widget?: 'input' | 'slider';
    }
  | { kind: 'string'; default?: string; multiline?: boolean; required?: boolean }
  | { kind: 'boolean'; default?: boolean }
  | { kind: 'enum'; options: Array<string | number>; default?: string | number }
  | { kind: 'block'; default?: string } // domain: a minecraft block id
  | { kind: 'schematic' } // domain: nucleation Schematic
  | { kind: 'image' } // domain
  | { kind: 'vec3'; default?: [number, number, number] }
  | { kind: 'list'; of: FlowType; default?: unknown[]; length?: number } // length set ⇒ fixed-size
  | { kind: 'object'; fields: Record<string, FlowType> }
  | { kind: 'unknown' }; // fallback → JSON editor / JSON tree

export type FlowTypeKind = FlowType['kind'];

/** A block's contract: what `Inputs` and `Outputs` resolve to. */
export interface BlockContract {
  inputs: Record<string, FlowType>;
  outputs: Record<string, FlowType>;
}

export const EMPTY_CONTRACT: BlockContract = { inputs: {}, outputs: {} };

/** Sensible default value per kind (used when the type carries no default). */
export function defaultValueForType(type: FlowType): unknown {
  switch (type.kind) {
    case 'number':
      return type.default ?? type.min ?? 0;
    case 'string':
      return type.default ?? '';
    case 'boolean':
      return type.default ?? false;
    case 'enum':
      return type.default ?? type.options[0];
    case 'block':
      return type.default ?? 'minecraft:stone';
    case 'vec3':
      return type.default ?? [0, 0, 0];
    case 'list':
      return type.default ?? [];
    case 'object': {
      const value: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(type.fields)) {
        value[key] = defaultValueForType(field);
      }
      return value;
    }
    case 'schematic':
    case 'image':
    case 'unknown':
      return null;
  }
}

/** Default values for a whole contract's inputs. */
export function defaultInputsForContract(contract: BlockContract): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const [name, type] of Object.entries(contract.inputs)) {
    inputs[name] = defaultValueForType(type);
  }
  return inputs;
}

/**
 * Structural validation of a value against a FlowType.
 * Domain kinds (schematic/image) accept any non-null object — their real
 * validation lives with the runtime objects.
 */
export function validateValue(type: FlowType, value: unknown): string | null {
  switch (type.kind) {
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) return 'expected a number';
      if (type.min !== undefined && value < type.min) return `must be ≥ ${type.min}`;
      if (type.max !== undefined && value > type.max) return `must be ≤ ${type.max}`;
      return null;
    }
    case 'string':
      return typeof value === 'string' ? null : 'expected a string';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'expected a boolean';
    case 'enum':
      return type.options.includes(value as string | number)
        ? null
        : `expected one of: ${type.options.join(', ')}`;
    case 'block':
      return typeof value === 'string' && value.length > 0
        ? null
        : 'expected a block id string';
    case 'vec3':
      return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number')
        ? null
        : 'expected [x, y, z] numbers';
    case 'list': {
      if (!Array.isArray(value)) return 'expected a list';
      for (let i = 0; i < value.length; i++) {
        const err = validateValue(type.of, value[i]);
        if (err) return `item ${i}: ${err}`;
      }
      return null;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null) return 'expected an object';
      for (const [key, field] of Object.entries(type.fields)) {
        const err = validateValue(field, (value as Record<string, unknown>)[key]);
        if (err) return `${key}: ${err}`;
      }
      return null;
    }
    case 'schematic':
    case 'image':
      return value !== null && value !== undefined ? null : 'missing value';
    case 'unknown':
      return null;
  }
}

/**
 * Type compatibility for node-editor edges: can a value of `source` flow into
 * a port of `target`?
 */
export function isTypeCompatible(source: FlowType, target: FlowType): boolean {
  if (target.kind === 'unknown' || source.kind === 'unknown') return true;
  if (source.kind === 'enum' && target.kind === 'string') return true;
  if (source.kind === 'string' && target.kind === 'block') return true;
  if (source.kind === 'block' && target.kind === 'string') return true;
  if (source.kind !== target.kind) return false;
  if (source.kind === 'list' && target.kind === 'list') {
    return isTypeCompatible(source.of, target.of);
  }
  if (source.kind === 'object' && target.kind === 'object') {
    return Object.entries(target.fields).every(([key, field]) => {
      const sourceField = source.fields[key];
      return sourceField !== undefined && isTypeCompatible(sourceField, field);
    });
  }
  return true;
}
