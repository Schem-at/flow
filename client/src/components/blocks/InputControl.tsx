/**
 * <InputControl> — a recursive editor for one input value, driven by its
 * FlowType. Scalars render a field; a list of lists of scalars (a matrix) gets a
 * rows×cols grid; other lists get a length control + recursive items; objects
 * render nested fields. Connection types (schematic/image) come from upstream.
 */

import type { FlowType } from '@flow/core';

const SCALAR_KINDS = ['number', 'string', 'boolean', 'enum', 'block'];
const isScalar = (t: FlowType) => SCALAR_KINDS.includes(t.kind);

export function defaultForType(type: FlowType): unknown {
  switch (type.kind) {
    case 'number': return type.default ?? type.min ?? 0;
    case 'string':
    case 'block': return type.default ?? '';
    case 'boolean': return type.default ?? false;
    case 'enum': return type.default ?? type.options[0];
    case 'vec3': return type.default ?? [0, 0, 0];
    case 'list':
      return type.default ?? (type.length != null
        ? Array.from({ length: type.length }, () => defaultForType(type.of))
        : []);
    case 'object':
      return Object.fromEntries(Object.entries(type.fields).map(([k, t]) => [k, defaultForType(t)]));
    default: return undefined;
  }
}

const field =
  'rounded border border-neutral-700 bg-neutral-900/70 px-2 py-1 text-xs text-neutral-200 focus:border-emerald-600 focus:outline-none';
const sizeInput = `${field} w-12 tabular-nums`;
const box = 'inline-block rounded-md border border-neutral-800 bg-neutral-900/40 p-2';
const dimLabel = 'flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500';

export default function InputControl({
  type,
  value,
  onChange,
}: {
  type: FlowType;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (type.kind) {
    case 'number': {
      const v = (value as number) ?? type.default ?? type.min ?? 0;
      if (type.min != null && type.max != null) {
        return (
          <div className="flex w-64 items-center gap-2">
            <input type="range" min={type.min} max={type.max} step={type.step ?? 1} value={v}
              onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 accent-emerald-500" />
            <span className="w-12 text-right text-xs tabular-nums text-neutral-400">{v}</span>
          </div>
        );
      }
      return <input type="number" className={`${field} w-28`} value={v} onChange={(e) => onChange(Number(e.target.value))} />;
    }

    case 'string':
    case 'block': {
      const v = (value as string) ?? type.default ?? '';
      if (type.kind === 'string' && type.multiline) {
        return <textarea rows={3} className={`${field} w-72`} value={v} onChange={(e) => onChange(e.target.value)} />;
      }
      return <input type="text" className={`${field} w-72`} value={v} onChange={(e) => onChange(e.target.value)}
        placeholder={type.kind === 'block' ? 'minecraft:stone' : ''} />;
    }

    case 'boolean':
      return <input type="checkbox" className="h-4 w-4 accent-emerald-500"
        checked={Boolean(value ?? type.default)} onChange={(e) => onChange(e.target.checked)} />;

    case 'enum':
      return (
        <select className={field} value={String(value ?? type.default ?? type.options[0])} onChange={(e) => onChange(e.target.value)}>
          {type.options.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
        </select>
      );

    case 'vec3': {
      const vec = (value as number[]) ?? type.default ?? [0, 0, 0];
      return (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <input key={i} type="number" className={`${field} w-16`} value={vec[i] ?? 0}
              onChange={(e) => { const n = [...vec]; n[i] = Number(e.target.value); onChange(n); }} />
          ))}
        </div>
      );
    }

    case 'list':
      // A list of lists of scalars is a matrix → rows×cols grid.
      if (type.of.kind === 'list' && isScalar(type.of.of)) {
        return <MatrixControl outer={type} value={value as unknown[][]} onChange={onChange} />;
      }
      return <ListControl type={type} value={value as unknown[]} onChange={onChange} />;

    case 'object': {
      const obj = (value as Record<string, unknown>) ?? {};
      return (
        <div className={`${box} space-y-1.5`}>
          {Object.entries(type.fields).map(([key, fieldType]) => (
            <label key={key} className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-neutral-500">{key}</span>
              <InputControl type={fieldType} value={obj[key]} onChange={(v) => onChange({ ...obj, [key]: v })} />
            </label>
          ))}
        </div>
      );
    }

    case 'schematic':
    case 'image':
      return <span className="text-[11px] italic text-neutral-600">connection input — provided upstream</span>;

    default:
      return (
        <textarea rows={2} className={`${field} w-72 font-mono`}
          value={value == null ? '' : JSON.stringify(value)}
          onChange={(e) => { try { onChange(JSON.parse(e.target.value)); } catch { /* keep typing */ } }} />
      );
  }
}

