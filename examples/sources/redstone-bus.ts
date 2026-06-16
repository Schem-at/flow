function generate(
  length: Slider<{ min: 1; max: 128; default: 16 }>,
  material: Block<{ default: 'minecraft:gray_concrete' }>,
): {
  schematic: Schematic;
} {
  const schematic = new Schematic();
  for (let x = 0; x < length; x++) {
    schematic.set_block(x, 0, 0, material);
    if (x % 16 === 15) {
      schematic.set_block(x, 1, 0, 'minecraft:repeater[facing=west]');
    } else {
      schematic.set_block(x, 1, 0, 'minecraft:redstone_wire[east=side,west=side]');
    }
  }
  return { schematic };
}
