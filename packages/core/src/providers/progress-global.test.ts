import { describe, it, expect } from 'vitest';
import { flowlibProvider } from './flowlib.js';
import { SynthaseService } from '../services/SynthaseService.js';
import { createDefaultRegistry } from './registry.js';

describe('progress(fraction, message) global', () => {
  it('reports a 0..1 fraction to the host progress sink as a percent', async () => {
    const events: Array<{ message: string; percent?: number }> = [];
    const context = await flowlibProvider.create({ kind: 'node', progressCallback: (message, percent) => events.push({ message, percent }) }, {});
    const service = new SynthaseService(context);
    const result = await service.executeScript(`function generate() {
      progress(0.25, 'Quarter');
      progress(2, 'Clamped');
      progress(0.5);
      return { ok: true };
    }`, {});
    expect(result.success).toBe(true);
    expect(events).toEqual([
      { message: 'Quarter', percent: 25 },
      { message: 'Clamped', percent: 100 },
      { message: 'Progress: 50%', percent: 50 },
    ]);
  });

  it('is declared for authors in flow-runtime.d.ts', () => {
    expect(createDefaultRegistry().runtimeDts()).toMatch(/declare const progress: \(fraction: number, message\?: string\) => void;/);
  });
});
