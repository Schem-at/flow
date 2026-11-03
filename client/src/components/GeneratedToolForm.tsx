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
    const label = field.label || name;
    const helpId = `${id}-${node.id}-help`;
    return <fieldset key={node.id} className={`tool-field min-w-0 ${field.width === 'half' ? '' : 'col-span-full'}`} aria-describedby={field.help ? helpId : undefined}>
      <legend className="mb-2 text-sm font-medium text-neutral-200">{label}{field.required && <span className="ml-1 text-brand-400" aria-label="required">*</span>}</legend>
      <FieldWidget type={inputFieldType(node)} value={values[name]} ariaLabel={label} onChange={value => onChange(name, value)}/>
      {field.help && <p id={helpId} className="mt-2 text-xs leading-relaxed text-neutral-500">{field.help}</p>}
    </fieldset>;
  };
  return <fieldset disabled={disabled} className="generated-tool-form min-w-0 disabled:opacity-60">
    {!groups.size && <p className="p-5 text-sm text-neutral-500">This tool is ready to run. No inputs needed.</p>}
    {[...groups].map(([name, fields], index) => <section key={name} className="tool-form-section">
      <h3 className="mb-5 flex items-center gap-3 text-sm font-medium text-neutral-300"><span className="font-mono text-[10px] text-neutral-600">{String(index + 1).padStart(2, '0')}</span>{name}</h3>
      <div className="grid grid-cols-2 gap-5">{fields.regular.map(renderField)}</div>
      {fields.advanced.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-xs text-neutral-400">Advanced options · {fields.advanced.length}</summary><div className="mt-5 grid grid-cols-2 gap-5">{fields.advanced.map(renderField)}</div></details>}
    </section>)}
  </fieldset>;
}
