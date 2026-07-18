import { describe, it, expect } from 'vitest';
import { toBytes } from './viewers';

describe('toBytes — schematic value coercion', () => {
  it('reconstructs a JSON-serialized Uint8Array (numeric-keyed data object)', () => {
    // A Schematic[][] tile crosses the worker boundary with data as {0:..,1:..}.
    const b = toBytes({ format: 'schem', data: { '0': 31, '1': 139, '2': 8, '3': 0 } });
    expect(b).toBeInstanceOf(Uint8Array);
    expect(Array.from(b!)).toEqual([31, 139, 8, 0]);
  });

  it('passes through a real Uint8Array data field', () => {
    const u = new Uint8Array([1, 2, 3]);
    expect(toBytes({ format: 'schem', data: u })).toBe(u);
  });

  it('coerces number[] data', () => {
    expect(Array.from(toBytes({ format: 'schem', data: [1, 2, 3] })!)).toEqual([1, 2, 3]);
  });

  it('coerces string data (raw NBT text → bytes)', () => {
    const b = toBytes({ format: 'schem', data: 'AB' });
    expect(Array.from(b!)).toEqual([65, 66]);
  });

  it('handles a bare numeric-keyed value (not wrapped in {data})', () => {
    expect(Array.from(toBytes({ '0': 7, '1': 8 })!)).toEqual([7, 8]);
  });

  it('serializes a LIVE wasm Schematic object via to_schematic()', () => {
    // Each tile in a Schematic[][] reaches the gallery as a live wasm object.
    const live = { __wbg_ptr: 123, to_schematic: () => new Uint8Array([5, 6, 7]) };
    expect(Array.from(toBytes(live)!)).toEqual([5, 6, 7]);
  });

  it('returns null for a non-schematic object', () => {
    expect(toBytes({ foo: 'bar' })).toBeNull();
  });
});
