/** Prototype the redstone AND-gate example against real nucleation. */
const nucleation = await import('nucleation');
// @ts-ignore - node entry inits on import or via default()
if (typeof (nucleation as any).default === 'function') {
  try { await (nucleation as any).default(); } catch { /* node entry may auto-init */ }
}

const S = (nucleation as any).SchematicWrapper;
const s = new S();

const STONE = 'minecraft:gray_concrete';
// Torch-logic AND gate:
//   levers on top of blocks A(0,1,0) and B(4,1,0) -> inverting wall torches
//   facing inward -> merge on wire (2,1,0) -> weak-powers block C (2,1,1)
//   -> output torch on C's far side -> lamp.
s.set_block(0, 1, 0, STONE);                                   // block A
s.set_block(4, 1, 0, STONE);                                   // block B
s.set_block(0, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]'); // lever A
s.set_block(4, 2, 0, 'minecraft:lever[face=floor,facing=north,powered=false]'); // lever B
s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');    // NOT A
s.set_block(3, 1, 0, 'minecraft:redstone_wall_torch[facing=west,lit=true]');    // NOT B
s.set_block(2, 0, 0, STONE);                                   // wire support
s.set_block(2, 1, 0, 'minecraft:redstone_wire[east=side,west=side,south=side]'); // merge wire
s.set_block(2, 1, 1, STONE);                                   // block C
s.set_block(2, 1, 2, 'minecraft:redstone_torch[lit=false]');   // hmm needs wall torch on C south face
s.set_block(2, 1, 3, 'minecraft:redstone_lamp[lit=false]');    // lamp

// replace output torch with wall torch attached to C
s.set_block(2, 1, 2, 'minecraft:redstone_wall_torch[facing=south,lit=false]');

const world = s.create_simulation_world();

function setLever(x: number, y: number, z: number, on: boolean) {
  // get_lever_power tells current state; toggle if needed
  const current = world.get_lever_power(x, y, z);
  if (current !== on) world.on_use_block(x, y, z);
}

const rows: any[] = [];
for (const [a, b] of [[false, false], [false, true], [true, false], [true, true]]) {
  setLever(0, 2, 0, a);
  setLever(4, 2, 0, b);
  world.tick(20);
  world.flush();
  rows.push({ a, b, out: world.is_lit(2, 1, 3) });
}
console.log('truth table (expect AND):', JSON.stringify(rows));

try {
  const tt = world.get_truth_table();
  console.log('get_truth_table():', JSON.stringify(tt)?.slice(0, 400));
} catch (e) {
  console.log('get_truth_table failed:', (e as Error).message);
}
