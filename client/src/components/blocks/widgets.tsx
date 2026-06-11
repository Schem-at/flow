/**
 * Input widgets — one per FlowType kind. Each receives { type, value, onChange }
 * and recurses through the registry for composite kinds (list/object), so
 * arbitrary nesting renders for free.
 */

import { useId, useRef, useState } from 'react';
import { Plus, X, Upload } from 'lucide-react';
import { defaultValueForType } from '@flow/core';
import { getTypeEntry, type WidgetProps } from './registry';

const inputBaseCls =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-600';
const inputCls = `w-full ${inputBaseCls}`;

/** Render any FlowType's widget by registry lookup. */
export function FieldWidget(props: WidgetProps) {
  const Widget = getTypeEntry(props.type.kind).inputWidget;
  return <Widget {...props} />;
}

export function NumberWidget({ type, value, onChange }: WidgetProps) {
  if (type.kind !== 'number') return null;
  const num = typeof value === 'number' ? value : (type.default ?? type.min ?? 0);

  if (type.widget === 'slider' && type.min !== undefined && type.max !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={type.min}
          max={type.max}
          step={type.step ?? 1}
          value={num}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-emerald-500"
        />
        <input
          type="number"
          min={type.min}
          max={type.max}
          step={type.step ?? 1}
          value={num}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${inputBaseCls} w-16 flex-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        />
      </div>
    );
  }

  return (
    <input
      type="number"
      min={type.min}
      max={type.max}
      step={type.step}
      value={num}
      onChange={(e) => onChange(Number(e.target.value))}
      className={inputCls}
    />
  );
}

export function StringWidget({ type, value, onChange }: WidgetProps) {
  if (type.kind !== 'string') return null;
  const text = typeof value === 'string' ? value : (type.default ?? '');

  if (type.multiline) {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={4}
        className={`${inputCls} resize-y font-mono`}
      />
    );
  }
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

export function BooleanWidget({ value, onChange }: WidgetProps) {
  const on = value === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-600' : 'bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function EnumWidget({ type, value, onChange }: WidgetProps) {
  if (type.kind !== 'enum') return null;
  const current = value ?? type.default ?? type.options[0];
  return (
    <select
      value={String(current)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = type.options.find((o) => String(o) === raw);
        onChange(match ?? raw);
      }}
      className={inputCls}
    >
      {type.options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  );
}

const COMMON_BLOCKS = [
  'minecraft:stone',
  'minecraft:dirt',
  'minecraft:grass_block',
  'minecraft:oak_planks',
  'minecraft:bricks',
  'minecraft:glass',
  'minecraft:white_concrete',
  'minecraft:gray_concrete',
  'minecraft:redstone_block',
  'minecraft:redstone_wire',
  'minecraft:air',
];

export function BlockWidget({ type, value, onChange }: WidgetProps) {
  const listId = useId();
  const text =
    typeof value === 'string'
      ? value
      : ((type.kind === 'block' && type.default) || 'minecraft:stone');
  return (
    <>
      <input
        type="text"
        value={text}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        placeholder="minecraft:stone"
        spellCheck={false}
        className={`${inputCls} font-mono`}
      />
      <datalist id={listId}>
        {COMMON_BLOCKS.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </>
  );
}

/** Schematic input: upload a .schem/.litematic file; the worker rehydrates it to a WASM object. */
export function SchematicWidget({ value, onChange }: WidgetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = (value as { metadata?: { name?: string }; data?: Uint8Array } | null) ?? null;

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".schem,.schematic,.litematic,.nbt"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const buffer = await file.arrayBuffer();
          const ext = file.name.split('.').pop()?.toLowerCase() ?? 'schem';
          const format = ext === 'litematic' ? 'litematic' : ext === 'nbt' ? 'nbt' : 'schem';
          onChange({
            format,
            data: new Uint8Array(buffer),
            metadata: { name: file.name },
          });
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
      >
        <Upload className="h-3 w-3" />
        {meta?.metadata?.name ?? 'Pick schematic…'}
      </button>
      {meta?.data && (
        <span className="text-[11px] text-neutral-500">
          {(meta.data.byteLength / 1024).toFixed(1)} KB
        </span>
      )}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-neutral-500 hover:text-neutral-300"
          title="Clear"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Image input: upload, decoded to { width, height, data } RGBA. */
export function ImageWidget({ value, onChange }: WidgetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const img = (value as { width?: number; height?: number } | null) ?? null;
  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          onChange({ width: data.width, height: data.height, data: data.data });
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
      >
        <Upload className="h-3 w-3" />
        {img?.width ? `${img.width}×${img.height}` : 'Pick image…'}
      </button>
    </div>
  );
}

export function Vec3Widget({ value, onChange }: WidgetProps) {
  const vec = Array.isArray(value) && value.length === 3 ? (value as number[]) : [0, 0, 0];
  const set = (index: number, v: number) => {
    const next = [...vec];
    next[index] = v;
    onChange(next);
  };
  return (
    <div className="flex gap-1.5">
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <label key={axis} className="flex flex-1 items-center gap-1">
          <span className="text-[11px] text-neutral-500">{axis}</span>
          <input
            type="number"
            value={vec[i]}
            onChange={(e) => set(i, Number(e.target.value))}
            className={inputCls}
          />
        </label>
      ))}
    </div>
  );
}

/** List input: repeatable rows of the element widget, add/remove. */
export function ListWidget({ type, value, onChange }: WidgetProps) {
  if (type.kind !== 'list') return null;
  const items = Array.isArray(value) ? value : [];

  const setItem = (index: number, v: unknown) => {
    const next = [...items];
    next[index] = v;
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-1.5 rounded-md border border-neutral-800/70 bg-neutral-900/40 p-1.5"
        >
          <span className="mt-1.5 w-5 flex-none text-right text-[11px] text-neutral-600">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <FieldWidget type={type.of} value={item} onChange={(v) => setItem(index, v)} />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-1.5 flex-none text-neutral-600 transition hover:text-red-400"
            title="Remove item"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, defaultValueForType(type.of)])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
      >
        <Plus className="h-3 w-3" /> Add item
      </button>
    </div>
  );
}

/** Object input: grouped sub-fields, recursing. */
export function ObjectWidget({ type, value, onChange }: WidgetProps) {
  if (type.kind !== 'object') return null;
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return (
    <div className="space-y-2 rounded-md border border-neutral-800/70 p-2">
      {Object.entries(type.fields).map(([name, fieldType]) => (
        <div key={name}>
          <label className="mb-1 block text-[11px] font-medium text-neutral-500">{name}</label>
          <FieldWidget
            type={fieldType}
            value={obj[name]}
            onChange={(v) => onChange({ ...obj, [name]: v })}
          />
        </div>
      ))}
    </div>
  );
}

/** Fallback: raw JSON editor. */
export function JsonWidget({ value, onChange }: WidgetProps) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        spellCheck={false}
        rows={4}
        className={`${inputCls} resize-y font-mono`}
      />
      {error && <p className="mt-0.5 text-[11px] text-amber-500">{error}</p>}
    </div>
  );
}
