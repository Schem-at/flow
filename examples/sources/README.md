# Example flow node sources

Each file here is one extracted copy of a flow node's code (the `source` strings
that the example flows and example blocks embed as template literals).

These are a **read-only export for reading/editing convenience**. The source of
truth is still:

- `client/src/lib/block/examples.ts` — the 18 reusable example blocks
  (`redstone-bus`, `parametric-terrain`, `parametric-building`, `build-analysis`,
  `julia-grid`, `block-census`, `hologram-mcfunction`, `logic-lab`, `noise-field`,
  `voronoi-field`, `combine-fields`, `shape-field`, `field-to-terrain`,
  `schemati-search`, `schemati-fetch`, `schemati-upload`, `pick-item`, `stitch-grid`).
- `client/src/lib/exampleFlows.ts` — 6 inline node sources used only by specific
  flows (`stitch-source`, `maze-gen-source`, `maze-solve-source`, `city-plan-source`,
  `city-build-source`, `erode-source`).

Editing a file here does **not** change the app. To apply a change, copy it back
into the corresponding template literal in the file above.

## Regenerate

```
node examples/.extract-sources.mjs
```

(re-runs the extraction and overwrites every file in this folder)
