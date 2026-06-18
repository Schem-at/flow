import { describe, it, expect } from 'vitest';
import {
  ambientGlobalHint,
  knownAmbientGlobals,
  shapeWorkerError,
  reconstructError,
} from './errorReporting.js';

describe('ambientGlobalHint', () => {
  it('flags a known ambient global referenced as "X is not defined"', () => {
    const hint = ambientGlobalHint('Asm is not defined');
    expect(hint).toMatch(/ambient global 'Asm' is undefined/);
    expect(hint).toMatch(/stale/);
  });

  it('flags the stale-worker TypeError (reading a method off an undefined global)', () => {
    const hint = ambientGlobalHint("Cannot read properties of undefined (reading 'define')");
    expect(hint).toMatch(/\.define/);
    expect(hint).toMatch(/stale/);
  });

  it('does NOT flag an unknown identifier that is not an ambient global', () => {
    expect(ambientGlobalHint('myLocalThing is not defined')).toBeNull();
  });

  it('does NOT flag an ordinary error', () => {
    expect(ambientGlobalHint('Division by zero')).toBeNull();
  });

  it('derives the global set from the provider manifest (incl. Asm/Rom/Schematic)', () => {
    const g = knownAmbientGlobals();
    expect(g.has('Asm')).toBe(true);
    expect(g.has('Rom')).toBe(true);
    expect(g.has('Schematic')).toBe(true);
  });
});

describe('shapeWorkerError', () => {
  it('serializes message + stack + name + nodeId and appends the hint', () => {
    const err = Object.assign(new TypeError("Cannot read properties of undefined (reading 'define')"), {
      nodeId: 'node-7',
    });
    const shaped = shapeWorkerError(err);
    expect(shaped.name).toBe('TypeError');
    expect(shaped.stack).toBe(err.stack);
    expect(shaped.nodeId).toBe('node-7');
    expect(shaped.message).toMatch(/reading 'define'/);
    expect(shaped.message).toMatch(/stale/); // hint appended
  });

  it('passes ordinary errors through unchanged (no hint)', () => {
    const shaped = shapeWorkerError(new Error('boom'));
    expect(shaped.message).toBe('boom');
  });

  it('accepts explicit nodeId/label overrides', () => {
    const shaped = shapeWorkerError(new Error('x'), { nodeId: 'n1', label: 'My Block' });
    expect(shaped.nodeId).toBe('n1');
    expect(shaped.label).toBe('My Block');
  });
});

describe('reconstructError', () => {
  it('rebuilds a rich Error preserving the in-sandbox stack and prefixing the label', () => {
    const payload = {
      message: 'kaboom',
      stack: 'Error: kaboom\n    at generate (block:3:9)',
      name: 'RangeError',
      nodeId: 'node-7',
      label: 'My Block',
    };
    const err = reconstructError(payload) as Error & { nodeId?: string; label?: string };
    expect(err.message).toBe('My Block: kaboom');
    expect(err.stack).toBe(payload.stack); // real frames, not onmessage
    expect(err.name).toBe('RangeError');
    expect(err.nodeId).toBe('node-7');
    expect(err.label).toBe('My Block');
  });

  it('falls back to a plain Error for legacy string payloads', () => {
    const err = reconstructError('just a string');
    expect(err.message).toBe('just a string');
  });
});
