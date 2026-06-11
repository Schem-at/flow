/**
 * Output viewers — one per FlowType kind, recursing through the registry for
 * composite kinds. A list of flat objects renders as a table; a list of rich
 * values renders as a gallery of the element viewer.
 */

import { useEffect, useRef, useState } from 'react';
import type { FlowType } from '@flow/core';
import SchematicRenderer from '../others/SchematicRenderer';
import { getTypeEntry, type ViewerProps } from './registry';

/** Render any FlowType's viewer by registry lookup. */
export function FieldViewer(props: ViewerProps) {
  const Viewer = getTypeEntry(props.type.kind).outputViewer;
  return <Viewer {...props} />;
}

export function PrimitiveViewer({ value }: ViewerProps) {
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

/** Coerce worker-returned schematic values into renderer bytes. */
function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.data instanceof Uint8Array) return obj.data;
    if (obj.data instanceof ArrayBuffer) return new Uint8Array(obj.data);
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
    return <p className="text-xs text-neutral-500">No schematic data</p>;
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
  return (
    <canvas
      ref={canvasRef}
      className="max-h-64 w-auto rounded-md border border-neutral-800 [image-rendering:pixelated]"
      style={{ maxWidth: '100%' }}
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

/** Table for lists of flat objects. */
function TableViewer({ type, value }: ViewerProps) {
  if (type.kind !== 'list' || !isFlatObjectType(type.of) || !Array.isArray(value)) return null;
  const columns = Object.keys(type.of.fields);
  return (
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
          {value.map((row, i) => (
            <tr key={i} className="border-t border-neutral-800/60">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1 font-mono text-neutral-300">
                  {String((row as Record<string, unknown>)?.[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  if (type.of.kind === 'schematic') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {value.map((item, i) => (
          <div key={i} className="overflow-hidden rounded-md border border-neutral-800/70">
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
