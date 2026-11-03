import { getToolInputContract, inputName, type FlowLike } from '@flow/core';
import { GeneratedToolForm } from '../GeneratedToolForm';
import { X } from 'lucide-react';

interface Props {
  nodes: FlowLike['nodes'];
  updateNode: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}
export function ToolFormPreview({ nodes, updateNode, onClose }: Props) {
  let contract;
  try { contract = getToolInputContract({ nodes }); }
  catch (error) { return <aside className="absolute right-0 top-0 z-30 max-w-md bg-neutral-950 p-5 text-red-400"><p role="alert">{String(error)}</p><button onClick={onClose}>Close</button></aside>; }
  const fields = contract.nodes, values = contract.defaults;
  return <aside className="absolute bottom-0 right-0 top-0 z-30 w-full max-w-md overflow-y-auto border-l border-white/10 bg-neutral-950 shadow-2xl" aria-label="Tool form preview">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-neutral-950 p-5"><div><h2 className="text-sm font-medium text-white">Tool form</h2><p className="mt-1 text-xs text-neutral-500">Changes update the graph’s default inputs.</p></div><button aria-label="Close form preview" onClick={onClose} className="p-2 text-neutral-400"><X size={16}/></button></header>
    <GeneratedToolForm nodes={fields.map(n => ({ ...n, data: n.data ?? {} }))} values={values} onChange={(name, value) => {
      const field = fields.find(n => inputName(n) === name);
      if (!field) return;
      const source = nodes.find(n => n.id === field.id);
      if (source) { updateNode(source.id, { value }); return; }
      for (const node of nodes) {
        if (node.type !== 'form') continue;
        const formFields = (node.data?.fields ?? []) as Array<{name: string}>;
        if (formFields.some(f => `${node.id}__f_${f.name}` === field.id)) {
          updateNode(node.id, { fields: formFields.map(f => `${node.id}__f_${f.name}` === field.id ? { ...f, value } : f) });
          return;
        }
      }
    }}/>
  </aside>;
}
