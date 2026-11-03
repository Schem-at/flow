import { useFlowStore } from '../../store/flowStore';
import { getToolInputContract, type ToolFieldPresentation } from '@flow/core';

interface Props { value?: ToolFieldPresentation; onChange: (value: ToolFieldPresentation) => void }
/** Author the generated form without adding player-specific code. */
export function ToolFieldSettings({ value = {}, onChange }: Props) {
  const nodes = useFlowStore(state => state.nodes);
  let names: string[] = [];
  try { names = getToolInputContract({ nodes }).fields.map(field => field.name); } catch { /* Invalid names are reported by the contract preview. */ }
  const condition = value.when;
  const conditionValue = condition && ('not' in condition ? condition.not : condition.is ?? condition.equals);
  const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { return text; } };
  const patch = (next: Partial<ToolFieldPresentation>) => onChange({ ...value, ...next });
  const input = 'mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200';
  return <details className="nodrag nopan mt-3 border-t border-white/10 pt-3 text-xs text-neutral-400">
    <summary className="cursor-pointer">Tool form appearance</summary>
    <div className="mt-3 space-y-3">
      <label className="block">Display label<input className={input} value={value.label ?? ''} onChange={e => patch({ label: e.target.value })}/></label>
      <label className="block">Help text<textarea className={input} value={value.help ?? ''} onChange={e => patch({ help: e.target.value })}/></label>
      <label className="block">Section<input className={input} placeholder="Settings" value={value.group ?? ''} onChange={e => patch({ group: e.target.value })}/></label>
      <label className="block">Order<input type="number" className={input} value={value.order ?? 0} onChange={e => patch({ order: Number(e.target.value) })}/></label>
      <label className="flex gap-2"><input type="checkbox" checked={value.required ?? false} onChange={e => patch({ required: e.target.checked })}/>Required</label>
      <label className="flex gap-2"><input type="checkbox" checked={value.advanced ?? false} onChange={e => patch({ advanced: e.target.checked })}/>Advanced option</label>
      <label className="block">Field width<select className={input} value={value.width ?? 'full'} onChange={e => patch({ width: e.target.value as 'full' | 'half' })}><option value="full">Full row</option><option value="half">Half row</option></select></label>
      <label className="block">Show when<select className={input} value={condition?.field ?? ''} onChange={e => patch({ when: e.target.value ? { field: e.target.value, is: '' } : undefined })}><option value="">Always visible</option>{names.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      {condition && <div className="flex gap-2"><select aria-label="Condition operator" className={input} value={'not' in condition ? 'not' : 'is'} onChange={e => patch({ when: { field: condition.field, [e.target.value]: conditionValue } })}><option value="is">equals</option><option value="not">does not equal</option></select><input aria-label="Condition value" placeholder="Text, number, true or false" className={input} value={typeof conditionValue === 'string' ? conditionValue : JSON.stringify(conditionValue) ?? ''} onChange={e => patch({ when: { field: condition.field, ['not' in condition ? 'not' : 'is']: parse(e.target.value) } })}/></div>}
      <p className="text-neutral-500">Input names and connections stay the same when you change a display label.</p>
    </div>
  </details>;
}
