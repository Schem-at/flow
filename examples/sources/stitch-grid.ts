// Arrange a 2D grid of schematics into one mosaic. Uses paste() — the
// centralized copy (a native WASM offset-paste will slot in transparently).
function generate(
  tiles: Schematic[][],
  spacing: Slider<{ min: 0; max: 8; default: 1 }>,
): {
  stitched: Schematic;
} {
  const rows = tiles;
  if (!rows || !rows.length) throw new Error('Stitch: no tiles');

  // tileGrid lays the rows into one mosaic on a uniform cell grid (sized to
  // the largest tile) with the requested spacing — the manual paste loop.
  const stitched = Schematic.tileGrid(rows, { spacing: spacing, mode: 'uniform' });
  return { stitched };
}
