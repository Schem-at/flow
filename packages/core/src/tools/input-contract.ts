import { expandFormNodes } from '../compile/form.js';
import { defaultValueForType, type FlowType } from '../types/flow-type.js';
import { inputFieldType, toolFieldPresentation, type ToolFieldPresentation } from './fields.js';

export const TOOL_INPUT_TYPES = new Set(['input', 'static_input', 'file_input', 'number_input', 'text_input', 'boolean_input', 'select_input']);
export interface ToolInputNode { id: string; type?: string; data?: Record<string, any> }
export const inputName = (node: ToolInputNode): string => node.data?.inputName || node.data?.label || node.id;
export const inputDefault = (node: ToolInputNode): unknown => (node.type === 'file_input' ? node.data?.fileData ?? node.data?.value : node.data?.value) ?? node.data?.config?.default ?? defaultValueForType(inputFieldType(node));
export interface ToolInputField {
  name: string;
  node: ToolInputNode & { data: Record<string, any> };
  type: FlowType;
  default: unknown;
  presentation: ToolFieldPresentation;
}
export type InputJsonSchema = Record<string, any>;

/** This projection is the input API, regardless of whether a form or HTTP calls it. */
export function getToolInputContract(graph: { nodes: ToolInputNode[]; edges?: any[] }) {
  const expanded = expandFormNodes({ nodes: graph.nodes.map(n => ({ ...n, type: n.type ?? 'unknown', data: n.data ?? {} })), edges: graph.edges ?? [] });
  const used = new Set<string>();
  const fields: ToolInputField[] = [];
  for (const source of expanded.nodes) {
    if (!TOOL_INPUT_TYPES.has(source.type) || source.data.isConstant) continue;
    const base = inputName(source);
    let name = base, suffix = 2;
    if (source.data.inputName && used.has(name)) throw new Error(`Duplicate API input name: ${name}`);
    // Older graphs allowed repeated display labels. Preserve their compiled keys.
    while (used.has(name)) name = `${base}_${suffix++}`;
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error(`Reserved API input name: ${name}`);
    used.add(name);
    const node = { ...source, data: { ...source.data, inputName: name } };
    fields.push({ name, node, type: inputFieldType(node), default: inputDefault(node), presentation: toolFieldPresentation(node) });
  }
  const properties: InputJsonSchema = Object.create(null);
  const required: string[] = [];
  const allOf: InputJsonSchema[] = [];
  for (const field of fields) {
    const p = field.presentation;
    const annotations = { title: p.label || field.name, ...(p.help ? { description: p.help } : {}), ...(field.default != null ? { default: field.default } : {}), 'x-form': p };
    const valueSchema = flowTypeInputSchema(field.type);
    if ((p as any).kind === 'int') valueSchema.type = 'integer';
    // Optional empty fields are accepted by the runtime. Required fields cannot be blank.
    const constraints = p.required ? { allOf: [valueSchema, { not: { enum: [null, ''] } }] } : { anyOf: [valueSchema, { enum: [null, ''] }] };
    properties[field.name] = { ...annotations, ...(!p.when ? constraints : {}) };
    if (p.when && !used.has(p.when.field)) throw new Error(`Unknown condition input: ${p.when.field}`);
    if (!p.when) { if (p.required) required.push(field.name); }
    else {
      const when = p.when;
      const condition = { ...('not' in when ? { not: { const: when.not } } : {}), ...('is' in when || 'equals' in when ? { const: 'is' in when ? when.is : when.equals } : {}) };
      allOf.push({ if: { properties: { [when.field]: condition }, required: [when.field] }, then: { properties: { [field.name]: constraints }, ...(p.required ? { required: [field.name] } : {}) } });
    }
  }
  return {
    fields,
    nodes: fields.map(f => f.node),
    defaults: Object.fromEntries(fields.map(f => [f.name, f.default])),
    schema: { type: 'object', properties, required, additionalProperties: false, ...(allOf.length ? { allOf } : {}) } as InputJsonSchema,
  };
}

/** Native values remain identified explicitly; JSON transports can provide encoded assets. */
export function flowTypeInputSchema(type: FlowType): InputJsonSchema {
  switch (type.kind) {
    case 'number': return { type: 'number', ...(type.min != null ? { minimum: type.min } : {}), ...(type.max != null ? { maximum: type.max } : {}) };
    case 'boolean': return { type: 'boolean' };
    case 'string': return { type: 'string' };
    case 'username': return { type: 'string', pattern: '^[A-Za-z0-9_]{1,16}$' };
    case 'block': return { type: 'string', minLength: 1 };
    case 'enum': return { enum: type.options };
    case 'set': return { type: 'array', items: { type: 'string', enum: type.options } };
    case 'vec3': return { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
    case 'list': return { type: 'array', items: flowTypeInputSchema(type.of), ...(type.length != null ? { minItems: type.length, maxItems: type.length } : {}) };
    case 'object': return { type: 'object', properties: Object.fromEntries(Object.entries(type.fields).map(([key, value]) => [key, flowTypeInputSchema(value)])), required: Object.keys(type.fields) };
    case 'file': return { 'x-flow-type': 'file', 'x-accept': type.accept ?? [], ...(type.maxBytes ? { 'x-maxBytes': type.maxBytes } : {}) };
    case 'palette': return { type: 'object', 'x-flow-type': 'palette', properties: { preset: { type: 'string' }, include: { type: 'array', items: { type: 'string' } }, exclude: { type: 'array', items: { type: 'string' } }, replace: { type: 'object', additionalProperties: { type: 'string' } } } };
    case 'unknown': return {};
    default: return { 'x-flow-type': type.kind, ...(type.kind === 'native' ? { 'x-class': type.className } : {}) };
  }
}
