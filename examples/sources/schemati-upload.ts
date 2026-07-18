// Publishes a schematic to the schemati platform. In the browser you must be
// signed in; on the server SCHEMATI_API_TOKEN is used. Tags are comma-separated
// platform tag names. A top-down preview image is generated automatically.
async function generate(
  schematic: Schematic,
  name: string,
  description: string,
  tags: string,
  isPublic: Toggle<{ default: true }>,
): {
  id: string;
  url: string;
  summary: string;
} {
  if (!name) throw new Error('Give the upload a name');
  const tagList = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const uploaded = await Schemati.uploadSchematic(schematic, {
    name: name,
    description: description || undefined,
    tags: tagList,
    isPublic: isPublic,
  });

  const id = Schemati.displayId(uploaded);
  return {
    id,
    url: uploaded.webUrl || '',
    summary: 'Uploaded "' + uploaded.name + '" (' + id + ')',
  };
}
