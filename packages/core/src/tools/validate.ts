import { assetBytes } from './assets.js';
import { DEFAULT_PALETTE, inputFieldType, isToolFieldVisible } from './fields.js';
import { defaultValueForType, validateValue, type FlowType } from '../types/flow-type.js';
import { getToolInputContract, inputName } from './input-contract.js';

/** The editor, browser player and backend enforce the same field contract. */
export function validateToolInputs(graph: any, values: Record<string, unknown>): Record<string, unknown> {
  const contract = getToolInputContract(graph);
  graph = { nodes: contract.nodes };
  const result = { ...contract.defaults, ...values };
  for (const name of Object.keys(values)) if (!contract.fields.some(f => f.name === name)) throw new Error(`Unknown input: ${name}`);
  // Normalize dependencies before evaluating conditions, independent of node order.
  for (const { name, type } of contract.fields) {
    const v = result[name];
    if (type.kind === 'number' && typeof v === 'string' && v.trim()) result[name] = Number(v);
    if (type.kind === 'boolean' && [0,1,'0','1','true','false','on','off'].includes(v as any)) result[name] = [1,'1','true','on'].includes(v as any);
  }
  for (const node of graph.nodes ?? []) {
    const data = node.data ?? {}, field = data.toolField ?? {}, type = inputFieldType(node);
    const name = inputName(node), label = field.label ?? name;
    let value = result[name] ?? data.value ?? defaultValueForType(type);
    result[name] = value;
    if (!isToolFieldVisible(field, result)) continue;
    if (value == null || value === '') { if (field.required) throw new Error(`${label} is required.`); continue; }
    if (type.kind === 'number' && typeof value === 'string' && value.trim()) result[name] = value = Number(value);
    if (type.kind === 'boolean' && typeof value !== 'boolean') {
      if ([0,1,'0','1','true','false','on','off'].includes(value as any)) result[name] = value = [1,'1','true','on'].includes(value as any);
    }
    if (type.kind === 'number' && (!Number.isFinite(value) || (field.kind === 'int' && !Number.isInteger(value)))) throw new Error(`${label} is outside the allowed range.`);
    const invalid = validateValue(type, value);
    if (invalid) throw new Error(type.kind === 'number' ? `${label} is outside the allowed range.` : `${label}: ${invalid}.`);
    result[name] = validateFileValues(type, value, label);
    if (type.kind === 'palette') {
      const p = {...DEFAULT_PALETTE,...value as object}; result[name]=p;
      // PHP's associative JSON decoding represents an empty object as [].
      if (Array.isArray(p.replace) && p.replace.length === 0) p.replace = {};
      const ids = (v: unknown) => Array.isArray(v) && v.length <= 10000 && v.every(id=>typeof id==='string' && /^[\w:.[\]=,-]+$/.test(id));
      if (typeof p.preset !== 'string' || !ids(p.include ?? []) || !ids(p.exclude ?? []) || !p.replace || typeof p.replace !== 'object' || Array.isArray(p.replace) || !ids(Object.keys(p.replace)) || !ids(Object.values(p.replace))) throw new Error(`${label}: invalid palette selection.`);
    }
  }
  return result;
}

/** Decode JSON-safe uploads at any depth before handing values to graph code. */
function validateFileValues(type: FlowType, value: any, label: string): unknown {
  if (type.kind === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, type.fields[key] ? validateFileValues(type.fields[key], item, `${label}.${key}`) : item]));
  if (type.kind === 'list') return value.map((item: unknown, i: number) => validateFileValues(type.of, item, `${label}[${i}]`));
  if (type.kind === 'file') {
      const bytes = assetBytes(value);
      if (type.maxBytes && bytes.byteLength > type.maxBytes) throw new Error(`${label} is too large.`);
      const file = value as any, filename = file.metadata?.name ?? file.name ?? '', ext = (filename.split('.').pop() || file.format || '').toLowerCase();
      if (ext && type.accept?.length && !type.accept.some(a => !a.includes('/') ? a.replace(/^\./,'').toLowerCase() === ext : a.endsWith('/*') ? String(file.metadata?.mimeType ?? '').startsWith(a.slice(0,-1)) : file.metadata?.mimeType === a)) throw new Error(`${label}: unsupported file format.`);
      return value && typeof value === 'object' && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer) ? { ...value, data: bytes } : value;
    }
  return value;
}
