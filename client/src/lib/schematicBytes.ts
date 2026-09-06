/** Borrow complete ArrayBuffers. Only a subview needs copying because the renderer's
 * ArrayBuffer-only API cannot express its offset/length. Never transfer this buffer:
 * Flow retains it for downloads and other preview consumers. */
export function schematicArrayBuffer(value: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer && value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) return value.buffer;
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
  }
  throw new TypeError('Expected schematic bytes');
}
