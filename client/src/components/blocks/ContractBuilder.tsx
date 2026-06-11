/**
 * <ContractBuilder> — the primary, visual way to define a block's inputs and
 * outputs. Add a field → name it → pick a type → set constraints/defaults →
 * nest for list/object. The TS `type Inputs/Outputs` declarations are generated
 * from this; raw type code never appears here.
 */

import { Plus, X } from 'lucide-react';
import type { FlowType, FlowTypeKind, BlockContract } from '@flow/core';
import { listKinds } from './registry';

const inputCls =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-600';

function emptyTypeForKind(kind: FlowTypeKind): FlowType {
  switch (kind) {
    case 'number':
      return { kind, widget: 'slider', min: 0, max: 100, default: 0 };
    case 'enum':
      return { kind, options: ['option-a', 'option-b'] };
    case 'list':
      return { kind, of: { kind: 'number' } };
    case 'object':
      return { kind, fields: { value: { kind: 'number' } } };
    default:
      return { kind } as FlowType;
  }
}

function NumberConstraint({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[10px] text-neutral-500">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={`${inputCls} w-16`}
      />
    </label>
  );
}

/** Recursive editor for one FlowType (kind picker + per-kind constraints). */
export function TypeEditor({
  type,
  onChange,
  depth = 0,
}: {
  type: FlowType;
  onChange: (type: FlowType) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={type.kind}
          onChange={(e) => onChange(emptyTypeForKind(e.target.value as FlowTypeKind))}
          className={inputCls}
        >
          {listKinds().map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>

        {type.kind === 'number' && (
          <>
            <select
              value={type.widget ?? 'input'}
              onChange={(e) =>
                onChange({ ...type, widget: e.target.value as 'input' | 'slider' })
              }
              className={inputCls}
              title="Widget"
            >
              <option value="slider">slider</option>
              <option value="input">field</option>
            </select>
            <NumberConstraint label="min" value={type.min} onChange={(min) => onChange({ ...type, min })} />
            <NumberConstraint label="max" value={type.max} onChange={(max) => onChange({ ...type, max })} />
            <NumberConstraint label="step" value={type.step} onChange={(step) => onChange({ ...type, step })} />
            <NumberConstraint
              label="default"
              value={type.default}
              onChange={(d) => onChange({ ...type, default: d })}
            />
          </>
        )}

        {type.kind === 'string' && (
          <>
            <label className="flex items-center gap-1 text-[10px] text-neutral-500">
              <input
                type="checkbox"
                checked={type.multiline ?? false}
                onChange={(e) => onChange({ ...type, multiline: e.target.checked || undefined })}
                className="accent-emerald-500"
              />
              multiline
            </label>
            <input
              type="text"
              placeholder="default"
              value={type.default ?? ''}
              onChange={(e) => onChange({ ...type, default: e.target.value || undefined })}
              className={`${inputCls} w-32`}
            />
          </>
        )}

        {type.kind === 'boolean' && (
          <label className="flex items-center gap-1 text-[10px] text-neutral-500">
            <input
              type="checkbox"
              checked={type.default ?? false}
              onChange={(e) => onChange({ ...type, default: e.target.checked || undefined })}
              className="accent-emerald-500"
            />
            default on
          </label>
        )}

        {type.kind === 'block' && (
          <input
            type="text"
            placeholder="default block id"
            value={type.default ?? ''}
            onChange={(e) => onChange({ ...type, default: e.target.value || undefined })}
            className={`${inputCls} w-48 font-mono`}
          />
        )}
      </div>

      {type.kind === 'enum' && (
        <div className="flex items-start gap-1.5">
          <textarea
            value={type.options.join('\n')}
            onChange={(e) =>
              onChange({
                ...type,
                options: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            rows={Math.min(5, Math.max(2, type.options.length))}
            spellCheck={false}
            placeholder={'one option per line'}
            className={`${inputCls} flex-1 resize-y font-mono`}
          />
          <select
            value={String(type.default ?? type.options[0] ?? '')}
            onChange={(e) => onChange({ ...type, default: e.target.value || undefined })}
            className={inputCls}
            title="Default"
          >
            {type.options.map((o) => (
              <option key={String(o)} value={String(o)}>
                {String(o)}
              </option>
            ))}
          </select>
        </div>
      )}

      {type.kind === 'list' && (
        <div className="ml-3 border-l border-neutral-800 pl-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-600">each item</p>
          <TypeEditor type={type.of} onChange={(of) => onChange({ ...type, of })} depth={depth + 1} />
        </div>
      )}

      {type.kind === 'object' && (
        <div className="ml-3 border-l border-neutral-800 pl-3">
          <FieldList
            fields={type.fields}
            onChange={(fields) => onChange({ ...type, fields })}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

/** Editable named-field list (used for Inputs, Outputs, and nested objects). */
function FieldList({
  fields,
  onChange,
  depth = 0,
  newFieldPrefix = 'field',
}: {
  fields: Record<string, FlowType>;
  onChange: (fields: Record<string, FlowType>) => void;
  depth?: number;
  newFieldPrefix?: string;
}) {
  const entries = Object.entries(fields);

  const rename = (index: number, name: string) => {
    const next = entries.map(([n, t], i) => (i === index ? ([name, t] as const) : ([n, t] as const)));
    onChange(Object.fromEntries(next));
  };

  const setType = (index: number, type: FlowType) => {
    const next = entries.map(([n, t], i) => (i === index ? ([n, type] as const) : ([n, t] as const)));
    onChange(Object.fromEntries(next));
  };

  const addField = () => {
    let n = entries.length + 1;
    let name = `${newFieldPrefix}${n}`;
    while (name in fields) name = `${newFieldPrefix}${++n}`;
    onChange({ ...fields, [name]: { kind: 'number', widget: 'slider', min: 0, max: 100, default: 0 } });
  };

  return (
    <div className="space-y-2">
      {entries.map(([name, type], index) => (
        <div key={index} className="rounded-md border border-neutral-800/70 bg-neutral-900/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => rename(index, e.target.value)}
              spellCheck={false}
              className={`${inputCls} w-36 font-mono font-medium`}
            />
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
              className="text-neutral-600 transition hover:text-red-400"
              title="Remove field"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <TypeEditor type={type} onChange={(t) => setType(index, t)} depth={depth} />
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
      >
        <Plus className="h-3 w-3" /> Add field
      </button>
    </div>
  );
}

export interface ContractBuilderProps {
  contract: BlockContract;
  onChange: (contract: BlockContract) => void;
}

export default function ContractBuilder({ contract, onChange }: ContractBuilderProps) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Inputs
        </h3>
        <FieldList
          fields={contract.inputs}
          onChange={(inputs) => onChange({ ...contract, inputs })}
          newFieldPrefix="input"
        />
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Outputs
        </h3>
        <FieldList
          fields={contract.outputs}
          onChange={(outputs) => onChange({ ...contract, outputs })}
          newFieldPrefix="output"
        />
      </section>
    </div>
  );
}
