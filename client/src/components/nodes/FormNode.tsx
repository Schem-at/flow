import { memo, useState, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { Plus, X, Settings, ArrowUp, ArrowDown, Ungroup } from 'lucide-react';
import { getToolInputContract, inputDefault, inputFieldType, inputName, type FormField, type FormNodeData } from '@flow/core';
import { useFlowStore } from '../../store/flowStore';
import { FieldWidget } from '../blocks/widgets';
import { InputFieldEditor } from '../blocks/InputFieldEditor';

const FormNode = memo(({ id, data, selected }: NodeProps & { data: FormNodeData }) => {
  const update = useFlowStore(s => s.updateNodeData);
  const selectNode = useFlowStore(s => s.selectNode);
  const [editing, setEditing] = useState<string | null>(null);
  const internals = useUpdateNodeInternals();
  const fields = data.fields ?? [];
  const handles = fields.map(f => f.name).join('|');
  useEffect(() => { internals(id); }, [id, handles, editing, fields, data.bundle?.enabled, internals]);
  const patch = (index: number, change: Partial<FormField>) => update(id, { fields: fields.map((f, i) => i === index ? { ...f, ...change } : f) });
  const move = (index: number, delta: number) => {
    const next = [...fields]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update(id, { fields: next.map((f, order) => ({ ...f, toolField: { ...f.toolField, order } })) });
  };
  const add = () => {
    let names: string[] = [];
    try { names = getToolInputContract({ nodes: useFlowStore.getState().nodes }).fields.map(f => f.name); } catch { /* Existing errors stay visible in the preview. */ }
    let n = fields.length + 1;
    while (names.includes(`field${n}`) || fields.some(f => f.name === `field${n}`) || data.bundle?.name === `field${n}`) n++;
    const name = `field${n}`;
    update(id, { fields: [...fields, { name, inputName: name, fieldType: { kind: 'string' }, value: '', toolField: { label: `Field ${n}`, order: fields.length } }] });
    setEditing(name);
  };
  return <div onClick={() => selectNode(id)} className={`relative w-[380px] rounded-lg border bg-neutral-900 ${selected ? 'border-brand-400/60' : 'border-neutral-700'}`}>
    <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><div className="flex-1"><input aria-label="Form section title" className="nodrag w-full bg-transparent text-sm font-medium text-white outline-none" value={data.label ?? ''} placeholder="Form section" onChange={e => update(id, { label: e.target.value })}/><p className="mt-1 text-[10px] text-neutral-500">{fields.length} fields · Form & API</p></div><button className="nodrag p-1 text-neutral-400" aria-label="Add form field" onClick={add}><Plus size={16}/></button><button className="nodrag p-1 text-neutral-400" title="Ungroup inputs" onClick={() => useFlowStore.getState().ungroupNode(id)}><Ungroup size={16}/></button></header>
    {fields.map((field, index) => {
      const node = { id: `${id}__f_${field.name}`, type: 'input', data: { ...field, label: field.label || field.name } };
      const name = inputName(node), label = field.toolField?.label || name;
      return <div key={field.name} className="relative border-b border-white/5 p-4">
        <div className="mb-3 flex items-center gap-1 text-neutral-500"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-neutral-200">{label}</p><p className="mt-1 font-mono text-[10px]">{name}</p></div>
          <button className="nodrag p-1 disabled:opacity-25" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13}/></button>
          <button className="nodrag p-1 disabled:opacity-25" aria-label={`Move ${label} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13}/></button>
          <button className="nodrag p-1" aria-label={`Configure ${label}`} aria-expanded={editing === field.name} onClick={() => setEditing(editing === field.name ? null : field.name)}><Settings size={13}/></button>
          <button className="nodrag p-1" aria-label={`Remove ${label}`} onClick={() => { const store = useFlowStore.getState(); store.setEdges(store.edges.filter(e => !(e.source === id && e.sourceHandle === field.name))); update(id, { fields: fields.filter((_, i) => i !== index) }); }}><X size={13}/></button>
        </div>
        <div className="nodrag nopan"><FieldWidget type={inputFieldType(node)} value={inputDefault(node)} ariaLabel={label} onChange={value => patch(index, { value })}/>{editing === field.name && <div className="mt-4"><InputFieldEditor node={node} onChange={change => patch(index, change)}/></div>}</div>
        <Handle type="source" position={Position.Right} id={field.name} className="!bg-brand-400" title={`${name} output`}/>
      </div>;
    })}
    <footer className="relative p-3 text-xs text-neutral-500"><button className="nodrag mb-3 flex items-center gap-2 text-neutral-300" onClick={add}><Plus size={14}/>Add field</button><label className="nodrag flex items-center gap-2"><input type="checkbox" checked={data.bundle?.enabled ?? false} onChange={e => update(id, { bundle: { enabled: e.target.checked, name: data.bundle?.name || 'values' } })}/>Also output all fields as an object</label>{data.bundle?.enabled && <Handle type="source" position={Position.Right} id={data.bundle.name || 'values'} className="!bg-violet-400" title="All form values"/>}</footer>
  </div>;
});
FormNode.displayName = 'FormNode';
export default FormNode;
