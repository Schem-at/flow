/**
 * Client-side asset ingestion for asset nodes: turn an uploaded file into the
 * base64 payload stored IN the node data (and therefore bundled with the
 * flow). Images are decoded to raw RGBA at upload time so workers and folded
 * scripts never need an image decoder.
 */

import { bytesToBase64, type AssetNodeData } from '@flow/core';

const SCHEMATIC_EXTENSIONS = new Set(['schem', 'schematic', 'litematic', 'nbt']);

export async function fileToAsset(file: File): Promise<AssetNodeData> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (file.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      assetKind: 'image',
      format: 'rgba',
      base64: bytesToBase64(new Uint8Array(pixels.data.buffer)),
      name: file.name,
      size: pixels.data.length,
      width: bitmap.width,
      height: bitmap.height,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    assetKind: SCHEMATIC_EXTENSIONS.has(ext) ? 'schematic' : 'binary',
    format: ext === 'litematic' ? 'litematic' : ext === 'nbt' ? 'nbt' : ext || 'binary',
    base64: bytesToBase64(bytes),
    name: file.name,
    size: bytes.length,
  };
}
