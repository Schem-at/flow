import { describe, it, expect } from 'vitest';
import { hashExecutionInputs } from './inputHash';

describe('hashExecutionInputs', () => {
  it('is stable for equal code + values', () => {
    expect(hashExecutionInputs('code', { a: 1, s: 'x' })).toBe(
      hashExecutionInputs('code', { a: 1, s: 'x' })
    );
  });

  it('changes when a value, the code, or a schematic handle changes', () => {
    const base = hashExecutionInputs('code', { a: 1, s: { _schematicHandle: 'h1' } });
    expect(hashExecutionInputs('code', { a: 2, s: { _schematicHandle: 'h1' } })).not.toBe(base);
    expect(hashExecutionInputs('code2', { a: 1, s: { _schematicHandle: 'h1' } })).not.toBe(base);
    expect(hashExecutionInputs('code', { a: 1, s: { _schematicHandle: 'h2' } })).not.toBe(base);
  });

  it('fingerprints typed arrays by content, not identity', () => {
    const a = hashExecutionInputs('c', { b: new Uint8Array([1, 2, 3]) });
    expect(hashExecutionInputs('c', { b: new Uint8Array([1, 2, 3]) })).toBe(a);
    expect(hashExecutionInputs('c', { b: new Uint8Array([1, 2, 4]) })).not.toBe(a);
    expect(hashExecutionInputs('c', { b: new Uint8Array([1, 2, 3, 4]) })).not.toBe(a);
  });
});
