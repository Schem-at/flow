import { describe, it, expect } from 'vitest';
import { previewValue, tappedValue } from './InspectNode';

describe('tappedValue — index producer output by source handle', () => {
  it('returns the specific handle value, not the wrapper object', () => {
    expect(tappedValue({ tiles: [[1]], other: 2 }, 'tiles')).toEqual([[1]]);
  });

  it('falls back to the whole output when the handle is absent', () => {
    const out = { output: 5 };
    expect(tappedValue(out, 'missing')).toBe(out);
  });

  it('passes arrays through unchanged', () => {
    expect(tappedValue([[1]], 'tiles')).toEqual([[1]]);
  });
});

describe('previewValue — describe schematics, do not dump bytes', () => {
  it('recognizes a SERIALIZED schematic ({format,data})', () => {
    expect(previewValue({ format: 'schem', data: { '0': 31, '1': 139 } }).kind).toBe('schematic');
  });

  it('recognizes a live schematic handle', () => {
    expect(previewValue({ _schematicHandle: 'h1' }).kind).toBe('schematic');
  });

  it('describes a tile grid as an array', () => {
    expect(previewValue([[{}], [{}]]).kind).toBe('array');
  });
});
