function generate(
  schematic: Schematic,
): {
  dimensions: Vec3;
  blockCounts: Array<{ block: Block; count: number }>;
  heatmap: Image;
} {
  if (!schematic || typeof schematic.blocks !== 'function') {
    return { dimensions: [0, 0, 0], blockCounts: [], heatmap: Image.blank() };
  }

  // bounds + blockCounts() are native queries on the schematic.
  const b = schematic.bounds;
  const dimensions = [b.width | 0, b.height | 0, b.depth | 0];

  const blockCounts = [...schematic.blockCounts().entries()]
    .map(([block, count]) => ({ block, count }))
    .sort((a, b) => b.count - a.count);

  // Top-down density heatmap: non-air blocks stacked in each XZ column.
  const columnDensity = new Map();
  for (const block of schematic.blocks()) {
    const key = (block.x | 0) + ',' + (block.z | 0);
    columnDensity.set(key, (columnDensity.get(key) || 0) + 1);
  }

  const width = Math.max(1, dimensions[0]);
  const height = Math.max(1, dimensions[2]);
  const maxDensity = Math.max(1, ...columnDensity.values());
  const heatmap = new Image(width, height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const density = columnDensity.get(x + ',' + z) || 0;
      const shade = Math.round((density / maxDensity) * 255);
      heatmap.setPixel(x, z, shade, shade, shade);
    }
  }

  return { dimensions, blockCounts, heatmap };
}
