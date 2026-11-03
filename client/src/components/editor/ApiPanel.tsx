import { useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { getToolInputContract } from '@flow/core';
import { useFlowStore } from '../../store/flowStore';

/** This contract is also consumed by the player, compiler and backend validator. */
export function ApiPanel({ flowId, flowName }: { flowId: string; flowName: string }) {
  const nodes = useFlowStore(s => s.nodes);
  const [tab, setTab] = useState<'schema' | 'example'>('schema');
  const [copied, setCopied] = useState(false);
  let contract;
  try { contract = getToolInputContract({ nodes }); }
  catch (error) { return <p role="alert" className="p-5 text-red-400">{String(error)}</p>; }
  const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: `${flowName} inputs`, ...contract.schema };
  const text = JSON.stringify(tab === 'schema' ? schema : contract.defaults, null, 2);
  return <div className="h-full overflow-auto bg-neutral-950 p-5 text-neutral-300">
    <p className="mb-4 text-sm text-neutral-300">{flowName} · {contract.fields.length} parameters</p>
    <p className="mb-5 text-sm leading-relaxed text-neutral-400">Generated from this graph’s input fields. Types, defaults, required fields and conditions are shared with the tool form and execution validator.</p>
    <div className="mb-5 divide-y divide-white/10 border-y border-white/10">{contract.fields.map(field => <div key={field.name} className="flex items-start justify-between gap-4 py-3 text-xs"><div><code className="text-neutral-100">{field.name}</code><p className="mt-1 text-neutral-500">{field.presentation.help || field.presentation.label}</p></div><span className="shrink-0 text-neutral-500">{field.type.kind}{field.presentation.required ? field.presentation.when ? ' · conditionally required' : ' · required' : ' · optional'}</span></div>)}</div>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs"><button className={tab === 'schema' ? 'text-white' : 'text-neutral-500'} onClick={() => setTab('schema')}>JSON Schema</button><button className={tab === 'example' ? 'text-white' : 'text-neutral-500'} onClick={() => setTab('example')}>Default inputs</button><button className="ml-auto flex items-center gap-1" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13}/> : <Copy size={13}/>}Copy</button><button className="flex items-center gap-1" onClick={() => { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${flowId || 'tool'}-${tab}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={13}/>Download</button></div>
    <pre className="max-h-[55vh] overflow-auto rounded border border-white/10 bg-white/[.02] p-4 text-[11px] leading-relaxed">{text}</pre>
    <p className="mt-4 text-xs leading-relaxed text-neutral-500">Defaults are applied before validation. File and native inputs use x-flow-type annotations for their runtime representation. Tools currently execute in the browser; this contract is ready for the backend runner too.</p>
  </div>;
}
