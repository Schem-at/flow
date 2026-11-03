import { useId } from 'react';
import { inputName, inputFieldType, isToolFieldVisible, toolFieldPresentation } from '@flow/core';
import { FieldWidget } from './blocks/widgets';

interface InputNode { id: string; type?: string; data: Record<string, any> }
interface Props {
  nodes: InputNode[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
}

/** Scalar kinds sit on one row (label | control); everything else stacks under its label. */
const INLINE_KINDS = new Set(['number', 'boolean', 'enum', 'block', 'username', 'vec3']);

/** `staggerIntersectionMode` / `solid_block_on_0` → "Stagger intersection mode" / "Solid block on 0". */
export function humanizeInputName(name: string): string {
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
}

function isInline(type: { kind: string; multiline?: boolean }): boolean {
  return INLINE_KINDS.has(type.kind) || (type.kind === 'string' && !type.multiline);
}

/** The player and editor preview render the same expanded graph inputs. */
export function GeneratedToolForm({ nodes, values, onChange, disabled }: Props) {
  const id = useId();
  const groups = new Map<string, { regular: InputNode[]; advanced: InputNode[] }>();
  for (const node of [...nodes].sort((a, b) => (toolFieldPresentation(a).order ?? 0) - (toolFieldPresentation(b).order ?? 0))) {
    const field = toolFieldPresentation(node);
    if (!isToolFieldVisible(field, values)) continue;
    const name = field.group || 'Settings';
    if (!groups.has(name)) groups.set(name, { regular: [], advanced: [] });
    groups.get(name)![field.advanced ? 'advanced' : 'regular'].push(node);
  }
  const renderField = (node: InputNode) => {
    const field = toolFieldPresentation(node);
    const name = inputName(node);
    const label = field.label || humanizeInputName(name);
    const type = inputFieldType(node);
    const inline = isInline(type);
    const helpId = `${id}-${node.id}-help`;
    const span = field.width === 'half' ? '' : 'col-span-full';
    const required = field.required && <span className="ml-0.5 text-brand-400" aria-label="required">*</span>;
    const help = field.help && <p id={helpId} className="tool-field-help col-span-full text-[11px] leading-snug text-neutral-500">{field.help}</p>;
    if (inline) {
      return <fieldset key={node.id} data-layout="inline" className={`tool-field tool-field--inline min-w-0 ${span}`} aria-describedby={field.help ? helpId : undefined}>
        <legend className="sr-only">{label}</legend>
        <span aria-hidden className="truncate text-xs text-neutral-300" title={label}>{label}{required}</span>
        <div className={`min-w-0 ${type.kind === 'boolean' ? 'justify-self-end' : ''}`}>
          <FieldWidget type={type} value={values[name]} ariaLabel={label} onChange={value => onChange(name, value)}/>
        </div>
        {help}
      </fieldset>;
    }
    return <fieldset key={node.id} data-layout="stacked" className={`tool-field min-w-0 ${span}`} aria-describedby={field.help ? helpId : undefined}>
      <legend className="mb-1.5 text-xs text-neutral-300">{label}{required}</legend>
      <FieldWidget type={type} value={values[name]} ariaLabel={label} onChange={value => onChange(name, value)}/>
      {help && <div className="mt-1">{help}</div>}
    </fieldset>;
  };
  return <fieldset disabled={disabled} className="generated-tool-form min-w-0 disabled:opacity-60">
    {!groups.size && <p className="px-4 py-3 text-sm text-neutral-500">This tool is ready to run. No inputs needed.</p>}
    {[...groups].map(([name, fields], index) => <section key={name} className="tool-form-section">
      {(groups.size > 1 || name !== 'Settings') && <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400"><span className="font-mono text-[10px] text-neutral-600">{String(index + 1).padStart(2, '0')}</span>{name}</h3>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{fields.regular.map(renderField)}</div>
      {fields.advanced.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-neutral-400">Advanced options · {fields.advanced.length}</summary><div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">{fields.advanced.map(renderField)}</div></details>}
    </section>)}
  </fieldset>;
}
