/**
 * FormNode — a DENSE input form meta-node. Holds many fields in one node instead
 * of N separate input nodes. Each field exposes its own output handle (id =
 * field name); an optional bundled handle emits all fields as one object. At
 * compile time the form expands into synthetic input + bundle nodes (see
 * `expandFormNodes` in @flow/core), so it folds/runs exactly like hand-wired
 * input + bundle nodes.
 */

import { memo, useCallback, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { FormInput, Plus, X, Package, Ungroup } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import type { FormField, FormNodeData } from '@flow/core';

type FieldType = NonNullable<FormField['dataType']>;

const DEFAULT_WIDGET: Record<FieldType, FormField['widgetType']> = {
  number: 'number',
  string: 'text',
  boolean: 'toggle',
  enum: 'select',
};

const kindDot: Record<FieldType, string> = {
  number: '!bg-blue-500',
  string: '!bg-green-500',
  boolean: '!bg-amber-500',
  enum: '!bg-violet-500',
};

const FormNode = memo(({ id, data, selected }: NodeProps & { data: FormNodeData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const ungroupNode = useFlowStore((s) => s.ungroupNode);
  const updateNodeInternals = useUpdateNodeInternals();

  const fields: FormField[] = Array.isArray(data?.fields) ? data.fields : [];
  const bundleEnabled = !!data?.bundle?.enabled;
  const bundleName = data?.bundle?.name || 'values';

  // Per-field output handles are DYNAMIC — React Flow only tracks (and lets you
  // wire) handles it knows about, so re-measure whenever the handle set changes
  // (fields added/removed/renamed, bundle toggled). Without this the field dots
  // can't be connected.
  const handleSig = `${fields.map((f) => f.name).join(',')}|${bundleEnabled ? bundleName : ''}`;
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleSig, updateNodeInternals]);

  const setFields = useCallback(
    (next: FormField[]) => updateNodeData(id, { fields: next }),
    [id, updateNodeData]
  );

  const patchField = useCallback(
    (index: number, patch: Partial<FormField>) => {
      const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
      setFields(next);
    },
    [fields, setFields]
  );

  const addField = useCallback(() => {
    const used = new Set(fields.map((f) => f.name));
    let n = fields.length + 1;
    let name = `field${n}`;
    while (used.has(name)) name = `field${++n}`;
    setFields([...fields, { name, dataType: 'number', widgetType: 'number', value: 0 }]);
  }, [fields, setFields]);

  const removeField = useCallback(
    (index: number) => setFields(fields.filter((_, i) => i !== index)),
    [fields, setFields]
  );

  const toggleBundle = useCallback(
    () => updateNodeData(id, { bundle: { enabled: !bundleEnabled, name: bundleName } }),
    [id, bundleEnabled, bundleName, updateNodeData]
  );

  const renderWidget = (field: FormField, index: number) => {
    const dataType = field.dataType ?? 'string';
    const widget = field.widgetType ?? DEFAULT_WIDGET[dataType] ?? 'text';
    const onVal = (v: unknown) => patchField(index, { value: v });
    const cls = 'nodrag px-2 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-white text-[11px] focus:outline-none focus:border-indigo-500';
    switch (widget) {
      case 'slider': {
        const min = field.min ?? 0;
        const max = field.max ?? 100;
        return (
          <div className="flex items-center gap-1">
            <span className="text-[9px] tabular-nums text-neutral-600">{min}</span>
            <input type="range" className="nodrag w-20 h-1.5 accent-indigo-500"
              value={Number(field.value) || 0} min={min} max={max} step={field.step ?? 1}
              onChange={(e) => onVal(parseFloat(e.target.value))} />
            <span className="text-[9px] tabular-nums text-neutral-600">{max}</span>
            <span className="w-8 text-right font-mono text-[11px] tabular-nums text-indigo-300">
              {Number(field.value) || 0}
            </span>
          </div>
        );
      }
      case 'textarea':
        return (
          <textarea rows={3}
            className={`${cls} nowheel w-56 resize-y font-mono leading-snug`}
            value={String(field.value ?? '')}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => onVal(e.target.value)} />
        );
      case 'number':
        return (
          <input type="number" className={`${cls} w-20 font-mono`} value={(field.value as number) ?? ''}
            min={field.min} max={field.max} step={field.step}
            onChange={(e) => onVal(e.target.value === '' ? 0 : parseFloat(e.target.value))} />
        );
      case 'toggle':
        return (
          <button onClick={() => onVal(!field.value)}
            className={`nodrag px-2 py-0.5 rounded text-[11px] font-medium ${field.value ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400'}`}>
            {field.value ? 'true' : 'false'}
          </button>
        );
      case 'select':
        return (
          <select className={`${cls} w-24`} value={String(field.value ?? '')} onChange={(e) => onVal(e.target.value)}>
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      default:
        return (
          <input type="text" className={`${cls} w-28`} value={String(field.value ?? '')}
            onChange={(e) => onVal(e.target.value)} />
        );
    }
  };

  return (
    <div
      onClick={() => selectNode(id)}
      className={`relative rounded-xl border bg-neutral-900/95 backdrop-blur min-w-[240px] transition-colors ${
        selected ? 'border-indigo-500/70 ring-1 ring-indigo-500/40' : 'border-neutral-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
          <FormInput className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <input
            className="nodrag bg-transparent font-semibold text-sm text-white truncate w-full focus:outline-none"
            value={data?.label ?? ''} placeholder="Form"
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
          />
          <div className="text-[10px] text-neutral-500">{fields.length} field{fields.length === 1 ? '' : 's'}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); addField(); }}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-400" title="Add field">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); ungroupNode(id); }}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-400" title="Ungroup into individual input nodes">
          <Ungroup className="w-4 h-4" />
        </button>
      </div>

      {/* Field rows — each row OWNS its output handle (anchored to the row centre). */}
      <div className="py-1.5">
        {fields.map((field, index) => {
          const dataType = field.dataType ?? 'string';
          return (
            <div key={field.name} className="relative flex items-center gap-2 px-3 py-1 group">
              <button onClick={(e) => { e.stopPropagation(); removeField(index); }}
                className="nodrag opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400" title="Remove field">
                <X className="w-3 h-3" />
              </button>
              <input
                className="nodrag bg-transparent text-[11px] text-neutral-300 w-20 focus:outline-none focus:text-white"
                value={field.name}
                onChange={(e) => patchField(index, { name: e.target.value.replace(/\s+/g, '_') })}
                title="Field name (= output handle)"
              />
              <div className="ml-auto">{renderWidget(field, index)}</div>
              <Handle
                id={field.name}
                type="source"
                position={Position.Right}
                style={{ right: -11, top: '50%', transform: 'translateY(-50%)' }}
                className={`!w-2.5 !h-2.5 !border-2 !border-neutral-900 ${kindDot[dataType] ?? '!bg-neutral-400'}`}
                title={`${field.name} output`}
              />
            </div>
          );
        })}
        {fields.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-neutral-600">No fields — click + to add one.</div>
        )}
      </div>

      {/* Bundled object handle */}
      <div className="relative flex items-center gap-2 px-3 py-1.5 border-t border-neutral-800">
        <button onClick={(e) => { e.stopPropagation(); toggleBundle(); }}
          className={`nodrag flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
            bundleEnabled ? 'text-violet-300 bg-violet-500/15 border-violet-500/30' : 'text-neutral-500 border-neutral-700'
          }`}
          title="Expose all fields as one object output">
          <Package className="w-3 h-3" /> {bundleName}
        </button>
        {bundleEnabled && (
          <Handle
            id={bundleName}
            type="source"
            position={Position.Right}
            style={{ right: -11, top: '50%', transform: 'translateY(-50%)' }}
            className="!w-2.5 !h-2.5 !border-2 !border-neutral-900 !bg-violet-500"
            title={`${bundleName} (object) output`}
          />
        )}
      </div>
    </div>
  );
});

FormNode.displayName = 'FormNode';

export default FormNode;
