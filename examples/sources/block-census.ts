function generate(
  schematic: Schematic,
): {
  csv: string;
  rows: Array<{ block: Block; count: number; percent: number }>;
} {
  // blockCounts() tallies every non-air block by id (the manual blocks() loop).
  const counts = schematic.blockCounts();
  let total = 0;
  for (const n of counts.values()) total += n;

  const rows = [...counts.entries()]
    .sort((p, q) => q[1] - p[1])
    .map((entry) => ({
      block: entry[0],
      count: entry[1],
      percent: total ? Math.round((entry[1] / total) * 1000) / 10 : 0,
    }));

  return { csv: Table.toCsv(rows), rows };
}
