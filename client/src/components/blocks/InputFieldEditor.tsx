import { useState, useEffect } from 'react';
import { getToolInputContract, inputFieldType, inputName, defaultValueForType, type ToolInputNode } from '@flow/core';
import { useFlowStore } from '../../store/flowStore';
import { TypeEditor } from './ContractBuilder';
import { ToolFieldSettings } from './ToolFieldSettings';

/** Same authoring controls for a standalone input and a field inside a form. */
export function InputFieldEditor({ node, onChange }: { node: ToolInputNode; onChange: (patch: Record<string, any>) => void }) {
  const nodes = useFlowStore(s => s.nodes);
  let fields: ReturnType<typeof getToolInputContract>['fields'] = [];
  try { fields = getToolInputContract({ nodes }).fields; } catch { /* The preview reports invalid imported contracts. */ }
  const name = fields.find(f => f.node.id === node.id)?.name ?? inputName(node), type = inputFieldType(node);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(name); setError(''); }, [name]);
  return <div className="nodrag nopan space-y-4 border-t border-white/10 pt-4 text-xs text-neutral-400">
    <label className="block">API name<input aria-label="API name" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-2 font-mono text-neutral-200" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft) || ['__proto__','constructor','prototype'].includes(draft)) { setError('Use letters, numbers and underscores, starting with a letter.'); return; }
      if (fields.some(f => f.name === draft && f.node.id !== node.id)) { setError('Another field already uses this API name.'); return; }
      setError(''); onChange({ inputName: draft });
    }}/></label>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <p className="text-[11px] text-neutral-500">This key identifies the parameter. Display labels can change without changing the API.</p>
    <div><p className="mb-2">Value type and constraints</p><TypeEditor type={type} onChange={fieldType => {
      const defaultChanged = 'default' in fieldType && fieldType.default !== ('default' in type ? type.default : undefined);
      onChange({ inputName: name, fieldType, ...(fieldType.kind !== type.kind || defaultChanged ? { value: defaultValueForType(fieldType) } : {}) });
    }}/></div>
    <ToolFieldSettings value={node.data?.toolField} onChange={toolField => onChange({ inputName: name, toolField })}/>
  </div>;
}
