import { compileBlock } from '../packages/core/src/compile/index';
import { executeInCompartment } from '../packages/synthase/src/compartment-executor';
import { EXAMPLE_BLOCKS } from '../client/src/lib/block/examples';

const nucleation = await import('nucleation');
if (typeof (nucleation as any).default === 'function') { try { await (nucleation as any).default(); } catch {} }
const Schematic = (nucleation as any).SchematicWrapper;

const ctx = { Schematic, Math: Object.assign(Object.create(Math), { TAU: Math.PI * 2 }), Logger: console, Progress: { report: () => {} } };
const run = async (id: string, inputs: Record<string, unknown>) => {
  const src = EXAMPLE_BLOCKS.find((b) => b.id === id)!.source;
  const compiled = compileBlock(src, { contextKeys: Object.keys(ctx) });
  return executeInCompartment(compiled.functionCode, inputs, ctx, { timeout: 30000 }) as Promise<any>;
};

// A small test schematic
const s = new Schematic();
for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
  s.set_block(x, 0, z, 'minecraft:stone');
  if ((x + z) % 2 === 0) s.set_block(x, 1, z, 'minecraft:oak_planks');
}

const census = await run('block-census', { schematic: s });
console.log('census rows:', JSON.stringify(census.rows));
console.log('census csv head:', JSON.stringify(census.csv.split('\n').slice(0, 3)));

const holo = await run('hologram-mcfunction', { schematic: s, scale: 0.125, tag: 'demo' });
console.log('hologram commands:', holo.commands, '| line sample:', holo.mcfunction.split('\n')[3]?.slice(0, 140));

for (const gate of ['and', 'nand', 'or', 'not']) {
  const lab = await run('logic-lab', { gate });
  const tt = lab.truthTable.map((r: any) => `${r.a ? 1 : 0}${r.b ? 1 : 0}->${r.out ? 1 : 0}`).join(' ');
  console.log(`gate ${gate}:`, tt, '| circuit blocks:', lab.circuit?.blocks ? 'wrapper ok' : 'MISSING');
}
