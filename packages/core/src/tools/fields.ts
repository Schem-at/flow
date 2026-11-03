import type { FlowType } from '../types/flow-type.js';

export interface PaletteChoice {
  preset: string;
  include: string[];
  exclude: string[];
  replace: Record<string, string>;
}
export const DEFAULT_PALETTE: PaletteChoice = { preset: 'solid', include: [], exclude: [], replace: {} };

/** One field contract for editor nodes, forms, authored tools and their player. */
export function inputFieldType(node: { type?: string; data?: Record<string, any> }): FlowType {
  const d = node.data ?? {}, f = d.toolField ?? {}, c = { ...d, ...d.config, ...f };
  if (d.fieldType) return d.fieldType;
  const value = d.value ?? c.default;
  const kind = f.kind ?? d.dataType ?? (node.type?.endsWith('_input') && node.type !== 'static_input' ? node.type.replace('_input', '') : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : value && typeof value === 'object' ? 'unknown' : 'string');
  const options = Array.isArray(c.options) ? c.options.map((o: any) => typeof o === 'object' ? o.value : o) : Object.keys(c.options ?? {});
  switch (kind) {
    case 'palette': return { kind: 'palette', default: value ?? DEFAULT_PALETTE };
    case 'username': return { kind: 'username', default: value ?? '' };
    case 'file': {
      const categories: Record<string, string[]> = { schematic: ['.litematic', '.schematic', '.schem', '.nbt'], image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'], data: ['.csv', '.json', '.xml', '.yaml', '.yml'], text: ['.txt', '.md'] };
      const legacyAccept = Array.isArray(d.acceptedTypes) && !d.acceptedTypes.includes('binary') ? d.acceptedTypes.flatMap((category: string) => categories[category] ?? []) : [];
      return { kind: 'file', accept: c.accept ?? legacyAccept, maxBytes: c.max_kb ? c.max_kb * 1024 : undefined };
    }
    case 'set': return { kind: 'set', options, labels: c.options, default: value ?? [] };
    case 'format': case 'enum': case 'select': return { kind: 'enum', options, labels: Array.isArray(c.options) ? undefined : c.options, default: value ?? options[0] };
    case 'number': case 'int': case 'float': return { kind: 'number', min: c.min, max: c.max, step: c.step ?? (kind === 'int' ? 1 : undefined), default: value, widget: d.widgetType === 'slider' ? 'slider' : 'input' };
    case 'bool': case 'boolean': return { kind: 'boolean', default: value ?? false };
    case 'object': case 'unknown': case 'array': return { kind: 'unknown' };
    case 'image': return { kind: 'image' };
    case 'schematic': return { kind: 'schematic' };
    default: return options.length ? { kind: 'enum', options, default: value ?? options[0] } : { kind: 'string', default: value ?? '', multiline: d.widgetType === 'textarea' };
  }
}

/** Presentation belongs to the graph, independently of a widget's value type. */
export interface ToolFieldPresentation {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  required?: boolean;
  width?: 'full' | 'half';
  when?: { field: string; is?: unknown; equals?: unknown; not?: unknown };
}

export function toolFieldPresentation(node: { data?: Record<string, any> }): ToolFieldPresentation {
  // `description` is the remote-catalogue name for the help text; `help` predates it.
  const field = node.data?.toolField ?? {};
  return { ...field, help: field.help ?? field.description ?? node.data?.description };
}

/** Shared by form rendering and validation. `equals` accepts older authored graphs. */
export function isToolFieldVisible(field: ToolFieldPresentation, values: Record<string, unknown>): boolean {
  const when = field.when;
  if (!when?.field) return true;
  if ('not' in when && values[when.field] === when.not) return false;
  if ('is' in when && values[when.field] !== when.is) return false;
  if (!('is' in when) && 'equals' in when && values[when.field] !== when.equals) return false;
  return true;
}
