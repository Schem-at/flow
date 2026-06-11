import { compileBlock } from '../packages/core/src/compile/index';
import { executeInCompartment } from '../packages/synthase/src/compartment-executor';
import { EXAMPLE_BLOCKS } from '../client/src/lib/block/examples';

const nucleation = await import('nucleation');
if (typeof (nucleation as any).default === 'function') { try { await (nucleation as any).default(); } catch {} }
const ctx = {
  Schematic: (nucleation as any).SchematicWrapper,
  Math: Object.assign(Object.create(Math), { TAU: Math.PI * 2 }),
  Logger: console,
  Progress: { report: () => {} },
};
const run = async (id: string, inputs: Record<string, unknown>) => {
  const src = EXAMPLE_BLOCKS.find((b) => b.id === id)!.source;
  const compiled = compileBlock(src, { contextKeys: Object.keys(ctx) });
  return executeInCompartment(compiled.functionCode, inputs, ctx, { timeout: 60000 }) as Promise<any>;
};

const stats = (f: number[][]) => {
  let lo = 1, hi = 0, sum = 0, n = 0;
  for (const col of f) for (const v of col) { lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; n++; }
  return `${f.length}x${f[0]?.length} lo=${lo.toFixed(2)} hi=${hi.toFixed(2)} mean=${(sum / n).toFixed(2)}`;
};

const elev = await run('noise-field', { size: 96, scale: 0.02, octaves: 4, seed: 11 });
console.log('elevation:', stats(elev.field), '| preview', elev.preview.width + 'x' + elev.preview.height);
const voro = await run('voronoi-field', { size: 96, cells: 7, seed: 11 });
console.log('voronoi:  ', stats(voro.field));
const comb = await run('combine-fields', { a: elev.field, b: voro.field, op: 'subtract', strength: 1 });
console.log('combined: ', stats(comb.field));
const shaped = await run('shape-field', { field: comb.field, exponent: 1.6, terraces: 0 });
console.log('shaped:   ', stats(shaped.field));
const moist = await run('noise-field', { size: 96, scale: 0.03, octaves: 3, seed: 777 });
const world = await run('field-to-terrain', {
  elevation: shaped.field, moisture: moist.field, amplitude: 30, waterLevel: 0.35, seed: 11,
});
const dims = world.terrain.get_dimensions();
console.log('world dims:', Array.from(dims).join('x'), '| biome map', world.biomes.width + 'x' + world.biomes.height);
// biome variety: count distinct colors in the biome map
const seen = new Set<string>();
const d = world.biomes.data;
for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
console.log('distinct biomes painted:', seen.size);
