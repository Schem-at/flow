// Searches the schemati platform. In the browser this rides your session;
// on the server it uses SCHEMATI_URL / SCHEMATI_API_TOKEN.
async function generate(
  tag: string,
  search: string,
  limit: Slider<{ min: 1; max: 50; default: 10 }>,
): {
  results: { name: string; id: string; format: string; tags: string; authors: string }[];
  firstId: string;
  count: number;
} {
  const found = await Schemati.searchSchematics({
    tag: tag || undefined,
    search: search || undefined,
    limit: limit,
  });

  const results = found.map((s) => ({
    name: s.name,
    id: Schemati.displayId(s),
    format: s.format,
    tags: s.tags.join(', '),
    authors: s.authors.join(', '),
  }));

  return {
    results,
    firstId: found.length ? Schemati.displayId(found[0]) : '',
    count: found.length,
  };
}
