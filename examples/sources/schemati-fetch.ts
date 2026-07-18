// Downloads a schematic from the platform by id, short id, or slug and
// loads it as a live Schematic (one download, parsed locally). The
// required flag blocks runs until the id is provided.
async function generate(
  id: TextField<{ required: true }>,
): {
  schematic: Schematic;
  name: string;
} {
  // One step: download + parse into a live Schematic.
  const loaded = await Schemati.loadSchematic(id);
  return { schematic: loaded.schematic, name: loaded.name };
}
