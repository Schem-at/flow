import { describe, it, expect } from 'vitest';
import type { FlowType } from '@flow/core';
import { parseBlockSource } from './parser';
import { describeFlowType, contractToIO } from './io-compat';
import { EXAMPLE_BLOCKS } from './examples';

// Bug #31: the CodePanel IO schema showed the legacy port kind (`schematic`,
// `object`, `array`) instead of the declared type: `Schematic` was lowercased,
// custom aliases showed as `object`, and `Schematic[][]` showed as `array`.

const SRC = `type Tile = { x: number; s: Schematic };
interface Settings { depth: number }
type Grid = Schematic[][];
type Size = Slider<{ min: 1; max: 8; default: 2 }>;
enum Mode { Fast = 'fast', Pretty = 'pretty' }
type Inputs = {
  size: Size;
  material: Block<{ default: 'minecraft:stone' }>;
  count: number;
  shape: 'cube' | 'sphere';
  settings: Settings;
  mode: Mode;
  heights: number[][];
  names: Array<string>;
};
type Outputs = {
  result: Schematic;
  tiles: Tile[];
  tile: Tile;
  grid: Grid;
  rows: Schematic[][];
  native: Nucleation.Schematic;
  inline: { a: number; b: Schematic };
};
function generate(inputs: Inputs): Outputs {
  return {} as Outputs;
}
`;

describe('declared type labels for the IO schema', () => {
  it('keeps the declared type name verbatim (no lowercasing)', async () => {
    const p = await parseBlockSource(SRC);
    expect(p.typeLabels.outputs.result).toBe('Schematic');
    expect(p.typeLabels.outputs.native).toBe('Nucleation.Schematic');
    expect(p.typeLabels.inputs.material).toBe('Block');
    expect(p.typeLabels.inputs.count).toBe('number');
    expect(p.typeLabels.inputs.shape).toBe("'cube' | 'sphere'");
  });

  it('shows array element types', async () => {
    const p = await parseBlockSource(SRC);
    expect(p.typeLabels.outputs.rows).toBe('Schematic[][]');
    expect(p.typeLabels.inputs.heights).toBe('number[][]');
    expect(p.typeLabels.inputs.names).toBe('string[]');
    expect(p.typeLabels.outputs.tiles).toBe('Tile[]');
  });

  it('shows object shapes by their name, and inline ones by shape', async () => {
    const p = await parseBlockSource(SRC);
    expect(p.typeLabels.outputs.tile).toBe('Tile');
    expect(p.typeLabels.inputs.settings).toBe('Settings');
    expect(p.typeLabels.outputs.inline).toBe('{ a: number; b: Schematic }');
  });

  it('resolves aliases to their target', async () => {
    const p = await parseBlockSource(SRC);
    expect(p.typeLabels.outputs.grid).toBe('Grid (Schematic[][])');
    expect(p.typeLabels.inputs.size).toBe('Size (Slider)');
    expect(p.contract.outputs.grid).toEqual({ kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } });
    expect(p.contract.inputs.size).toMatchObject({ kind: 'number', widget: 'slider', min: 1, max: 8, default: 2 });
  });

  it('accepts custom aliases, interfaces and enums without "unknown type" warnings', async () => {
    const p = await parseBlockSource(SRC);
    expect(p.warnings).toEqual([]);
    expect(p.typeLabels.inputs.mode).toBe('Mode');
    expect(p.contract.inputs.mode).toEqual({ kind: 'enum', options: ['fast', 'pretty'] });
    expect(p.contract.outputs.tile).toEqual({
      kind: 'object',
      fields: { x: { kind: 'number' }, s: { kind: 'schematic' } },
    });
  });

  it('labels positional generate parameters', async () => {
    const p = await parseBlockSource(
      `type Outputs = { r: Schematic };\nfunction generate(a: number[][], b: Schematic): Outputs { return { r: b }; }\n`
    );
    expect(p.typeLabels.inputs).toEqual({ a: 'number[][]', b: 'Schematic' });
  });

  it('julia-grid example: tiles shows as Schematic[][], not array', async () => {
    const p = await parseBlockSource(EXAMPLE_BLOCKS.find((b) => b.id === 'julia-grid')!.source);
    expect(p.typeLabels.outputs.tiles).toBe('Schematic[][]');
    // The legacy IO kind is still kept separately for port wiring.
    expect(contractToIO(p.contract).outputs.tiles.type).toBe('array');
  });
});

describe('describeFlowType (fallback when no source labels exist)', () => {
  const cases: Array<[FlowType, string]> = [
    [{ kind: 'schematic' }, 'Schematic'],
    [{ kind: 'list', of: { kind: 'list', of: { kind: 'schematic' } } }, 'Schematic[][]'],
    [{ kind: 'number', widget: 'slider', min: 1, max: 4 }, 'Slider'],
    [{ kind: 'number' }, 'number'],
    [{ kind: 'block' }, 'Block'],
    [{ kind: 'image' }, 'Image'],
    [{ kind: 'vec3' }, 'Vec3'],
    [{ kind: 'enum', options: ['a', 'b'] }, "'a' | 'b'"],
    [{ kind: 'object', fields: { x: { kind: 'number' }, s: { kind: 'schematic' } } }, '{ x: number; s: Schematic }'],
    [{ kind: 'native', className: 'BuildAnimation' }, 'Nucleation.BuildAnimation'],
    [{ kind: 'palette' }, 'BlockPalette'],
    [{ kind: 'unknown' }, 'unknown'],
  ];
  for (const [type, label] of cases) {
    it(`${JSON.stringify(type)} -> ${label}`, () => {
      expect(describeFlowType(type)).toBe(label);
    });
  }
});