type ListType = Extract<FlowType, { kind: 'list' }>;

/** rows × cols grid of scalar cells (e.g. number[][]). A fixed `length` on the
 *  outer/inner list locks that dimension. */
function MatrixControl({ outer, value, onChange }: { outer: ListType; value: unknown[][]; onChange: (v: unknown) => void }) {
  const inner = outer.of as ListType;
  const cell = inner.of;
  const rowsFixed = outer.length;
  const colsFixed = inner.length;
  const m = value ?? [];
  const rows = rowsFixed ?? m.length;
  const cols = colsFixed ?? (m.length ? Math.max(...m.map((r) => r?.length ?? 0)) : 0);
  const resize = (r: number, c: number) =>
    onChange(Array.from({ length: r }, (_, ri) => Array.from({ length: c }, (_, ci) => m[ri]?.[ci] ?? defaultForType(cell))));

  return (
    <div className={`${box} space-y-1.5`}>
      <div className={dimLabel}>
        <input type="number" min={0} disabled={rowsFixed != null} className={`${sizeInput} ${rowsFixed != null ? 'opacity-50' : ''}`}
          value={rows} onChange={(e) => resize(Math.max(0, +e.target.value), cols || 1)} />
        rows ×
        <input type="number" min={0} disabled={colsFixed != null} className={`${sizeInput} ${colsFixed != null ? 'opacity-50' : ''}`}
          value={cols} onChange={(e) => resize(rows || 1, Math.max(0, +e.target.value))} />
        cols{(rowsFixed != null || colsFixed != null) && <span className="text-neutral-600"> · fixed</span>}
      </div>
      {rows > 0 && cols > 0 && (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 3.5rem))` }}>
          {Array.from({ length: rows }).flatMap((_, ri) =>
            Array.from({ length: cols }, (_, ci) => (
              <input key={`${ri}-${ci}`} type="number" className={`${field} w-full tabular-nums`} value={(m[ri]?.[ci] as number) ?? 0}
                onChange={(e) => { const n = m.map((r) => [...(r ?? [])]); (n[ri] ||= [])[ci] = Number(e.target.value); onChange(n); }} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** A 1-D list: length control + recursive item editors. A fixed `length` locks the count. */
function ListControl({ type, value, onChange }: { type: ListType; value: unknown[]; onChange: (v: unknown) => void }) {
  const of = type.of;
  const fixed = type.length != null;
  const raw = value ?? [];
  const items = fixed ? Array.from({ length: type.length! }, (_, i) => raw[i] ?? defaultForType(of)) : raw;
  return (
    <div className={`${box} min-w-[220px] space-y-1`}>
      <div className={dimLabel}>
        {fixed ? (
          <span>{type.length} items · fixed</span>
        ) : (
          <>
            <input type="number" min={0} className={sizeInput} value={items.length}
              onChange={(e) => {
                const n = Math.max(0, +e.target.value);
                onChange(Array.from({ length: n }, (_, i) => items[i] ?? defaultForType(of)));
              }} />
            items
          </>
        )}
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-1 w-5 shrink-0 text-[10px] text-neutral-600">{i}</span>
          <div className="flex-1">
            <InputControl type={of} value={item} onChange={(v) => { const n = [...items]; n[i] = v; onChange(n); }} />
          </div>
          {!fixed && (
            <button type="button" title="Remove" className="mt-0.5 text-neutral-600 hover:text-red-400"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
      ))}
      {!fixed && (
        <button type="button" className="text-[11px] text-emerald-500 hover:text-emerald-400"
          onClick={() => onChange([...items, defaultForType(of)])}>+ add</button>
      )}
    </div>
  );
}
