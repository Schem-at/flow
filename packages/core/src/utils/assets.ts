/**
 * Flow assets — binary payloads (base schematics, heightmap images, …)
 * bundled INSIDE the flow itself via asset nodes. The data lives base64-
 * encoded in the node's data, so it persists with the flow JSON, travels
 * with exports, and gets baked into folded scripts.
 */

import { base64ToBytes } from './base64.js';

export interface AssetNodeData {
  assetKind: 'schematic' | 'image' | 'binary';
  /** schematic: schem/litematic/nbt · image: 'rgba' (decoded at upload) */
  format: string;
  base64: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
}

export function isAssetNodeData(data: unknown): data is AssetNodeData {
  return Boolean(
    data &&
      typeof data === 'object' &&
      typeof (data as AssetNodeData).base64 === 'string' &&
      typeof (data as AssetNodeData).assetKind === 'string'
  );
}

/** The runtime value an asset node emits on its output port. */
export function assetNodeValue(data: AssetNodeData): unknown {
  const bytes = base64ToBytes(data.base64);
  if (data.assetKind === 'image') {
    return {
      width: data.width,
      height: data.height,
      data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    };
  }
  // schematic / binary: SchematicData-shaped — the worker rehydrates
  // schematics to live WASM objects via processInputSchematics.
  return {
    format: data.format,
    data: bytes,
    metadata: { name: data.name },
  };
}
