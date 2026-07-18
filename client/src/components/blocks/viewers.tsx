/**
 * Output viewers — one per FlowType kind, recursing through the registry for
 * composite kinds. A list of flat objects renders as a table; a list of rich
 * values renders as a gallery of the element viewer.
 */

import { useEffect, useRef, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import type { FlowType } from '@flow/core';
import SchematicRenderer from '../others/SchematicRenderer';
import { getTypeEntry, type ViewerProps } from './registry';
import { downloadText, rowsToCsv, downloadBarChartPng } from '../../lib/downloadFile';

/** Render any FlowType's viewer by registry lookup. */
export function FieldViewer(props: ViewerProps) {
  const Viewer = getTypeEntry(props.type.kind).outputViewer;
  return <Viewer {...props} />;
}

export function PrimitiveViewer({ value }: ViewerProps) {
  if (typeof value === 'string' && (value.includes('\n') || value.length > 200)) {
    const lines = value.split('\n').length;
    return (
      <div>
        <pre className="max-h-56 overflow-auto rounded-md bg-neutral-900 p-2 font-mono text-[11px] leading-relaxed text-neutral-300">
          {value}
        </pre>
        <p className="mt-0.5 text-[10px] text-neutral-600">
          {lines.toLocaleString()} lines · {value.length.toLocaleString()} chars
        </p>
      </div>
    );
  }
  return (
    <span className="font-mono text-xs text-neutral-200">
      {value === null || value === undefined ? '—' : String(value)}
    </span>
  );
}

export function EnumViewer({ value }: ViewerProps) {
  return (
    <span className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
      {String(value ?? '—')}
    </span>
  );
}

export function Vec3Viewer({ value }: ViewerProps) {
  const vec = Array.isArray(value) ? value : [];
  return (
    <div className="flex gap-3">
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <div key={axis} className="flex items-baseline gap-1">
          <span className="text-[11px] text-neutral-500">{axis}</span>
          <span className="font-mono text-xs text-neutral-200">{String(vec[i] ?? '—')}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Coerce a (possibly worker-serialized) byte payload into a Uint8Array.
 * A schematic's bytes cross the worker / cache boundary in several shapes:
 *   - a real Uint8Array / ArrayBuffer (structured clone),
 *   - a plain number[] (Array.from somewhere),
 *   - a numeric-keyed object {0:31,1:139,…} (JSON-serialized typed array —
 *     this is what each tile in a Schematic[][] becomes),
 *   - a string (raw NBT text, matching SchematicPreview's encode path).
 * Returns null only when there are genuinely no bytes.
 */
function coerceBytes(d: unknown): Uint8Array | null {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array((d as ArrayBufferView).buffer);
  if (Array.isArray(d)) return Uint8Array.from(d as number[]);
  if (typeof d === 'string') return new TextEncoder().encode(d);
  // A LIVE wasm-bindgen Schematic object (e.g. each tile in a Schematic[][])
  // exposes no `data` field — serialize it via `to_schematic()` (same pattern as
  // the schemati provider: `source.to_schematic?.() ?? source.data`).
  if (d && typeof (d as { to_schematic?: unknown }).to_schematic === 'function') {
    try {
      const bytes = (d as { to_schematic: () => Uint8Array }).to_schematic();
      if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
    } catch {
      /* fall through to other shapes */
    }
  }
  if (d && typeof d === 'object') {
    const keys = Object.keys(d as Record<string, unknown>);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      let max = -1;
      for (const k of keys) { const n = Number(k); if (n > max) max = n; }
      const rec = d as Record<string, number>;
      const out = new Uint8Array(max + 1);
      for (const k of keys) out[Number(k)] = rec[k];
      return out;
    }
  }
  return null;
}

/** Coerce worker-returned schematic values into renderer bytes. */
export function toBytes(value: unknown): Uint8Array | null {
  const direct = coerceBytes(value);
  if (direct) return direct;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fromData = coerceBytes(obj.data);
    if (fromData) return fromData;
    if ('buffer' in obj) {
      try {
        return new Uint8Array((obj as { buffer: ArrayBufferLike }).buffer);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function SchematicViewer({ value, getData }: ViewerProps) {
  const [bytes, setBytes] = useState<Uint8Array | null>(() => toBytes(value));
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const direct = toBytes(value);
    if (direct) {
      setBytes(direct);
      return;
    }
    const handleId =
      value && typeof value === 'object'
        ? ((value as Record<string, unknown>)._schematicHandle as string | undefined)
        : undefined;
    if (handleId && getData) {
      setResolving(true);
      getData(handleId)
        .then((data) => setBytes(toBytes(data)))
        .finally(() => setResolving(false));
    } else {
      setBytes(null);
    }
  }, [value, getData]);

  if (resolving) {
    return <p className="text-xs text-neutral-500">Loading schematic…</p>;
  }
  if (!bytes) {
    // Diagnostic: surface the actual value shape so a "No schematic data" cell
    // tells us WHY coercion failed (handle vs data-type) without a console.
    const v = value as Record<string, unknown> | null;
    const hint =
      v && typeof v === 'object'
        ? v._schematicHandle
          ? 'handle'
          : `data:${Array.isArray(v.data) ? 'array' : typeof v.data} · {${Object.keys(v).slice(0, 4).join(',')}}`
        : String(typeof value);
    return (
      <p className="text-xs text-neutral-500">
        No schematic data <span className="text-neutral-700">({hint})</span>
      </p>
    );
  }
  return (
    <div className="h-64 overflow-hidden rounded-md border border-neutral-800">
      <SchematicRenderer schematic={bytes} />
    </div>
  );
}

export function ImageViewer({ value }: ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = value as { width?: number; height?: number; data?: ArrayLike<number> } | null;
    if (!canvas || !img?.width || !img?.height || !img.data) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Copy into a fresh ArrayBuffer-backed array — worker values may be
    // ArrayBufferLike-backed, which ImageData's typings reject.
    const data = new Uint8ClampedArray(img.width * img.height * 4);
    data.set(img.data);
    ctx.putImageData(new ImageData(data, img.width, img.height), 0, 0);
  }, [value]);

  const img = value as { width?: number; height?: number } | null;
  if (!img?.width) return <p className="text-xs text-neutral-500">No image data</p>;
  // Scale with the container (resized viewer nodes included), keep aspect.
  return (
    <canvas
      ref={canvasRef}
      className="h-full max-h-full w-full rounded-md border border-neutral-800 object-contain [image-rendering:pixelated]"
      style={{ minHeight: '8rem' }}
    />
  );
}

function isFlatObjectType(type: FlowType): type is Extract<FlowType, { kind: 'object' }> {
  return (
    type.kind === 'object' &&
    Object.values(type.fields).every((f) =>
      ['number', 'string', 'boolean', 'enum', 'block'].includes(f.kind)
    )
  );
}

/** Table for lists of flat objects — inline bars + CSV/PNG export. */
function TableViewer({ type, value }: ViewerProps) {
  if (type.kind !== 'list' || !isFlatObjectType(type.of) || !Array.isArray(value)) return null;
  const fields = type.of.fields;
  const columns = Object.keys(fields);
  const rows = value as Array<Record<string, unknown>>;

  // First numeric column drives the inline bars and the chart export.
  const numericCol = columns.find((c) => fields[c].kind === 'number');
  const labelCol = columns.find((c) => fields[c].kind !== 'number') ?? columns[0];
  const max = numericCol
    ? Math.max(1, ...rows.map((r) => Number(r[numericCol]) || 0))
    : 1;

  const exportCsv = () => downloadText('data.csv', rowsToCsv(columns, rows), 'text/csv');
  const exportPng = () => {
    if (!numericCol) return;
    void downloadBarChartPng({
      filename: 'chart.png',
      title: `${labelCol} by ${numericCol}`,
      rows: rows.slice(0, 40).map((r) => ({
        label: String(r[labelCol] ?? ''),
        value: Number(r[numericCol]) || 0,
      })),
    });
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-end gap-1.5">
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
          title="Download as CSV"
        >
          <Download className="h-2.5 w-2.5" /> CSV
        </button>
        {numericCol && (
          <button
            onClick={exportPng}
            className="inline-flex items-center gap-1 rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
            title="Download bar chart as PNG"
          >
            <BarChart3 className="h-2.5 w-2.5" /> PNG
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-auto rounded-md border border-neutral-800">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-900">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-2 py-1.5 font-medium text-neutral-400">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-neutral-800/60">
                {columns.map((col) => {
                  const isBarCell = col === numericCol;
                  const ratio = isBarCell ? (Number(row[col]) || 0) / max : 0;
                  return (
                    <td key={col} className="relative px-2 py-1 font-mono text-neutral-300">
                      {isBarCell && (
                        <div
                          className="absolute inset-y-0.5 left-0 rounded-sm bg-emerald-500/15"
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      )}
                      <span className="relative">{String(row?.[col] ?? '—')}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** List output: table for flat rows, gallery of element viewers otherwise. */
export function ListViewer(props: ViewerProps) {
  const { type, value, getData } = props;
  if (type.kind !== 'list') return null;
  if (!Array.isArray(value) || value.length === 0) {
    return <p className="text-xs text-neutral-500">Empty list</p>;
  }
  if (isFlatObjectType(type.of)) {
    return <TableViewer {...props} />;
  }
  // Lists of schematics render as a gallery grid — all cells share one WebGL
  // context (SchematicRendererContext), so many viewports stay cheap.
  // Cells are compact and override the viewer's default h-64.
  if (type.of.kind === 'schematic') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {value.map((item, i) => (
          <div
            key={i}
            className="h-36 overflow-hidden rounded-md border border-neutral-800/70 [&>div]:!h-full [&>div]:!rounded-none [&>div]:!border-0"
          >
            <FieldViewer type={type.of} value={item} getData={getData} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="rounded-md border border-neutral-800/70 p-2">
          <p className="mb-1 text-[11px] text-neutral-600">#{i + 1}</p>
          <FieldViewer type={type.of} value={item} getData={getData} />
        </div>
      ))}
    </div>
  );
}

export function ObjectViewer({ type, value, getData }: ViewerProps) {
  if (type.kind !== 'object') return null;
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return (
    <div className="space-y-2">
      {Object.entries(type.fields).map(([name, fieldType]) => (
        <div key={name} className="flex items-start gap-2">
          <span className="w-24 flex-none pt-0.5 text-[11px] text-neutral-500">{name}</span>
          <div className="min-w-0 flex-1">
            <FieldViewer type={fieldType} value={obj[name]} getData={getData} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function JsonViewer({ value }: ViewerProps) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? 'undefined';
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-neutral-900 p-2 text-xs text-neutral-300">
      {text}
    </pre>
  );
}
