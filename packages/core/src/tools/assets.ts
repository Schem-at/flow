/** Binary inputs have the same shape in the editor, Tools page and HTTP worker. */
export function assetBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!value || typeof value !== 'object') throw new Error('Choose a file first.');
  const asset = value as { data?: unknown; base64?: string };
  if (asset.data) return assetBytes(asset.data);
  if (typeof asset.base64 === 'string') {
    const raw = atob(asset.base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  throw new Error('The file has no readable bytes.');
}

export interface PixelImage { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
export type ImageDecoder = (bytes: Uint8Array, width?: number) => Promise<PixelImage>;

export async function browserImage(bytes: Uint8Array, width?: number): Promise<PixelImage> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer]), {
    colorSpaceConversion: 'none', premultiplyAlpha: 'none',
  });
  try {
    const w = width ?? bitmap.width;
    const h = width ? Math.max(1, Math.round(w * bitmap.height / bitmap.width)) : bitmap.height;
    if (w * h > 262144) throw new Error('The image is too tall at this width. Reduce the width or crop it.');
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Image decoding is unavailable.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally { bitmap.close(); }
}
