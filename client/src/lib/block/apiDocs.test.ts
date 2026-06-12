import { describe, it, expect } from 'vitest';
import { getApiDocs, searchApiDocs, parseAmbientDts } from './apiDocs';

describe('parseAmbientDts', () => {
  it('extracts members with JSDoc from class declarations', () => {
    const groups = parseAmbientDts(
      `/** A test class. */
declare class Foo {
  /** Adds things. */
  add(a: number, b: number): number;
  readonly size: number;
}
`,
      'runtime'
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Foo');
    expect(groups[0].doc).toBe('A test class.');
    const add = groups[0].members.find((m) => m.name === 'add')!;
    expect(add.doc).toBe('Adds things.');
    expect(add.kind).toBe('method');
    expect(groups[0].members.find((m) => m.name === 'size')!.kind).toBe('property');
  });
});

describe('getApiDocs (real ambient sources)', () => {
  const groups = getApiDocs();
  const byName = Object.fromEntries(groups.map((g) => [g.name, g]));

  it('Schematic leads and carries the real nucleation API', () => {
    expect(groups[0].name).toBe('Schematic');
    const names = groups[0].members.map((m) => m.name);
    for (const expected of ['set_block', 'get_block', 'blocks', 'from_data', 'to_schematic', 'create_simulation_world']) {
      expect(names).toContain(expected);
    }
    // JSDoc made it through
    const withDocs = groups[0].members.filter((m) => m.doc.length > 0);
    expect(withDocs.length).toBeGreaterThan(10);
  });

  it('standard providers and Schemati are documented', () => {
    for (const name of ['Noise', 'Vec3', 'Easing', 'Progress', 'Schemati', 'SchematicUtils', 'Calculator', 'Pathfinding']) {
      expect(byName[name], `missing group ${name}`).toBeTruthy();
      expect(byName[name].members.length).toBeGreaterThan(2);
    }
    expect(byName['Schemati'].members.map((m) => m.name)).toContain('uploadSchematic');
  });

  it('nucleation wrapper classes are browsable', () => {
    expect(byName['MchprsWorldWrapper']).toBeTruthy();
    expect(byName['MchprsWorldWrapper'].members.map((m) => m.name)).toContain('tick');
  });
});

describe('searchApiDocs', () => {
  it('filters members by name and doc text', () => {
    const hits = searchApiDocs('simulation world');
    const schematic = hits.find((g) => g.name === 'Schematic');
    expect(schematic).toBeTruthy();
    expect(schematic!.members.some((m) => m.name === 'create_simulation_world')).toBe(true);
  });

  it('keeps whole groups when the group name matches', () => {
    const hits = searchApiDocs('noise');
    const noise = hits.find((g) => g.name === 'Noise')!;
    expect(noise.members.length).toBeGreaterThan(5);
  });

  it('empty query returns everything', () => {
    expect(searchApiDocs('').length).toBe(getApiDocs().length);
  });
});
