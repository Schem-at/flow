/**
 * Stable, cheap fingerprint of a node's execution inputs (code + resolved
 * values) for live-mode "did anything actually change?" checks. Typed arrays
 * are sampled (length + head/tail bytes) instead of fully serialized, and
 * schematic handles ({_schematicHandle}) hash by id — a fresh upstream run
 * produces a new handle, which correctly busts the cache.
 */

function sampleBytes(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let head = 0;
  let tail = 0;
  const n = Math.min(64, bytes.length);
  for (let i = 0; i < n; i++) {
    head = (head * 31 + bytes[i]) >>> 0;
    tail = (tail * 31 + bytes[bytes.length - 1 - i]) >>> 0;
  }
  return `bytes[${bytes.length}:${head.toString(36)}:${tail.toString(36)}]`;
}

export function hashExecutionInputs(code: string, inputs: Record<string, unknown>): string {
  const body = JSON.stringify(inputs, (_key, value) => {
    if (ArrayBuffer.isView(value)) return sampleBytes(value as ArrayBufferView);
    if (value instanceof ArrayBuffer) return sampleBytes(new Uint8Array(value));
    if (typeof value === 'function') return '[fn]';
    return value;
  });
  // FNV-1a over code keeps the key short even for long sources.
  let codeHash = 2166136261;
  for (let i = 0; i < code.length; i++) {
    codeHash ^= code.charCodeAt(i);
    codeHash = Math.imul(codeHash, 16777619);
  }
  return `${(codeHash >>> 0).toString(36)}|${body}`;
}
