import { describe, it, expect } from 'vitest';
import { contractToTypeScript } from './codegen.js';

describe('contractToTypeScript — property name quoting', () => {
  it('quotes non-identifier input names (spaces) so the emitted TS is valid', () => {
    const ts = contractToTypeScript({
      inputs: {
        'world size': { kind: 'number' },
        seed: { kind: 'number' },
      },
      outputs: { result: { kind: 'number' } },
    });
    expect(ts).toContain('"world size": number;');
    // valid identifiers stay bare
    expect(ts).toContain('  seed: number;');
  });

  it('quotes non-identifier object field names', () => {
    const ts = contractToTypeScript({
      inputs: { cfg: { kind: 'object', fields: { 'has space': { kind: 'string' } } } },
      outputs: {},
    });
    expect(ts).toContain('"has space": string');
  });
});
