const nucleation = await import('nucleation');
if (typeof (nucleation as any).default === 'function') { try { await (nucleation as any).default(); } catch {} }
const S = (nucleation as any).SchematicWrapper;

function buildGate(repeaterFacing: string) {
  const s = new S();
  const STONE = 'minecraft:gray_concrete';
  s.set_block(0, 1, 0, STONE);
  s.set_block(4, 1, 0, STONE);
  s.set_block(0, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]');
  s.set_block(4, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]');
  s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
  s.set_block(3, 1, 0, 'minecraft:redstone_wall_torch[facing=west,lit=true]');
  s.set_block(2, 0, 0, STONE);
  s.set_block(2, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
  s.set_block(2, 0, 1, STONE); // repeater support
  s.set_block(2, 1, 1, `minecraft:repeater[facing=${repeaterFacing},delay=1,powered=false]`);
  s.set_block(2, 1, 2, STONE); // block C
  s.set_block(2, 1, 3, 'minecraft:redstone_wall_torch[facing=south,lit=false]'); // output torch
  s.set_block(2, 1, 4, 'minecraft:redstone_lamp[lit=false]');
  return s;
}

for (const facing of ['north', 'south']) {
  const s = buildGate(facing);
  const world = s.create_simulation_world();
  const rows: string[] = [];
  for (const [a, b] of [[0,0],[0,1],[1,0],[1,1]]) {
    if (world.get_lever_power(0,2,0) !== !!a) world.on_use_block(0,2,0);
    if (world.get_lever_power(4,2,0) !== !!b) world.on_use_block(4,2,0);
    world.tick(20); world.flush();
    rows.push(`${a}${b}->${world.is_lit(2,1,3) ? 1 : 0}`);
  }
  console.log(`repeater facing=${facing}:`, rows.join(' '), '(want 00->0 01->0 10->0 11->1)');
}

// lamp visual state via synced schematic
const s = buildGate('north');
const world = s.create_simulation_world();
world.on_use_block(0,2,0); world.on_use_block(4,2,0);
world.tick(20); world.flush();
world.sync_to_schematic();
const synced = world.get_schematic();
console.log('lamp synced state:', synced.get_block_with_properties?.(2,1,4) ? JSON.stringify(synced.get_block_with_properties(2,1,4)).slice(0,120) : synced.get_block(2,1,4));
try { console.log('truth_table:', JSON.stringify(world.get_truth_table()).slice(0, 300)); } catch (e) { console.log('tt err', (e as Error).message); }
