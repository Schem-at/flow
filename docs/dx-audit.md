# DX audit — friction in example flows/blocks & proposed API improvements

Compiled while building and verifying every example block and flow
(`client/src/lib/block/examples.ts`, `client/src/lib/exampleFlows.ts`).
Each item names the friction, where it bites, and the proposed fix.
Status: **proposal list** — nothing here is implemented yet unless marked.

## 1. Ambient API gaps (functions blocks keep reimplementing)

### 1.1 `blocks()` includes air — the #1 footgun
Every analysis/census/preview block must remember `if (b.name === 'minecraft:air') continue;`.
Forgetting it caused the "terrain renders as a solid box" bug, air-polluted censuses, and
wrong heatmaps. Five examples carry the same filter line (`build-analysis`, `block-census`,
`hologram-mcfunction`, `schemati-search` flow census, preview generator in core).

**Fix:** `schematic.blocks({ includeAir?: boolean })` (default false!) or a separate
`solid_blocks()` — ideally upstream in nucleation; an ambient wrapper in the meantime.

### 1.2 Heightfield toolkit (`Field`)
The worldgen examples (`noise-field`, `voronoi-field`, `combine-fields`, `shape-field`,
`field-to-terrain`) all pass `number[][]` between nodes and each reimplements
normalize / lerp / clamp / terrace / sampling loops.

**Fix:** a `Field` ambient namespace:
`Field.fromNoise(w, h, opts)`, `Field.normalize(f)`, `Field.combine(a, b, fn)`,
`Field.terrace(f, steps)`, `Field.toImage(f, colormap)`, `Field.toTerrain(f, opts)`.
This would shrink the worldgen blocks to a few lines each and make `number[][]`
a first-class flow currency (it already renders in viewers).

### 1.3 Image construction is manual RGBA math
Biome maps, density heatmaps, and the upload preview all hand-roll
`{ width, height, data }` byte loops with inline color math.

**Fix:** `Image.create(w, h)`, `Image.fromField(field, palette)`, built-in palettes
(`'viridis'`, `'terrain'`, `'grayscale'`), `Image.setPixel/fill`. The `Image` ambient class
already exists as a type; give it a real constructor + helpers.

### 1.4 Deterministic hashing / seeded RNG
`parametric-building` (window jitter), `field-to-terrain` (tree placement), the preview
renderer (block colors) each define their own `hash2(x, z, seed)` FNV/imul snippet.
`Noise` is seeded but there's no cheap integer hash / RNG.

**Fix:** `Random.hash2(x, z, seed)`, `Random.hash3(...)`, `Random.seeded(seed) → () => number`.

### 1.5 Schematic stitching / pasting
The Julia stitcher copies tile blocks one-by-one in JS — O(blocks) through the WASM
boundary per tile. Nucleation has region/copy machinery but no simple
`paste(other, dx, dy, dz)` exposed on the wrapper.

**Fix (upstream):** `schematic.paste_schematic(other, offset)` (WASM-side, fast).
**Fix (editor):** a built-in **Stitch** node (grid of schematics → mosaic with spacing),
since "arrange N results spatially" recurs in flows.

### 1.6 CSV / report boilerplate
`block-census` builds a CSV string by hand even though TableViewer already exports
CSV/PNG from `rows` outputs. The csv output is redundant 90% of the time.

**Fix:** document "emit rows, viewers handle export"; add `Table.toCsv(rows)` for the
rare block that genuinely wants the string. Same for the bar-chart PNG path.

### 1.7 mcfunction generation
`hologram-mcfunction` string-formats `summon block_display` commands inline — easy to
typo NBT, hard to extend.

**Fix:** an `Mcfunction` builder ambient (`f.summonBlockDisplay(pos, block, transform)`,
`f.setblock(...)`, `f.toString()`), or a dedicated "Schematic → mcfunction" platform node.

### 1.8 Progress in loops
`Progress.report(percent)` requires manual percent math in every long loop
(folded flows auto-report per node, but intra-node progress is still manual).

**Fix:** `Progress.wrap(items, fn)` / `Progress.tick(i, total)` sugar.

## 2. Contract / editor ergonomics

- **Required string inputs**: `missingRequiredInputs` validates schematic/image kinds,
  but empty strings pass silently — blocks throw at runtime instead
  (`schemati-fetch`: "Provide a schematic id…"). Proposal: `Text<{ required: true }>`
  lifted into the contract and enforced pre-run with the inline "create inputs" UX.
- **Extension-named outputs are magic**: an output literally named `mcfunction` or `csv`
  becomes a download with that extension (`filenameForOutput`). It works but is
  undiscoverable. Proposal: explicit `FileOut<{ ext: 'mcfunction' }>` widget type.
- **List indexing between nodes**: flows that need "first result" force blocks to emit
  `firstId` (schemati-search does). Proposal: a built-in **Pick** node
  (list + index/field → item) so contracts stay clean.
- ~~No autocomplete for ambient APIs~~ — **done**: full nucleation `.d.ts` + curated
  standard-provider declarations now feed Monaco in both editors, plus the searchable
  docs modal (⌘⇧D).

## 3. Standalone-node candidates (code that should be a node)

| Candidate | Today | Why a node |
|---|---|---|
| Stitch / grid layout | JS loop in Julia stitcher | recurs in any "N variants" flow; O(n) WASM paste beats JS copying |
| Pick (index/field from list) | per-block `firstId` outputs | removes single-purpose plumbing outputs |
| Field ops (combine, terrace, shape) | example blocks | already node-shaped; promote from Examples to a Worldgen category like Schemati got |
| Schematic → mcfunction | example block | platform-adjacent utility, deserves first-class status |
| Schemati search/fetch/upload | — | **done** (Schemati palette category) |

## 4. Upstream nucleation asks

1. `blocks()` air filtering option (1.1) — biggest single DX win.
2. `paste_schematic(other, offset)` on the wrapper (1.5).
3. Single-entry palette crash: `region.rs:229` divide-by-zero when a region's palette
   has one entry (hit by flat Julia tiles; worked around by varying one block).
4. MCHPRS introspection: `is_lit` returns true for unlit lamps (we probe torches
   instead), `get_truth_table` returns all-false rows (doesn't toggle inputs).
5. Expose the `.d.ts` in the package `exports` map (`"./nucleation.d.ts"`), so the
   editor doesn't need a resolve-by-path alias to bundle it for autocomplete.

## 5. Priority

1. **1.1 air filter** (footgun, five call sites, upstream-or-wrapper)
2. **1.2 Field + 1.3 Image helpers** (worldgen examples shrink ~60%)
3. **Stitch node + paste upstream** (performance + recurring need)
4. **1.4 Random** (small, removes copy-paste)
5. Pick node, required-string contracts, Mcfunction builder
6. Upstream MCHPRS fixes (needs Rust-side work)
