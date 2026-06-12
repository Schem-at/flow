/**
 * Contract code generator — BlockContract (FlowType descriptors) → TypeScript
 * contract source. Inverse of the client parser: parseBlockSource(
 * composeBlockSource(c, body)) round-trips `c` for every contract this
 * generator can emit. Lives in core so flow folding can emit real type
 * declarations, making folded flows first-class (parseable) blocks.
 */

import type { BlockContract, FlowType } from '../types/flow-type.js';

/** Emit clean `type Inputs = {...};` / `type Outputs = {...};` declarations. */
export function contractToTypeScript(contract: BlockContract): string {
  return [
    `type Inputs = ${emitRecord(contract.inputs)};`,
    '',
    `type Outputs = ${emitRecord(contract.outputs)};`,
  ].join('\n');
}

/** Contract + body → a full block source file (single trailing newline). */
export function composeBlockSource(contract: BlockContract, bodyText: string): string {
  const body = bodyText.trim();
  const contractSource = contractToTypeScript(contract);
  return body.length > 0 ? `${contractSource}\n\n${body}\n` : `${contractSource}\n`;
}

/** Top-level record: multiline with 2-space indent (or `{}` when empty). */
function emitRecord(fields: Record<string, FlowType>): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([name, type]) => `  ${name}: ${emitType(type)};`);
  return `{\n${lines.join('\n')}\n}`;
}

function emitType(type: FlowType): string {
  switch (type.kind) {
    case 'number':
      return emitNumber(type);
    case 'string':
      if (type.multiline) {
        return type.default !== undefined
          ? `Textarea<{ default: ${quote(type.default)} }>`
          : 'Textarea';
      }
      return 'string';
    case 'boolean':
      return type.default !== undefined ? `Toggle<{ default: ${type.default} }>` : 'boolean';
    case 'enum':
      return type.options
        .map((option) => (typeof option === 'string' ? quote(option) : String(option)))
        .join(' | ');
    case 'block':
      return type.default !== undefined ? `Block<{ default: ${quote(type.default)} }>` : 'Block';
    case 'schematic':
      return 'Schematic';
    case 'image':
      return 'Image';
    case 'vec3':
      return 'Vec3';
    case 'list': {
      const inner = emitType(type.of);
      // Parenthesize unions so `('a' | 'b')[]` parses as a list of the union.
      return type.of.kind === 'enum' ? `(${inner})[]` : `${inner}[]`;
    }
    case 'object': {
      const entries = Object.entries(type.fields);
      if (entries.length === 0) return '{}';
      const members = entries.map(([name, field]) => `${name}: ${emitType(field)}`);
      return `{ ${members.join('; ')} }`;
    }
    case 'unknown':
      return 'any';
  }
}

function emitNumber(type: Extract<FlowType, { kind: 'number' }>): string {
  const props: string[] = [];
  if (type.min !== undefined) props.push(`min: ${type.min}`);
  if (type.max !== undefined) props.push(`max: ${type.max}`);
  if (type.step !== undefined) props.push(`step: ${type.step}`);
  if (type.default !== undefined) props.push(`default: ${type.default}`);

  if (type.widget === 'slider') {
    return props.length > 0 ? `Slider<{ ${props.join('; ')} }>` : 'Slider';
  }
  if (type.widget === 'input' || props.length > 0) {
    // Constrained numbers without a widget normalize to the plain input widget —
    // bare `number` syntax cannot carry min/max/step/default.
    return props.length > 0 ? `NumberField<{ ${props.join('; ')} }>` : 'NumberField';
  }
  return 'number';
}

/** Single-quoted TS string literal. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
