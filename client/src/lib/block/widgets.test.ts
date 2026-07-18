import { describe, it, expect } from 'vitest';
import { parseInputWidgets, setWidgetDefault, findInputDeclarations } from './widgets';

describe('parseInputWidgets', () => {
  it('finds sliders with config + default range', () => {
    const src = `function generate(
  size: Slider<{ min: 32; max: 256; default: 96 }>,
  scale: Slider<{ min: 0.005; max: 0.1; step: 0.005; default: 0.02 }>,
  seed: number,
): { f: number } {}`;
    const widgets = parseInputWidgets(src);
    expect(widgets.map((w) => w.name)).toEqual(['size', 'scale']); // seed (bare number) has no widget
    const size = widgets[0];
    expect(size).toMatchObject({ kind: 'slider', min: 32, max: 256, default: 96 });
    expect(src.slice(size.defaultRange![0], size.defaultRange![1])).toBe('96');
    const scale = widgets[1];
    expect(scale).toMatchObject({ min: 0.005, max: 0.1, step: 0.005, default: 0.02 });
    expect(src.slice(scale.defaultRange![0], scale.defaultRange![1])).toBe('0.02');
  });

  it('handles Toggle and NumberField and negatives', () => {
    const src = `a: Toggle<{ default: true }>; b: NumberField<{ min: -5; max: 5; default: -2 }>`;
    const [a, b] = parseInputWidgets(src);
    expect(a).toMatchObject({ kind: 'toggle', default: true });
    expect(b).toMatchObject({ kind: 'number', min: -5, max: 5, default: -2 });
    expect(src.slice(b.defaultRange![0], b.defaultRange![1])).toBe('-2');
  });

  it('handles Block, TextField and string-union enums', () => {
    const src = `function generate(
  material: Block<{ default: 'minecraft:stone' }>,
  title: TextField<{ default: 'hello' }>,
  mode: 'fast' | 'slow' | 'auto',
): {} {}`;
    const byName = Object.fromEntries(parseInputWidgets(src).map((w) => [w.name, w]));
    expect(byName.material).toMatchObject({ kind: 'block', default: 'minecraft:stone' });
    expect(byName.title).toMatchObject({ kind: 'text', default: 'hello' });
    expect(byName.mode).toMatchObject({ kind: 'enum', options: ['fast', 'slow', 'auto'], default: 'fast' });
  });

  it('does not mistake a config string default for an enum', () => {
    const ws = parseInputWidgets(`material: Block<{ default: 'minecraft:gray_concrete' }>`);
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe('block');
  });

  it('works for the standalone type-Inputs form too', () => {
    const src = `type Inputs = {\n  octaves: Slider<{ min: 1; max: 6; default: 4 }>;\n};`;
    const [w] = parseInputWidgets(src);
    expect(w).toMatchObject({ name: 'octaves', min: 1, max: 6, default: 4 });
  });
});

describe('setWidgetDefault', () => {
  it('rewrites the default value in place', () => {
    const src = `size: Slider<{ min: 32; max: 256; default: 96 }>`;
    const [w] = parseInputWidgets(src);
    const next = setWidgetDefault(src, w.defaultRange!, 128);
    expect(next).toBe('size: Slider<{ min: 32; max: 256; default: 128 }>');
    // and the new source re-parses to the new default
    expect(parseInputWidgets(next)[0].default).toBe(128);
  });

  it('rewrites shorter/longer values and re-parse stays consistent', () => {
    const src = `n: Slider<{ min: 0; max: 1; step: 0.05; default: 0.35 }>`;
    const [w] = parseInputWidgets(src);
    const next = setWidgetDefault(src, w.defaultRange!, 1);
    expect(next).toContain('default: 1 }>');
    expect(parseInputWidgets(next)[0].default).toBe(1);
  });
});

describe('findInputDeclarations', () => {
  it('locates each positional input (incl. arrays and object-typed)', () => {
    const src = `function generate(
  size: Slider<{ min: 1; max: 10; default: 5 }>,
  field: number[][],
  cfg: { a: number; b: number },
): { out: number } {}`;
    const map = findInputDeclarations(src);
    expect([...map.keys()]).toEqual(['size', 'field', 'cfg']);
    expect(src.slice(map.get('field'))).toMatch(/^field:/);
    expect(src.slice(map.get('cfg'))).toMatch(/^cfg:/);
  });

  it('a single object-typed param is the inputs container, not an input', () => {
    expect(findInputDeclarations('function generate(inputs: { a: number; b: number }) {}').size).toBe(0);
  });
});
