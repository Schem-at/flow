const STONE = 'minecraft:gray_concrete';
const LEVER = 'minecraft:lever[face=floor,facing=north,powered=false]';

function buildNot(s) {
  s.set_block(0, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
  s.set_block(2, 1, 0, 'minecraft:redstone_lamp[lit=true]');
  return { levers: [[0, 2, 0]], probe: [1, 1, 0], probeIsTorch: true };
}

function buildOr(s) {
  s.set_block(0, 1, 0, STONE);
  s.set_block(4, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(4, 2, 0, LEVER);
  for (let x = 1; x <= 3; x++) {
    s.set_block(x, 0, 0, STONE);
    s.set_block(x, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
  }
  return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 0], probeIsTorch: false };
}

function buildAndNand(s, isNand) {
  // Torch logic: levers invert onto a merge wire; wire = NOT a OR NOT b (= NAND).
  // For AND, a repeater strong-powers a block whose torch re-inverts the wire.
  s.set_block(0, 1, 0, STONE);
  s.set_block(4, 1, 0, STONE);
  s.set_block(0, 2, 0, LEVER);
  s.set_block(4, 2, 0, LEVER);
  s.set_block(1, 1, 0, 'minecraft:redstone_wall_torch[facing=east,lit=true]');
  s.set_block(3, 1, 0, 'minecraft:redstone_wall_torch[facing=west,lit=true]');
  s.set_block(2, 0, 0, STONE);
  s.set_block(2, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
  if (isNand) {
    return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 0], probeIsTorch: false };
  }
  s.set_block(2, 0, 1, STONE);
  s.set_block(2, 1, 1, 'minecraft:repeater[facing=north,delay=1,powered=false]');
  s.set_block(2, 1, 2, STONE);
  s.set_block(2, 1, 3, 'minecraft:redstone_wall_torch[facing=south,lit=false]');
  s.set_block(2, 1, 4, 'minecraft:redstone_lamp[lit=false]');
  return { levers: [[0, 2, 0], [4, 2, 0]], probe: [2, 1, 3], probeIsTorch: true };
}

function generate(
  gate: 'and' | 'nand' | 'or' | 'not',
): {
  circuit: Schematic;
  truthTable: Array<{ a: boolean; b: boolean; out: boolean }>;
} {
  const s = new Schematic();
  let cfg;
  if (gate === 'not') cfg = buildNot(s);
  else if (gate === 'or') cfg = buildOr(s);
  else cfg = buildAndNand(s, gate === 'nand');

  // Real redstone simulation (MCHPRS inside nucleation): toggle the levers
  // through every combination and probe the output.
  const world = s.create_simulation_world();
  const readOut = () => {
    const p = cfg.probe;
    return cfg.probeIsTorch ? world.is_lit(p[0], p[1], p[2]) : world.get_redstone_power(p[0], p[1], p[2]) > 0;
  };

  const combos =
    cfg.levers.length === 1
      ? [[false], [true]]
      : [[false, false], [false, true], [true, false], [true, true]];

  const truthTable = [];
  for (const combo of combos) {
    for (let i = 0; i < cfg.levers.length; i++) {
      const lever = cfg.levers[i];
      if (world.get_lever_power(lever[0], lever[1], lever[2]) !== combo[i]) {
        world.on_use_block(lever[0], lever[1], lever[2]);
      }
    }
    world.tick(20);
    world.flush();
    truthTable.push({ a: combo[0], b: combo.length > 1 ? combo[1] : false, out: readOut() });
  }

  // Return the live circuit (torch/lamp states from the last combination).
  world.sync_to_schematic();
  return { circuit: world.get_schematic(), truthTable };
}
