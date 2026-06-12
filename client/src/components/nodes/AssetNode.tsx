/**
 * AssetNode — a binary payload bundled INSIDE the flow (base schematic,
 * heightmap image, …). The data lives base64-encoded in node data, so it
 * saves/exports with the flow JSON and bakes into folded scripts.
 */

import { memo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Archive, Upload, Box, Image as ImageIcon, FileQuestion } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import type { AssetNodeData } from '@flow/core';
import { fileToAsset } from '../../lib/assets';

const KIND_META = {
  schematic: { Icon: Box, color: 'text-pink-400', label: 'schematic' },
  image: { Icon: ImageIcon, color: 'text-purple-400', label: 'image' },
  binary: { Icon: FileQuestion, color: 'text-neutral-400', label: 'binary' },
} as const;

const AssetNode = memo(({ id, data, selected }: NodeProps & { data: Partial<AssetNodeData> & { label?: string } }) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const hasData = typeof data.base64 === 'string' && data.base64.length > 0;
  const kind = (data.assetKind ?? 'binary') as keyof typeof KIND_META;
  const { Icon, color, label } = KIND_META[kind] ?? KIND_META.binary;

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const asset = await fileToAsset(file);
      if (asset.size && asset.size > 8 * 1024 * 1024) {
        console.warn('[Asset] large asset (>8MB) — flow saves and folding will be heavy');
      }
      updateNodeData(id, { ...asset, label: data.label || asset.name });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`relative min-w-[190px] max-w-[240px] rounded-xl border bg-neutral-900 transition-colors ${
        selected ? 'border-amber-500/60 shadow-lg shadow-amber-500/10' : hasData ? 'border-amber-500/25' : 'border-neutral-800/60'
      }`}
    >
      <div className="rounded-t-xl border-b border-neutral-800/50 bg-gradient-to-r from-amber-900/25 to-neutral-900/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15">
            <Archive className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <span className="truncate text-xs font-medium text-white">{data.label || 'Asset'}</span>
          {hasData && (
            <span className={`ml-auto rounded bg-neutral-800/60 px-1.5 py-0.5 text-[9px] ${color}`}>
              {label}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        <input
          ref={fileRef}
          type="file"
          accept=".schem,.schematic,.litematic,.nbt,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
          }}
        />
        {hasData ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
              <Icon className={`h-3.5 w-3.5 ${color}`} />
              <span className="truncate font-mono">{data.name}</span>
            </div>
            <div className="text-[10px] text-neutral-600">
              {data.assetKind === 'image'
                ? `${data.width}×${data.height} rgba`
                : `${(((data.size ?? 0) / 1024) || 0).toFixed(1)} KB · ${data.format}`}
              {' · bundled with flow'}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-1 text-[10px] text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
            >
              replace…
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 px-2 py-3 text-xs text-neutral-400 transition hover:border-amber-600/60 hover:text-neutral-200 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {busy ? 'Reading…' : 'Pick schematic / image…'}
          </button>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-neutral-900 !bg-amber-500"
      />
    </div>
  );
});

AssetNode.displayName = 'AssetNode';

export default AssetNode;
