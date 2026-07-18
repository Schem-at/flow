type Inputs = {
  tiles: Schematic[][];
  spacing: Slider<{ min: 0; max: 8; default: 2 }>;
};

type Outputs = {
  stitched: Schematic;
};

function generate(inputs) {
  const tiles = inputs.tiles || [];
  const spacing = inputs.spacing ?? 2;

  // tileGrid (packed) lays rows out exactly like the old hand-rolled loop:
  // per-row offsetX += tileWidth + spacing, offsetZ += maxRowDepth + spacing,
  // skipping non-schematic cells and air blocks.
  const stitched = Schematic.tileGrid(tiles, { spacing: spacing, mode: 'packed' });

  return { stitched };
}
