const nucleation = await import('nucleation');
if (typeof (nucleation as any).default === 'function') {
  try { await (nucleation as any).default(); } catch {}
}
const S = (nucleation as any).SchematicWrapper;
const s = new S();
const STONE = 'minecraft:gray_concrete';
s.set_block(0, 1, 0, STONE);
s.set_block(4, 1, 0, STONE);
s.set_block(0, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]');
s.set_block(4, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]');
s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
s.set_block(3, 1, 0, 'minecraft:redstone_wall_torch[facing=west,lit=true]');
s.set_block(2, 0, 0, STONE);
s.set_block(2, 1, 0, 'minecraft:redstone_wire[east=side,west=side,south=side,north=none,power=0]');
s.set_block(2, 1, 1, STONE);
s.set_block(2, 1, 2, 'minecraft:redstone_wall_torch[facing=south,lit=false]');
s.set_block(2, 1, 3, 'minecraft:redstone_lamp[lit=false]');

for (const [x,y,z] of [[0,2,0],[4,2,0],[1,1,0],[3,1,0],[2,1,0],[2,1,2],[2,1,3]]) {
  console.log(`(${x},${y},${z}):`, s.get_block(x,y,z));
}
const world = s.create_simulation_world();
world.tick(10); world.flush();
console.log('wire power (levers off):', world.get_redstone_power(2,1,0), 'lamp:', world.is_lit(2,1,3));
console.log('lever_power(0,2,0):', world.get_lever_power(0,2,0));
world.on_use_block(0,2,0);
world.tick(10); world.flush();
console.log('after lever A on: lever_power:', world.get_lever_power(0,2,0), 'wire:', world.get_redstone_power(2,1,0), 'lamp:', world.is_lit(2,1,3));
world.on_use_block(4,2,0);
world.tick(10); world.flush();
console.log('after both on: wire:', world.get_redstone_power(2,1,0), 'lamp:', world.is_lit(2,1,3));

console.log('--- component probe ---');
world.on_use_block(0,2,0); // A off again
world.tick(10); world.flush();
console.log('A off, B on: TA lit:', world.is_lit(1,1,0), 'TB lit:', world.is_lit(3,1,0),
  'wire:', world.get_redstone_power(2,1,0), 'TC lit:', world.is_lit(2,1,2),
  'lamp is_lit:', world.is_lit(2,1,3), 'lamp power:', world.get_redstone_power(2,1,3));
world.on_use_block(0,2,0); // A on
world.tick(10); world.flush();
console.log('both on: TC lit:', world.is_lit(2,1,2), 'lamp is_lit:', world.is_lit(2,1,3),
  'lamp power:', world.get_redstone_power(2,1,3));
world.sync_to_schematic();
const out = world.get_schematic();
console.log('lamp block after sync:', out.get_block_with_properties ? 'has props api' : out.get_block(2,1,3));
