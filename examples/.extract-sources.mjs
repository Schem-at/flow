import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'examples', 'sources');
mkdirSync(outDir, { recursive: true });

// const name -> source file it lives in
const targets = {
  // block/examples.ts
  REDSTONE_BUS: 'client/src/lib/block/examples.ts',
  PARAMETRIC_TERRAIN: 'client/src/lib/block/examples.ts',
  PARAMETRIC_BUILDING: 'client/src/lib/block/examples.ts',
  BUILD_ANALYSIS: 'client/src/lib/block/examples.ts',
  JULIA_GRID: 'client/src/lib/block/examples.ts',
  BLOCK_CENSUS: 'client/src/lib/block/examples.ts',
  HOLOGRAM_MCFUNCTION: 'client/src/lib/block/examples.ts',
  LOGIC_LAB: 'client/src/lib/block/examples.ts',
  NOISE_FIELD: 'client/src/lib/block/examples.ts',
  VORONOI_FIELD: 'client/src/lib/block/examples.ts',
  COMBINE_FIELDS: 'client/src/lib/block/examples.ts',
  SHAPE_FIELD: 'client/src/lib/block/examples.ts',
  FIELD_TO_TERRAIN: 'client/src/lib/block/examples.ts',
  SCHEMATI_SEARCH: 'client/src/lib/block/examples.ts',
  SCHEMATI_FETCH: 'client/src/lib/block/examples.ts',
  SCHEMATI_UPLOAD: 'client/src/lib/block/examples.ts',
  PICK_ITEM: 'client/src/lib/block/examples.ts',
  STITCH_GRID: 'client/src/lib/block/examples.ts',
  // exampleFlows.ts (inline node sources)
  STITCH_SOURCE: 'client/src/lib/exampleFlows.ts',
  MAZE_GEN_SOURCE: 'client/src/lib/exampleFlows.ts',
  MAZE_SOLVE_SOURCE: 'client/src/lib/exampleFlows.ts',
  CITY_PLAN_SOURCE: 'client/src/lib/exampleFlows.ts',
  CITY_BUILD_SOURCE: 'client/src/lib/exampleFlows.ts',
  ERODE_SOURCE: 'client/src/lib/exampleFlows.ts',
};

const fileCache = {};
const read = (rel) => (fileCache[rel] ??= readFileSync(join(root, rel), 'utf8'));

const kebab = (name) => name.toLowerCase().replace(/_/g, '-');

let written = 0;
const problems = [];

for (const [name, rel] of Object.entries(targets)) {
  const src = read(rel);
  // Match `const NAME = ` followed by a backtick, capture up to the next backtick.
  const re = new RegExp('(?:export\\s+)?const\\s+' + name + '\\s*=\\s*`([\\s\\S]*?)`');
  const m = src.match(re);
  if (!m) {
    problems.push(`MISSING: ${name} in ${rel}`);
    continue;
  }
  const code = m[1];
  if (code.includes('`')) problems.push(`BACKTICK-IN-BODY: ${name}`);
  const trimmed = code.replace(/^\n/, '').replace(/\n$/, '') + '\n';
  writeFileSync(join(outDir, `${kebab(name)}.ts`), trimmed);
  written++;
}

console.log(`wrote ${written}/${Object.keys(targets).length} files to flow/examples/sources/`);
if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
