import { expect, it } from 'vitest';
import { schematicArrayBuffer } from './schematicBytes';
it('borrows full buffers and full typed views', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  expect(schematicArrayBuffer(bytes)).toBe(bytes.buffer);
  expect(schematicArrayBuffer(bytes.buffer)).toBe(bytes.buffer);
});
it('copies only a subview, preserving its boundaries and source', () => {
  const bytes = new Uint8Array([9, 1, 2, 8]);
  const result = schematicArrayBuffer(bytes.subarray(1, 3));
  expect([...new Uint8Array(result)]).toEqual([1, 2]);
  new Uint8Array(result)[0] = 0;
  expect(bytes[1]).toBe(1);
});
