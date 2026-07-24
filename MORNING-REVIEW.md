# Morning Review — 2026-06-18 (overnight)

Good morning ☕ — here's your guided tour. **Everything is uncommitted** (dirty tree, per your workflow). Independently re-verified at the end: **core 480/480, client 275/275, synthase 9, server 74; client `tsc` = only the 6 known pre-existing errors.**

## TL;DR
- **11 meta-nodes built + tested** (visual, semantic, control-flow) — compile/execute logic is unit-tested; node *rendering/interaction* needs your eyes (I can't drive the browser headlessly).
- **5 richer combined examples** + the basic per-node ones — open these to learn the nodes.
- **Headless execution verified** — meta-node flows run through the *real* worker engine (`PolymeraseEngine` + SES compartment), not just `compileFlow`.
- **Caught + fixed a real bug** the headless pass exposed: positional-vs-object `generate` calling convention (broke headless/module/worker execution for several shipped blocks). Fixed two ways; ARPU/BatPU-2 byte-exactness held.
- **Two system designs delivered as MD** (your ask): **Flow Worker** (distributed, community tag-transition hooks) + **Admin Dashboard**.

## Meta-node status
| Node | Category | What it does | Logic tested? | Needs your eyes |
|---|---|---|---|---|
| Comment | visual | sticky note | n/a | render/resize |
| Frame | visual | labeled backdrop | n/a | z-index / drag-behind |
| Reroute | visual | edge-tidy passthrough | ✅ | hitbox |
| Constant | visual | typed literal source | ✅ | widget; vec3/block cast |
| `Advanced ▾` | visual | collapse rarely-used params | n/a | toggle behaviour |
| Bundle | semantic | N inputs → one `object` | ✅ | dynamic-field UI (rename drops edge) |
| Unbundle | semantic | `object` → N outputs | ✅ | dynamic-field UI |
| Inspect | semantic | live value tap | ✅ (passthrough) | preview only after a run |
| **Group** | semantic | collapse subgraph → 1 node | ✅ (nested + list/object boundary) | collapse UX; **no nested editor yet** |
| Switch | control | select 1 of N by index | ✅ | case-removal is last-only |
| **Map** | control | run a body per list element | ✅ (nested) | body read-only; no collapse-to-Map |

Compile + execute for every node is proven at the compiler/engine layer (incl. headless). The "needs your eyes" column is purely visual/interaction.

## 🐛 The bug worth knowing about (found + fixed)
The headless pass revealed that `compileFlow` folded a block's `generate` and called it with **one object**, while several shipped blocks used **positional params** — so they worked in the editor's per-node runner but were **mis-called headless / as modules / on a worker** (exactly the modules + worker use cases you care about). Fixed two ways: (1) the folded call-site now detects positional params and spreads args; (2) all 16 example blocks converted to canonical object-form `generate(inputs)`. A new headless test asserts the previously-wrong output is now correct. **ARPU/BatPU-2 byte-exact tests unchanged.**

## 🎬 Try these (open in the editor)
- `example-config-bundle` · `example-map-areas` · `example-group-quadratic` · `example-switch-route` · `example-rom-map-inspect` (the richer showcases)
- plus the basics: `example-object-bundle`, `example-group-pipeline`, `example-switch-select`, `example-map-double`
- and your assembler/ROM flows from before all still green.
- **Group/Map**: select nodes → **Cmd/Ctrl+G** to group (Shift to ungroup); Map bodies are programmatic for now.

## 🖥️ Systems designs (MD, as requested)
- **Flow Worker** → `docs/superpowers/specs/2026-06-18-flow-worker-design.md` (+ runnable prototype `flow/worker-agent/worker.ts`, `flow/WORKER-NOTES.md`). Punchline: a worker = schemati's existing headless path minus the HTTP server + a job-pull loop; the only app change is **one line** in `TagTransitionService::applyTransition()`; long-poll claim w/ `FOR UPDATE SKIP LOCKED`; semi-trusted workers verified by sampled re-run.
- **Admin Dashboard** → `docs/superpowers/specs/2026-06-18-worker-admin-dashboard-design.md` (+ `flow/DASHBOARD-NOTES.md`). Filament `/admin` fleet page + community Folio/Livewire page over a shared `FleetQueries`/`WorkerControls` service; heartbeat-derived online/offline; `worker_metric_buckets` rollup for cheap charts.

## 👀 Top things needing your eyes / decisions
1. **Visual/interaction review** of all 10 node components (rendering, drag-connect, the Meta palette + Cmd+K entries) — logic is solid; pixels aren't verified.
2. **Group/Map nested editor** is the #1 follow-up — v1 expands read-only; editing = ungroup→edit→regroup. Worth deciding if you want an in-place sub-editor.
3. **The 16-block positional→object conversion** — confirm you're happy with the canonical convention (it's what makes modules/workers viable).
4. **Prod `VITE_FEATURE_MODULES`** is back on (re-enabled earlier) — flip off if you didn't want it in prod yet.
5. **Commit strategy** — this is a large, coherent, fully-tested set; happy to help slice it into reviewable commits when you're up.

## 📁 New files (highlights)
- Nodes: `client/src/components/nodes/{Comment,Frame,Reroute,Constant,Bundle,Unbundle,Inspect,Group,Switch,Map}Node.tsx`
- Compiler: `packages/core/src/compile/group.ts` (+ `flow-compiler.ts` cases), `headless-exec.test.ts`
- Examples: additions in `client/src/lib/exampleFlows.ts`
- Specs: `docs/superpowers/specs/2026-06-18-{meta-nodes,flow-worker,worker-admin-dashboard}-design.md`
- Notes: `flow/{WORKER,DASHBOARD}-NOTES.md`

---

# Detailed per-fork log

## 2026-06-18 — Meta-nodes: visual-tidiness batch

Overnight autonomous work. Tree left dirty (no commit). All hard gates pass.

### What I built

**Design doc**: `docs/superpowers/specs/2026-06-18-meta-nodes-design.md` — covers ALL planned meta-nodes (Comment, Frame, Reroute, Constant, Inspect, Bundle/Unbundle, Group/Subflow), each with purpose / `data` shape / ports / compiler case / difficulty. Bundle/Unbundle and Group are designed only, NOT built (later forks, per instructions).

**New node components** (`client/src/components/nodes/`):
- `CommentNode.tsx` (type `comment`) — resizable amber sticky note, editable multiline label, no ports, no execution.
- `FrameNode.tsx` (type `frame`) — dashed labeled backdrop, `zIndex:-1`, body `pointer-events:none` (nodes on top stay clickable), interactive header (grab to move, double-click to rename), `NodeResizer`. No React-Flow reparenting — pure backdrop.
- `RerouteNode.tsx` (type `reroute`) — tiny dot, 1 input + 1 output handle, transparent pass-through.
- `ConstantNode.tsx` (type `constant`) — no inputs, one typed output; type selector (number/string/boolean/vec3/block) + inline widget; emits a literal.
- Registered all four in `client/src/components/nodes/index.ts`.

**CodeNode "Advanced ▾"** (`CodeNode.tsx`): `data.advancedFields: string[]` hides those input port keys behind a default-collapsed toggle. Presentational only — contract unchanged; connected advanced ports stay visible so wires aren't hidden.

**Compiler** (`packages/core/src/compile/flow-compiler.ts`):
- Added `PASSTHROUGH_TYPES = {viewer, reroute}`; `resolveThroughViewers` now walks through reroutes → an edge through a reroute behaves as a direct connection.
- Added `constant` handling in `sourceType` (→ `constantNodeFlowType`) and `sourceExpression` (→ baked `__const_*` literal). Constants are NOT exposed as flow inputs (`compiled.inputs` stays empty).
- Frame/comment are ignored by omission (no filter/registry matches them).

**Creation UI**: added a "Meta" category to `Toolbar.tsx` (drag + click) and four entries to `CommandPalette.tsx` (Cmd+K). Added a `nodeProps` template field (threaded through Toolbar click, drag/drop via a new `application/reactflow-nodeprops` dataTransfer key in `Editor.tsx` onDrop, and CommandPalette) so Frame gets `zIndex:-1`.

### LOGIC-TESTED (trustworthy)

`packages/core/src/compile/flow-compiler.test.ts` — 5 new tests (19 total, all pass):
- reroute between source and code node passes value through transparently;
- chained reroutes;
- constant emits a baked literal (and is not a flow input);
- constant through a reroute;
- flow with frame + comment nodes still compiles, contributing no ports/edges/errors.

Gates: core `tsc --noEmit` clean; core `vitest run` = 444 passed / 23 files; `dist` rebuilt. Client `tsc -b` = only the 6 known pre-existing errors (CodePanel x2, Workbench x2, layout.ts x2), zero new. Client `vitest run` = 244 passed / 12 files.

### NEEDS-VISUAL-REVIEW (not exercised by tests)

- **Frame z-index/drag**: confirm the backdrop actually renders BEHIND nodes and that nodes on top stay clickable while the header is still grabbable and resize handles reachable. `zIndex:-1` is set at creation; React Flow z-index behavior with `elevateNodesOnSelect` (if enabled) was not verified.
- **Comment resize + typing**: NodeResizer handles, and that typing in the textarea doesn't fire canvas delete/shortcuts (stopPropagation added but untested in-app).
- **Reroute / Constant widgets**: handle hitboxes and widget UX are visual only.
- **CodeNode Advanced toggle**: that hidden handles still connect when expanded, and connected advanced ports correctly stay visible.
- **Palette entries**: that the new Meta category and Cmd+K entries insert the right nodes (drag AND click paths).

### Known gaps / honesty

- `ConstantNode` supports `vec3`/`block`, but the store's `FlowNode.data.dataType` union is narrowed to `number|string|boolean`; the component casts. A clean follow-up would widen that union. Functionally fine (value is a plain literal).
- Frame does NOT capture/parent dropped nodes (intentional, per instructions). If true grouping is wanted later, that's the Group/Subflow fork.
- No React component unit tests were added for the new nodes (the repo has no node-component test harness; client tests are lib-level). Visual review covers these.
- Did not touch Bundle/Unbundle/Group/Inspect — designed only.

---

## 2026-06-18 — Fork 2: Bundle / Unbundle / Inspect (object meta-nodes)

Overnight autonomous work, building on Fork 1's patterns. Tree left dirty (no commit). All hard gates pass.

### What I built

**New node components** (`client/src/components/nodes/`), registered in `index.ts`:
- `BundleNode.tsx` (type `bundle`) — N dynamic INPUT ports (one per field) → ONE `output` of `kind:'object'`. Inline field editor: each row is an input handle + editable name + remove (✕); a dashed "+ field" button adds one. `data.bundleFields: { name: string }[]`.
- `UnbundleNode.tsx` (type `unbundle`) — ONE `input` (object) → N dynamic OUTPUT ports. Same field-editor UI mirrored to the right. A wand button auto-fills field names from the connected object's known keys (read from the upstream bundle config or the producer's `{object}` contract).
- `InspectNode.tsx` (type `inspect`) — transparent tap (1 in / 1 out). Compiles away (passthrough); renders a small LIVE preview of the value on the wire.

**Compiler** (`packages/core/src/compile/flow-compiler.ts`):
- Bundle/unbundle now **participate in the topological order** with code nodes (`orderNodes = code + bundle + unbundle`) and each binds one `const` INSIDE `generate()` in dependency order — necessary because a bundle can read a code result and a code node can read an unbundled field.
- **Bundle** emit: `const __bundle_x = { field: <expr>, ... }` (unconnected fields omitted → `undefined`). `sourceType` → `{kind:'object', fields}` inferred from connected sources. `sourceExpression` → the const.
- **Unbundle** emit: `const __unbundle_x = <incoming object expr>`; `sourceExpression(field)` → `__unbundle_x?.["field"]`; `sourceType(field)` → the object's field type if known.
- `inspect` added to `PASSTHROUGH_TYPES` (compiles away like reroute).
- Guarded the two terminal-fallback loops (`outputs` + `contract`) to only consider `code` terminals; `hashFlow` now includes `bundleFields`.
- `NodeType` union (`packages/core/src/types/index.ts`) extended with `frame/reroute/constant/inspect/bundle/unbundle` (was missing the Fork-1 meta types too, which blocked typed FlowData examples). `FlowNode.data.bundleFields` added to the client store type.

**Example flow**: `OBJECT_BUNDLE_FLOW` (`exampleFlows.ts`, id `example-object-bundle`) — 3 ROM-config constants (width/height/depth) → Bundle `cfg` → a `Box Stats` block (cfg → summary object) → Unbundle → volume + label outputs. Added to `EXAMPLE_FLOWS` and the `exampleFlows.test.ts` id-list.

### LOGIC-TESTED (trustworthy)

`flow-compiler.test.ts` "object meta-nodes" — 6 new tests (25 total in file, all pass):
- Bundle of 3 constants → object literal with all keys → downstream `Sum` reads it (= 35);
- unconnected bundle field is omitted (only connected field contributes);
- bundle exposed directly on an output resolves to an `{object}` contract type;
- Unbundle of a code node's object output → per-field bracket read (round-trips a value);
- full **Bundle → consumer → Unbundle** round-trip (object survives a pass: `{x:3,y:9}` out);
- Inspect passes through transparently — folded source contains neither `inspect` nor the label, result unchanged.

`exampleFlows.test.ts` — `OBJECT_BUNDLE_FLOW` folds to `volume:number` + `label:string` outputs; source contains `__bundle_`/`__unbundle_`.

Gates: core `tsc --noEmit` clean; core `vitest run` = **450 passed / 23 files**; `dist` rebuilt. Client `tsc -b` = only the **6 known pre-existing errors** (CodePanel x2, Workbench x2, layout.ts x2), zero new. Client `vitest run` = **248 passed / 12 files**.

### NEEDS-VISUAL-REVIEW (not exercised by tests)

- **Dynamic-field UI (Bundle/Unbundle)** — the add/remove/rename interaction is the main thing to eyeball: typing a field name re-keys its handle (handle id = field name), so renaming a CONNECTED field will drop its edge (React Flow can't follow a handle-id change). Consider whether rename-with-live-edge should remap edges; I did not, to keep it simple. Verify add/remove feel, the "+ field" button, and the unbundle "wand" auto-fill.
- **Empty / duplicate field names** — the UI doesn't prevent a blank name or two fields with the same name. The compiler tolerates it (last wins in the object literal) but it's a footgun; flagging for a design call rather than silently enforcing.
- **Inspect live preview** — the preview only populates AFTER the flow runs (it reads the upstream node's `nodeCache` output, the same hook ViewerNode uses). Before any run it shows "no value yet — run the flow". Verify: the placeholder→value transition, formatting/truncation of objects/arrays/schematics, and node sizing. This is a REAL runtime hook (not faked), but it is read-only and only as fresh as the last execution.

### Known gaps / honesty

- Type INFERENCE for bundle fields uses the connected source's `sourceType`; for fields fed by another bundle/unbundle the type is best-effort (`unknown` in some chained cases). Execution is unaffected (values are plain JS); only the editor's type hints/viewer selection degrade to `unknown`.
- Unbundle field reads use optional chaining (`?.`), so unbundling a non-object (or unconnected input → `{}`) yields `undefined` rather than throwing — intentional, matches the "unconnected → undefined" bundle behaviour.
- No nested bundle/unbundle round-trip test (object-of-objects). The compiler should handle it (it's just nested literals + bracket reads) but it's untested — flagging.
- As with Fork 1, no React-component unit tests for the three new nodes (no harness in repo); dynamic-field UI + inspect preview rely on visual review.
- Did NOT build Group/Subflow or Switch/Map (later forks).

## 2026-06-18 — Fork 3: Group / Subflow meta-node

Overnight autonomous work, building on Fork 1/2 patterns. Tree left dirty (no commit). All hard gates pass. This was the high-risk fork; the compile/execute core + group/ungroup transforms are LOGIC-TESTED; the collapse UX + nested-editor are scaffolded and flagged for visual review.

### What I built

**Core data model + transforms** (`packages/core/src/compile/group.ts`, new):
- A `group` node embeds a nested subgraph in `data.subgraph: { nodes, edges }` and a derived boundary contract: `data.groupInputs` / `data.groupOutputs` as `BoundaryPort[]` (`{ name, internalNodeId, internalHandle, externalNodeId, externalHandle, type? }`).
- `deriveBoundary(selectedIds, edges, typeOf?)` — OUTSIDE→INSIDE edges → group INPUTS, INSIDE→OUTSIDE → group OUTPUTS, INSIDE→INSIDE stay internal. Ports are derived from the crossing EDGES (the producing port's FlowType), so they carry the REAL types (list/schematic/object), NOT the scalar-only inputs the module fold supports. Fan-in/fan-out from a single port collapses to one boundary port.
- `groupNodes(allNodes, allEdges, selectedIds, opts)` and `ungroup(allNodes, allEdges, groupId)` — pure graph transforms (collapse selection → group node + rewire boundary edges; inline subgraph back + reconnect). `isGroupNodeData` type guard, `nextGroupId()`.

**Nested compilation** (`packages/core/src/compile/flow-compiler.ts`):
- `compileFlow` now delegates to an internal `compileGraph(flow, options)`; `options.boundaryInputs` / `boundaryOutputs` switch it into "subgraph mode". A `group` node participates in the topological order (binds one `const`).
- A group emits `const __group_x = await (function(){ …block consts…; async function generate(inputs){…}; return generate; }())({ inName: <outerExpr>, … });`; outputs read `__group_x?.["outName"]`. The subgraph is compiled by the SAME `compileGraph` via `compileSubgraphClosure`, so boundary-fed internal handles read off the closure params (`inputs[name]`) and the subgraph returns its boundary outputs. Groups nest recursively (a group inside a group composes — tested).
- `sourceType`/`sourceExpression` got `group` cases (output type from the boundary descriptor; expression = bracket read off the awaited result). Code-node args, bundle fields, and unbundle input all honor boundary bindings. `hashFlow` includes the group subgraph + boundary contract. Relaxed the "no code nodes" guard so a subgraph wrapping only meta nodes still compiles.
- Inlined in the SAME worker — no backend round-trip; headless-safe.

**Client** (`client/`):
- `components/nodes/GroupNode.tsx` (registered in `nodes/index.ts`) — collapsed node with boundary ports (left=inputs, right=outputs, dot-coloured by FlowType kind), a header summary, an **Ungroup** button, and a double-click / chevron **read-only** expanded view (subgraph node list + boundary JSON). NOT a nested visual editor (v1 scope).
- Store (`store/flowStore.ts`): `groupSelected(ids?)` (resolves selection → builds a `typeOf` resolver from producer contracts → `deriveGroup` → centroid position → swaps nodes/edges/cache) and `ungroupNode(groupId)` (inlines, restores subgraph node positions). `FlowNode.data` gained `subgraph` / `groupInputs` / `groupOutputs`.
- Creation/invocation UI: Cmd/Ctrl+G groups the selection, Cmd/Ctrl+Shift+G ungroups (Editor.tsx); a "Group Selection" entry in the Toolbar Meta category; "Group Selection" + "Ungroup" action commands in the Cmd+K palette. `NodeType` union + core `index.ts` exports extended with `group`/group helpers.
- Example: `GROUP_PIPELINE_FLOW` (`exampleFlows.ts`, id `example-group-pipeline`) — a list constant → group{ Sum list → Double } → output, showcasing a LIST boundary input. Added to `EXAMPLE_FLOWS` + the id-list test.

### LOGIC-TESTED (trustworthy)

`packages/core/src/compile/flow-compiler.test.ts` (8 new tests, all green):
- A `group` whose subgraph is two chained code nodes compiles + executes inline; boundary inputs flow in, boundary outputs come out (`sum([1,2,3,4]) → double = 20`).
- A **LIST** boundary input crosses the boundary correctly (number[] → sum) — proves it beats the scalar-only module fold.
- An **OBJECT** boundary input crosses (a bundle's `{object}` → group → CFG_SUM = 35).
- A **group nested inside a group** runs (recursive inline closures).
- Boundary output FlowType lands in the folded contract.
- `deriveBoundary` derives the right in/out crossings; `groupNodes` collapses + rewires; `group → ungroup` is a round-trip (same nodes + edge connectivity); a grouped flow executes IDENTICALLY to the original.

`client/src/lib/exampleFlows.test.ts`: `GROUP_PIPELINE_FLOW` folds (contains `__group_`, `result:number` contract) + the id-list.

Gates: core `tsc --noEmit` clean, `vitest run` 458 green, `rm -rf dist && bun run build` OK. Client `tsc -b --force` → only the 6 known pre-existing errors (CodePanel ×2, Workbench ×2, layout.ts ×2), zero new; `vitest run` 250 green.

### NEEDS-VISUAL-REVIEW (not exercised by tests)

- **Collapse-selection UX** — `groupSelected()` reads React Flow's `selected` flag (multi-select) or the single `selectedNodeId`. The actual drag-select → Cmd+G feel, the group node's centroid placement, and edge re-rendering after collapse are NOT tested; eyeball them. Grouping a single node or a non-contiguous selection is allowed (not blocked) — may want a min-2 / connectivity guard after a design call.
- **GroupNode rendering** — boundary handle vertical distribution, port dot colours, the collapsed summary, and the **read-only** expanded view (node list + boundary JSON). The Ungroup button calls the store action (real) but the visual result needs eyeballing.
- **Ungroup positioning** — subgraph nodes keep the positions captured at group time; if absent they're laid out in a 3-wide grid offset from the group. Verify they don't stack or land off-screen.
- **No nested visual editor** — double-click expands a READ-ONLY view only; you cannot edit the subgraph in place in v1. Editing means ungroup → edit → regroup. Flagged as the main follow-up.

### Known gaps / honesty

- **Boundary type inference** in `groupSelected`'s `typeOf` is best-effort: it reads the producer's contract outputs (or input/constant `dataType`), falling back to `{kind:'unknown'}`. Execution is unaffected (plain JS values); only the boundary-port type LABELS degrade. The compiler-level tests pass explicit `type`s, so the *compile* path is fully typed; the *interactive* derivation is the softer part.
- **Terminal-group outputs**: the no-output-node fallback in the compiler only exposes terminal *code* nodes. A group with no downstream + no output node won't auto-expose its outputs (wire it to an output node). Minor; flagged.
- **ID collisions on ungroup** are not remapped — if a subgraph node id somehow clashes with a surviving parent id, the later wins. Can't happen via the normal group→ungroup flow (ids are preserved), but a hand-crafted graph could trip it.
- Subgraph nodes are stored as plain objects carrying their React Flow `position` (cast through `GroupNodeLike`); the position survives round-trips at runtime but is untyped on the core boundary type — intentional, keeps core UI-agnostic.
- Did NOT build Switch/Map (next fork).

---

## Fork 4 — Switch + Map (control-flow meta-nodes)

Overnight autonomous work. Tree left dirty (no commit). All hard gates pass.

### BUILT

- **Switch / Select** (`switch`, `SwitchNode.tsx`) — selects one of N case inputs
  by a numeric `selector`, with optional `default`. Dynamic add/remove-case UI
  (mirrors Bundle), case count in `data.caseCount` (default 2). Compiler emits a
  chained ternary over the already-bound input expressions. Output type = union
  of case (+ default) kinds, else `unknown`.
- **Map / Iterate** (`map`, `MapNode.tsx`) — runs a BODY subgraph per element of
  a `list` input, collecting a `list` of `result`s. Body data shape
  (`MapNodeData`) REUSES Group's `GroupSubgraph`/`BoundaryPort`. Compiler reuses
  Fork 3's `compileGraph({boundaryInputs, boundaryOutputs})` via
  `compileMapBodyClosure`, emitting `await Promise.all((list ?? []).map(...))`.
- Registered in `client/src/components/nodes/index.ts`; added to the **Meta**
  category in `Toolbar.tsx` and `CommandPalette.tsx`. `NodeType` extended with
  `switch`/`map`; store `FlowNode['data']` extended with
  `caseCount`/`bodyInputs`/`bodyOutputs`/`resultPort`.
- Core exports: `isMapNodeData`, `MapNodeData` (group.ts → compile/index.ts →
  core index.ts).
- Examples: `SWITCH_SELECT_FLOW` (`example-switch-select`) and `MAP_DOUBLE_FLOW`
  (`example-map-double`) in `exampleFlows.ts`, added to `EXAMPLE_FLOWS` + id-list
  test. `client/src/lib/makeMap.ts` ships `defaultMapData()` (item→Double→result)
  so a dropped Map works out of the box.

### Switch EAGER-EVALUATION note (read this)

The graph is pure dataflow: every upstream producer runs regardless of which
case the selector picks. Switch does NOT skip branches or short-circuit side
effects — it is a pure SELECTOR over already-computed values (chained ternary /
equivalent array index). If branch-level laziness is ever needed, that is a
separate conditional-execution gate primitive, out of scope here. Documented in
the design doc §9 and in `SwitchNode.tsx` / the compiler comments.

### Map reuses compileGraph

Map's body compilation goes through the IDENTICAL boundary mechanism as Group
(Fork 3): `compileMapBodyClosure` → `compileGraph(flow, {boundaryInputs,
boundaryOutputs})`. `bodyInputs`/`bodyOutputs` are just `BoundaryPort[]` with the
`item`/`index`/`result` naming convention. A map body can therefore contain
code/bundle/unbundle/group/switch/nested-map nodes and composes recursively, for
free, with zero new subgraph-compiler code.

### LOGIC-TESTED (green)

- `flow-compiler.test.ts` (+ new suites): Switch selects case0 (sel=0), case1
  (sel=1), default (out-of-range); union output type. Map over a list runs the
  body per element (doubled list); Map with `index` (`[10,21,32]`); empty list →
  empty list; a Map body using a code node with a same-named helper (block scope
  intact); list-of-number output type.
- `exampleFlows.test.ts`: `SWITCH_SELECT_FLOW` folds (`__sw_`, string output),
  `MAP_DOUBLE_FLOW` folds (`__map_`, list-of-number output) + id-list updated.
- Gates: core `tsc --noEmit` clean, `vitest run` 467 green, `rm -rf dist &&
  bun run build` OK. Client `tsc -b` → only the 6 known pre-existing errors
  (CodePanel ×2, Workbench ×2, layout.ts ×2), ZERO new; `vitest run` 254 green.

### NEEDS-VISUAL-REVIEW (not exercised by tests)

- **SwitchNode rendering** — selector/case/default port layout, add/remove-case
  buttons, handle styling, the amber theme. Logic is tested; the visual node and
  drag-connect feel are not. Removing a case only drops the LAST `case{n-1}`
  (count-based); per-row arbitrary removal would need named-case data (flagged).
- **MapNode rendering** — `list`→`output` handles, the read-only expanded body
  view (node list + item/index flags + boundary JSON). Eyeball it.
- **Map body editing is READ-ONLY** — same posture as Group v1. You cannot edit
  the body in place; bodies are authored programmatically (`defaultMapData()`).
  The full collapse-selection-into-a-Map UX (`makeMap`) is a documented but
  UNBUILT seam in `client/src/lib/makeMap.ts`. Main follow-up.
- **Palette drop** — dropping Switch/Map from Toolbar/Cmd+K is wired via the
  existing `config` spread; verify the default Map body survives the add path and
  the node renders + executes end-to-end in the live editor.

### Known gaps / honesty

- **No collapse-to-Map action** — unlike Group's `groupSelected()`, there is no
  `mapSelected()` store action / Cmd-shortcut yet. Map nodes are added with a
  default body only. `makeMap` is stubbed/documented, not implemented (designating
  which boundary becomes `item` and wiring `result` is the fiddly part).
- **Switch case removal is last-only** — cases are positional (`case0..n-1`)
  derived from `caseCount`, not a named list, so the X button removes the last
  case. Renaming/removing arbitrary middle cases would need a Bundle-style named
  field list; deferred (selector is an index anyway).
- **Switch output type is best-effort** — union collapses to a single kind only
  if all connected cases agree; otherwise `unknown`. Execution unaffected.
- **Terminal Switch/Map without an output node** won't auto-expose (the no-output
  fallback only surfaces terminal CODE nodes — same caveat as Group). Wire them
  to an output node. Minor; flagged.
- **`makeMap.ts` body node carries `position` via a cast** — kept for the
  deferred nested editor / ungroup-style flows; untyped on the core boundary
  (intentional, keeps core UI-agnostic), same approach as Group subgraph nodes.

---

# Fork 5 — Examples + Headless Verification

## Goal A — Headless backend verification (PROVEN)

The earlier forks proved `compileFlow` emits the right *source* (via a bare
`(0, eval)` shim). This fork proves the meta-nodes actually **execute** through
the real headless engine.

**Approach.** New suite `packages/core/src/compile/headless-exec.test.ts` runs
each flow through the SAME path a standalone/distributed Bun worker uses in
`server/src/worker/execution.worker.ts` (`handleFlow`'s folded fast path):

    compileFlow(flow)  →  new PolymeraseEngine({ contextProviders })
                       →  engine.executeScript(folded.source, inputs)

`executeScript` goes through `SynthaseService` → the SES compartment — the exact
runtime the worker uses, NOT a raw eval. The tests assert the engine's
`result.result` OUTPUT VALUES. Hermetic: every flow uses plain number / list /
object data, with a minimal pure-JS context (`{ Progress: { report } }`), so
there is NO nucleation WASM init — meta-node plumbing is the point.

**Proven headless (6 tests, all green):**
- Reroute + Constant — literal flows through a reroute into a code node → `25`.
- Bundle → consumer → Unbundle — object round-trips, scalars come back out → `{width:3,height:9,total:17}`.
- Group (sub-pipeline) — `sum([1,2,3,4]) * 2` inlined as an awaited closure → `20`.
- Map over a number list — doubling `[1,2,3]` → `[2,4,6]`.
- Switch — selector picks case0 / case1 / default → `'zero'` / `'one'` / `'fallback'`.
- Combined Map→Group — `[1,2,3]` → Map(double) → `[2,4,6]` → Group(sum) → `12`.

All run via `PolymeraseEngine.executeScript` (the worker's folded path), not the
eval shim, so this is genuine headless execution with correct results.

## Node that needed special handling headless

- **Positional-param blocks don't execute under the fold.** `compileFlow`
  inlines a code node's `generate` verbatim and always calls it with ONE
  `inputs` object: `__block({ name: val })`. A block written with positional
  params (`function generate(bytes, base, …)` — like the shipped `rom-data`
  block) therefore receives the whole object as its first positional arg and
  fails at runtime (`bytes.map is not a function`). It still folds and
  typechecks — only headless *execution* of the folded source is affected.
  This is a pre-existing latent issue (assembler/ROM example tests only assert
  fold + contract, never execute). For the ROM showcase I used an object-form
  mirror block (`function generate(inputs)` calling `Rom.data`) so it runs
  cleanly. **Follow-up candidate:** make the fold spread positional args when a
  block uses the positional form. Noted in the design doc.

## Goal B — Richer combined example flows

Added to `client/src/lib/exampleFlows.ts` (+ id-list assertion and a
compileFlow fold **and exec** test for each in `exampleFlows.test.ts`):

- **`example-config-bundle`** — Config Bundle → Consumer → Unbundle. count/speed/size
  constants pack into one `cfg` object, a "particle sim" block consumes it, and the
  stats object is unbundled back into `particles` + `energy`. Exec: `{particles:10, energy:120}`.
- **`example-map-areas`** — Map a list: radii `[1,2,3,4]` → Map(disc area) → `[3,13,28,50]`.
  Body uses real arithmetic per element bound to the `item` boundary input.
- **`example-group-quadratic`** — Group a 2-node sub-pipeline (Square → Combine) computing
  `2x² + 3x + 1` behind ONE group node with a single `x` in / `y` out boundary. Exec: `x=4 → 45`.
- **`example-switch-route`** — Switch routing between two COMPUTED branches (Add100=107,
  Mul10=70); selector=1 routes Mul10 → `70`. Both branches eval; switch selects one.
- **`example-rom-map-inspect`** — Assembler/ROM tie-in: a `bytes` list → object-form ROM-data
  block (`Rom.data` digit string) → **Inspect** tap → `romData` output; in parallel a **Map**
  formats each byte as 2-digit hex. Exec (with a faithful `Rom` stub): `romData='010FFF10'`,
  `hexBytes=['01','0f','ff','10']`. NOTE: the Inspect output edge must keep the upstream
  handle (`data`), not `'output'`, when the upstream has >1 output — else the fallback
  "single output" rule can't resolve it.

## Verification (all gates green)

- `packages/core`: `bunx tsc --noEmit` clean; `bunx vitest run` → **473 passed** (incl. the
  6 new headless-exec tests). Core source unchanged (test-only), no rebuild needed.
- `client`: `bunx tsc -b` → only the **6 known pre-existing errors** (CodePanel/Workbench
  unused decls, elkjs module, layout `any`), zero new. `bunx vitest run` → **272 passed**
  (incl. exampleFlows.test.ts 72).
- `server`: `bunx vitest run` → **74 passed** (sanity; no tests added there — the headless
  path is unit-tested in core where the engine is directly constructible).

---

## Fork 6 — Calling-convention fix + cleanup + tests

### The convention bug
Two execution paths invoke a code block's `generate`, and they DISAGREED on the
calling convention:

- **Editor per-node runner** (`packages/core/src/compile/index.ts` →
  `compileBlock`/`buildBody`): analyses the ORIGINAL source with
  `positionalInputNames()` and emits `generate(__inputs["a"], __inputs["b"], …)`
  for positional blocks, `generate(__inputs)` for object/destructure/legacy.
  Positional blocks therefore RAN CORRECTLY per-node.
- **Folded path** (`packages/core/src/compile/flow-compiler.ts`, the
  `const … = await __block_x({ … })` call site): ALWAYS built an object literal
  `{ name: value, … }` and passed it as the single argument. A positional block
  `function generate(a, b, c)` got the whole object as `a` and `undefined` for
  the rest — silently wrong. This is the path used for **headless / module /
  distributed-worker** execution (`compileFlow` → `PolymeraseEngine.executeScript`,
  the worker's folded fast path), so several shipped blocks (rom-data, the ARPU/
  BatPU-2/URCL/IRIS assemblers, the worldgen field blocks) were mis-called there.

The compartment executor (`packages/synthase`) calls `fn(inputs, ctx)` and the
folded `generate` is `generate(inputs)` — both pass an inputs OBJECT — so
**object-form `function generate(inputs)` is the canonical convention.**

### The fix (both belt and suspenders)
1. **Structural fix in `flow-compiler.ts`** (covers user-authored blocks too):
   the code-node call site now mirrors the per-node runner. It calls the shared
   `positionalInputNames(node.data.code)`; if positional, it spreads the value
   expressions in declared (contract) order — `generate(<a>, <b>, <c>)`;
   otherwise it emits the object form. Unconnected/unknown params fall through as
   defaults / `undefined`, identical to the per-node lookup. Both paths now agree
   by construction.
2. **Converted all 16 shipped example blocks** in
   `client/src/lib/block/examples.ts` from positional params to canonical
   object-form `function generate(inputs)`, each with standalone
   `type Inputs`/`type Outputs` declarations so `parseBlockSource` derives the
   **identical** contract (guarded by `examples.test.ts`, which compares the
   parser output against the static `EXAMPLE_BLOCK_CONTRACTS` registry —
   50 tests, all green). Bodies destructure or read `inputs.x`.

### Byte-exactness
The ARPU/BatPU-2 `assemble()` cores live in `packages/core/src/asm` and were
**untouched** — only how block SOURCES reference their inputs changed. Re-ran the
byte-exact suites: core `asm/{rom,iris,urcl,kit}.test.ts` and client
`asm/{arpu,batpu2}.test.ts` — all green, unchanged.

### Headless proof
Extended `packages/core/src/compile/headless-exec.test.ts` with a new describe
`headless positional-param block execution (calling-convention fix)` — 3 tests
that fold a POSITIONAL-param block (the historical shape of the shipped blocks)
and run it through the REAL engine, asserting OUTPUT:
- positional params spread in declared order (bytes/base/width → `"0aff01"`,
  the load-bearing assertion: pre-fix this produced wrong output),
- unconnected positional inputs fall back to per-param defaults,
- a single-positional-param block (the assembler shape) runs folded.

### Cleanup (Part 2)
- **Deduped** the two near-identical closure compilers in `flow-compiler.ts`
  (`compileSubgraphClosure` for Group, `compileMapBodyClosure` for Map) into one
  `compileBoundaryClosure(subgraph, boundaryInputs, boundaryOutputs)`; the two
  named wrappers now delegate (they differed ONLY in which boundary-port arrays
  they read).
- **Bundle/Unbundle blank + duplicate field-name guard:** `metaFields()` in
  `flow-compiler.ts` now drops duplicate names (first-wins) in addition to the
  existing blank-name filter — a duplicate bundle key would silently overwrite
  (object-literal last-wins) and a duplicate unbundle output would emit two ports
  with the same handle id. Complemented with a visual guard in `BundleNode.tsx`
  and `UnbundleNode.tsx`: blank/duplicate field inputs render in red with an
  explanatory `title`.
- Verified the **Meta** palette is coherent/complete across `editor/Toolbar.tsx`
  and `ui/CommandPalette.tsx` — both list constant/reroute/bundle/unbundle/
  inspect/group/switch/map/comment/frame with consistent seed config. No change
  needed.
- The meta-node component files are already consistent (memo + displayName +
  `useShallow` + color-coded variants + shared header pattern); no churn applied
  beyond the guard.

### Tests added
- `headless-exec.test.ts`: +3 (positional-param headless proof).
- `flow-compiler.test.ts`: +4 — bundle blank-field drop, bundle duplicate-field
  dedupe (first-wins), nested map-in-map (`[[1,2],[3,4,5]]` → `[[2,4],[6,8,10]]`),
  constant dataType sweep (string/boolean/number/list/object baked + round-tripped
  through an identity block).
- `BundleNode.smoke.test.tsx`: +3 — the ONLY component render test (the repo has
  jsdom + @testing-library/react but no prior `.test.tsx`); renders the node in a
  `<ReactFlowProvider>` and asserts the duplicate/blank guard (red class + title).
  Switch/Map/Group/Constant/Reroute edge cases are covered at the COMPILER level
  in flow-compiler.test.ts (real fold output) — the higher-value layer.

### Test results (all green)
- `packages/core`: `bunx tsc --noEmit` clean; `bunx vitest run` **480 passed**
  (was 473; +7); `rm -rf dist && bun run build` success.
- `client`: `bunx tsc -b` → only the **6 known pre-existing errors** (CodePanel/
  Workbench unused decls, elkjs module, layout `any`), **zero new**.
  `bunx vitest run` → **275 passed** (was 272; +3 smoke).
- `packages/synthase`: `bunx vitest run` → **9 passed** (untouched; confirms the
  compartment `fn(inputs, ctx)` convention is the standardisation target).
- `server`: `bunx vitest run` → **74 passed** (incl. modules.test.ts — folded-flow
  module publishing unaffected by the compiler change).

### Remaining gaps / notes
- **Switch case-removal is count-based, NOT by-id** (`data.caseCount`, ports
  `case0..caseN`). It only removes the LAST case. Converting to by-id removal
  (like Bundle fields) would require renumbering handles `case0..caseN` and
  rewiring edges on every middle-removal — risky, and positional case semantics
  are correct as-is. Left unchanged by design; flagged here rather than touched.
- Component smoke coverage is intentionally minimal (one node). The meta-node
  behaviour that matters (fold correctness, dedup, type derivation) is unit-tested
  at the compiler/parser layer, which is more stable than DOM assertions.

---

## Routing + Tool/Embed modes (2026-06-18)

### What's built
- **Deep-linkable examples.** `/editor?example=<id>` now loads a built-in example
  from `EXAMPLE_FLOWS` and survives refresh / is shareable. "Load example" in
  FlowManager navigates to that URL instead of silently mutating the store.
  Examples stay ephemeral (`flowId` null) so "Save" still creates a new backend flow.
  `/flow/:uuid` saved-flow loading is unchanged.
- **Run-as-tool player.** `FlowRunner` (`/run/:flowId`, plus new `/run?example=<id>`)
  is the read-only player: inputs form → Run → outputs, no canvas. It compiles +
  runs via the same engine as the editor (`compileFlow` fold → `executeScript`
  worker path). Now resolves `example-*` ids locally (synchronous, no fetch) via a
  new `exampleToFlowData()` normalizer that maps the flat example shape into the
  API `jsonContent` shape and lifts inline input config into `data.config`.
- **Embed mode.** New chromeless routes `/embed/:flowId` and `/embed?example=<id>`
  render `<FlowRunner embed />` (no Navbar/grid/Edit link) for `<iframe>` use.
- **Context injection.** postMessage handshake (`flow-embed:ready` →
  `flow-embed:context`) with **origin allowlist** validation, plus a URL-param
  fallback (`?pageUrl&userId&permissions&schematicId&schematicUrl`). Context
  auto-binds to inputs by matching name. Pure logic extracted to
  `client/src/lib/embedContext.ts`.
- **Security:** `user`/`permissions` are treated as UNTRUSTED display hints only —
  no client-side authz gating; real authz goes through the flow's authenticated
  API. Origin allowlist is the trust boundary. Documented in the design doc.

### Logic-tested vs needs-visual-review
- **LOGIC-TESTED** (`embedContext.test.ts`, 22 tests, green): origin allow/deny
  (`self`/empty/`null`), context sanitization, URL-param parse, malformed-message
  rejection, input prefill-by-name. Full suite: 297 passed. tsc: only the 6 known
  pre-existing errors (CodePanel ×2, Workbench ×2, layout.ts ×2), zero new.
- **NEEDS VISUAL REVIEW:** the run-as-tool + embed player *rendering* (input
  widgets for example flows now route through the `config` projection; output
  rendering incl. schematic viewer), the embed chromeless layout, and the
  **postMessage handshake in a real cross-origin iframe** (only the pure parse/
  validate logic is unit-tested — not the live `window.parent` round-trip).

### Schemati-side integration TODO (NOT built here)
- Add the iframe + handshake snippet (copy-paste JS in the design doc §6) to the
  schematic page; post `{ pageUrl, referrer, user, schematic }` on `flow-embed:ready`.
- Add the prod Flow origin (e.g. `flow.schemati.com`) to the embed allowlist.
- Pick which schematic flows are tool-eligible and surface their embed URL.
- Follow-up: wire the ambient `Embed` provider/endowment into core execution
  (deferred — input auto-bind covers the common case; see design doc §4b).

---

## Node error boundaries + robustness (production-safety hardening)

**Motivation.** A single node component that throws during render (e.g. the old
`ConstantNode` `TYPE_META[dataType]` crash, or destructuring/indexing
possibly-`undefined` `data` from a legacy/pasted/programmatic flow) used to
unwind the WHOLE React tree and blank the ENTIRE editor canvas — there was no
error isolation. This section documents the fix.

### Per-node error boundary (the big one)
- New `client/src/components/nodes/NodeErrorBoundary.tsx`:
  - `NodeErrorBoundary` — class component (`getDerivedStateFromError` +
    `componentDidCatch`) that renders a compact, node-shaped FALLBACK card
    ("⚠ Node failed to render — <message>" + node type/id) instead of crashing.
    Logs the error to the console with node id/type.
  - `withNodeBoundary(Component)` — HOC that wraps a node component, forwards all
    `NodeProps`, passes `id`/`type` into the boundary, and preserves a readable
    `displayName` (`withNodeBoundary(<Inner>)`). No ref forwarding needed — React
    Flow doesn't pass refs to node components; inner components keep their own
    `memo()`.
- `client/src/components/nodes/index.ts`: EVERY entry in the `nodeTypes` map is
  now `wrap(<Node>)` — core, I/O, meta-nodes, AND legacy aliases — so the
  boundary applies to all node types.
- **Fallback/edge tradeoff (NEEDS-VISUAL-REVIEW):** the fallback renders a stable
  fixed-min-size box (`minWidth 180`) with ONE generic source + ONE generic
  target `<Handle>` (ids `input`/`output`) so an edge endpoint still has an
  anchor and the layout doesn't collapse. Edges that targeted a *named* handle
  the broken node would have rendered (e.g. a bundle field port) will float to
  the node box — React Flow's default for a missing handle. Acceptable: the node
  is visibly broken and the rest of the graph survives.

### Top-level editor boundary
- New `client/src/components/editor/EditorErrorBoundary.tsx`: catches non-node
  crashes (bad selector, panel, layout call, …) and renders a recoverable error
  screen with a "Reload editor" button instead of a white page.
- `client/src/App.tsx`: the three `<Editor />` routes (`/editor`,
  `/editor/:flowId`, `/flow/:flowId`) are wrapped in `<EditorErrorBoundary>`.

### Robustness audit + guards added per node
Same crash class as `ConstantNode` (already fixed; used as the reference). The
recurring bug is a **present-but-non-array** value passing `?? []` and then
crashing a `.map()`/`.filter()`/`.some()`, plus reading `data.x` when `data`
itself is undefined. Guards added (minimal — defaults/`Array.isArray`/optional
chaining, not rewrites):
- **BundleNode** — `bundleFields` normalised via `Array.isArray` + per-entry
  `{ name: string }` coercion (drops the `.length`/`.map`/`.findIndex` crash on a
  non-array or entries without a string `name`); `data?.label`.
- **UnbundleNode** — same `bundleFields` normalisation; guarded
  `Object.keys(out.fields)` (object-output contract without `fields`);
  `data?.label`.
- **GroupNode** — `groupInputs`/`groupOutputs`/`subgraph.nodes`/`subgraph.edges`
  all `Array.isArray`-guarded (non-array no longer crashes the boundary handle
  `.map()`); `data?.label`.
- **MapNode** — `bodyInputs`/`bodyOutputs`/`subgraph.nodes`/`subgraph.edges`
  `Array.isArray`-guarded; `resultPort` coerced to a string; `data?.label`.
- **SwitchNode** — `caseCount` clamped to a finite positive integer AND capped at
  64 (a NaN/Infinity/huge value can no longer try to render millions of ports and
  freeze the canvas); `data?.label`.
- **CommentNode / FrameNode / InspectNode** — `data?.label` / `data?.width` /
  `data?.height` optional-chaining so an undefined `data` can't crash.
- **RerouteNode** — reads no `data`; already safe, left unchanged.
- **ConstantNode** — already hardened (reference); untouched.
Dynamic-port nodes (Bundle/Unbundle/Switch/Map/Group) specifically now render
safely on empty/undefined config arrays and malformed subgraph/boundary data.

### Tests
- New `client/src/components/nodes/NodeErrorBoundary.test.tsx` (4 tests): a
  throwing child wrapped by `NodeErrorBoundary` renders the fallback and does NOT
  propagate; a non-throwing child renders unchanged; `withNodeBoundary` isolates
  a throwing node to its own fallback; `displayName` is preserved. (Tests the
  boundary directly rather than the real `nodeTypes` map — small + stable.)

### Gates
- `bunx tsc -b` — only the 6 known pre-existing errors (CodePanel ×2,
  Workbench ×2, layout.ts ×2), ZERO new.
- `bunx vitest run` — green: 15 files, 301 tests (incl. the 4 new boundary tests
  and the existing BundleNode smoke test). packages/core untouched (no rebuild).

### Still NEEDS-VISUAL-REVIEW
- Does the per-node fallback card render sensibly in the LIVE canvas (sizing,
  readability, dark-theme contrast)?
- Do edges survive a fallback node visually — i.e. does an edge that pointed at a
  now-missing named handle degrade acceptably (float to the node box) rather than
  disappear or throw?
- Does the top-level `EditorErrorBoundary` reload screen look right end-to-end?

---

## Live-execution unified on compileFlow + trace

**Problem.** The live editor canvas ran a *bespoke per-node engine*
(`Editor.tsx` `handleQuickRun` / `handleIncrementalRun` → `getExecutionOrder` /
`findCodeChains` + a per-code-node `executeScript` loop) that only knew how to
run **code** nodes (and inputs/assets/viewers/outputs/subflows). It had **no
handling for the meta nodes** — `switch`, `map`, `group`, `bundle`, `unbundle`,
`constant`, `reroute`, `inspect` — so on the live canvas they stayed `pending`
and rendered **"No data"**, even though `compileFlow` (used by run-as-tool /
headless / modules / the distributed worker) executes them correctly.

### Phase 1 — `compileFlow` TRACE MODE (`packages/core/src/compile/flow-compiler.ts`)

- New opt-in: `compileFlow(flow, { trace: true })` (back-compat: no options =
  unchanged byte-for-byte; run-as-tool / headless / modules still read the bare
  outputs object).
- In trace mode the generated `generate()` builds a `__trace` object and wraps
  **every value-producing binding** (code / bundle / unbundle / group / switch /
  map; plus inputs / constants / assets as cheap literals; plus reroute/viewer/
  inspect pass-throughs and output nodes as resolved values) in a timed,
  try/catch'd thunk `__trace_run(id, thunk)` that records
  `{ value, ms, status }` keyed by **node id**. A failing node records
  `status:'error' + message` and binds `undefined` (downstream continues — best
  effort, no abort) instead of killing the whole program.
- The program **returns `{ __outputs, __trace }`** in trace mode (bare outputs
  otherwise). `__outputs` is the same outputs object as before.
- **Meta-node correctness:** bundle → its object; unbundle → the bound input
  object; group → the boundary-output map; switch → the *selected* value; map →
  the mapped list; code → its full output map; constant → its literal; reroute →
  the resolved upstream value.
- **Timing caveat (had to change):** SES/secure compartments *tame* both
  `Date.now()` and `performance.now()` (calling them throws). `__now` probes
  each behind try/catch and falls back to `0`, so `ms` may be `0` in the secure
  worker but the trace **values** are always correct. (In practice the live
  worker still gives real-ish timing where the timer isn't tamed.)
- **Subgraphs (group/map bodies) are compiled WITHOUT trace** — their internal
  nodes aren't surfaced on the outer canvas; the group/map node is traced as a
  whole. This keeps the closure shape (`return generate`) intact.
- New exported types: `CompileFlowOptions`, `NodeTraceEntry`, `TracedResult`.

**Logic-tested (load-bearing).** `packages/core/src/compile/flow-trace.test.ts`
runs meta-node flows through the SAME path the worker uses
(`compileFlow{trace}` → `PolymeraseEngine.executeScript`) and asserts the
`__trace` per-node values (switch selecting case1, bundle object, group result,
map list, reroute pass-through), timing keys present, error isolation, and that
`__outputs` still resolves — plus that non-trace mode is unchanged. 7/7 green.
Core: tsc clean, **487 vitest pass**, dist rebuilt.

### Phase 2 — live editor rewire (`client/src/components/editor/Editor.tsx`)

**Scope decision (honesty over a broken editor).** A *full* replacement of the
bespoke engine was deemed too risky to land cleanly in one pass: with
`returnHandles`, the worker only hand-ifies **top-level** result-object
schematics (`storeSchematicsAsHandles` scans `Object.entries(result)`), so live
WASM schematics nested inside `__trace`/`__outputs` would NOT be converted and
would fail `postMessage`. Regressing schematic-producing flows was unacceptable.

**What landed — a SUPPLEMENTARY unified trace pass (`runMetaTracePass`)** that
closes the meta-node gap without touching the rich code/viewer/output/subflow/
schematic-handle handling:

- Collects flow inputs keyed by input-node name (matching compileFlow's
  `__flowInputName`), incl. `file_input.fileData` and all input widget values.
- `compileFlow(flow, { trace:true })` → `executeScript(source, inputs,
  { returnHandles:true })` via the SAME shared worker (`useLocalExecutor`).
- Distributes `__trace` back to the canvas via the SAME store actions
  (`setNodeExecutionStatus` with `ms` for the **Ready/42ms** badges,
  `createSimpleError` for per-node errors). Nested `_schematicHandle`s are
  resolved deeply via `workerClient.getData` (same as the viewer path); output
  shape is `{ ...value, default }` / `{ output, default }` so viewer/inspect/
  output readers find it. Output nodes fill from `__outputs`.
- **Non-regressing guards:** never clobbers a non-meta node the rich engine
  already completed (it may hold resolved live-schematic data); non-cloneable
  trace values (live WASM nested in a meta node) are skipped → node keeps its
  prior state, shows `[live value]` rather than crashing the worker message;
  un-compilable graphs (mid-edit) skip silently.
- **Wiring:** the live-execution trigger (`polymerase:liveExecutionTrigger`) now
  runs `handleIncrementalRun()` **then** `runMetaTracePass()`; `handleQuickRun`
  also calls it (via a ref, since it's declared earlier in render order).

**Preserved:** input collection (file_input/asset/all widget types), output/
file_output display, ExecutionPanel logs, viewer + inspect previews, per-node
error surfacing, manual-vs-live trigger, subflow execution, and the public store
API (only engine internals changed — actually only *added* a pass).

### NEEDS-VISUAL-REVIEW (cannot be unit-tested — interactive)

Phase 1 proves the per-node **values** are correct. The live canvas itself
needs a human check:

1. Open **`example-switch-route`** in live mode → the `routed` output and the
   `route` switch node should show **70** (verified headless: `__outputs.routed
   === 70`, `__trace['sr-switch'].value === 70`).
2. Confirm meta nodes (switch/map/group/bundle/unbundle/constant) now show a
   value instead of "No data" on the live canvas.
3. Confirm **Ready / NNms** badges, viewer/inspect previews, and output-node
   display still work, and that schematic-producing flows still render (handles
   still resolved by the untouched rich path).


## Foundation: nested schematic marshalling + host-clock trace timing

Foundation work to unblock a FULL single-engine swap of the editor onto
`compileFlow(flow,{trace:true})` + the worker. (The Editor.tsx execution-engine
rewire itself is a SEPARATE follow-up — NOT touched here.) Two blockers solved.

### BLOCKER 1 — recursive nested-schematic handle marshalling
WASM `Schematic` objects can't be structured-cloned across `postMessage`. The
old `returnHandles` path only stored TOP-LEVEL result schematics; a folded
`{ __outputs, __trace }` result has schematics nested inside trace values /
output fields / arrays, which broke or got lost.

- **Worker** (`packages/core/src/worker/MessageHandler.ts`): added
  `deepExtractSchematicHandles(value)` — a depth-bounded (≤16), cycle-guarded
  (`WeakSet`) deep walk over objects/arrays that replaces every WASM schematic
  with a transferable `{ _schematicHandle: id }` ref, registering each in
  `workerDataStore` (pinned) so `getData` can resolve it. Wired into
  `handleExecuteScript`: when `returnHandles` is true → use the new
  handle-extract path; when false → **unchanged** `deepSerializeSchematics`
  (inline `SchematicData`) so existing viewers/flows are byte-for-byte preserved.
- **Client** (`packages/core/src/worker/WorkerClient.ts`): added
  `resolveSchematicHandles(value, resolver?)` — the mirror deep-resolver
  (same depth/cycle bounds) that walks a result and resolves every nested
  `{ _schematicHandle }` via `getData` (injectable resolver for tests).

**Existing schematic path preserved:** the top-level `returnHandles` /
`schematicHandles` / `processSchematicsForTransfer` code is untouched. The new
recursive handle path ONLY runs under `returnHandles=true` (the new folded
editor path); the `returnHandles=false` viewer path still inline-serializes
exactly as before. All pre-existing core/client/server schematic tests stay
green.

### BLOCKER 2 — real per-node timing under SES
SES tames `Date.now`/`performance.now` inside the compartment, so trace `ms`
was always 0. Endowed a **host-provided read-only clock**:

- `packages/core/src/providers/standard.ts`: captures a host clock
  (`performance.now`/`Date.now`) BEFORE lockdown and endows it as a frozen,
  read-only `__hostNow(): number` (returns finite elapsed ms; never throws).
  It is a compartment global because the standard provider's `create()` output
  is endowed as `Compartment({ globals })`.
- `packages/core/src/compile/flow-compiler.ts`: the trace runner's `__now`
  probe now PREFERS `typeof __hostNow === "function"` (guarded), then falls back
  to `performance.now` → `Date.now` → `() => 0`. So `ms` is REAL under SES, and
  degrades gracefully (finite, never NaN/throw) when no clock is usable.
- Drift guards updated: `__hostNow` added to `PROVIDER_ENDOWMENT_KEYS.flowlib`
  + a `@internal declare const __hostNow` in `runtime-types.ts`; regenerated
  `generated/flow-runtime.d.ts` (`bun run gen:types`); client `ambient.test.ts`
  allowlists `__hostNow` (internal infra, not author-facing — kept out of the
  Monaco editor types).

### Tested vs NEEDS-VISUAL-REVIEW
- **Tested (hermetic):**
  - `packages/core/src/worker/schematicMarshalling.test.ts` (NEW, 7 tests):
    worker `deepExtractSchematicHandles` emits handle refs for schematics nested
    in objects/arrays/trace values + registers them for `getData`; primitives /
    typed arrays untouched; cycle guard; client `resolveSchematicHandles` deep
    round-trip via the real `workerDataStore`. Mock handles (no WASM).
  - `packages/core/src/compile/flow-trace.test.ts` (EXTENDED, +3 tests):
    with `__hostNow` endowed a non-trivial node's `ms` is finite and `> 0`;
    a throwing/hostile clock degrades gracefully (finite, `ok`, value intact);
    the generated source contains the `__hostNow` probe + the `() => 0` terminal.
- **NEEDS-VISUAL-REVIEW:** end-to-end run of a REAL WASM-schematic flow through
  the live worker yielding a folded `{ __outputs, __trace }` with nested
  schematics and confirming the canvas renders them via the handle path. The
  unit layer proves extract/resolve + timing; the in-browser WASM round-trip
  was not exercised here (hermetic test env, no WASM fixture).

### Verify (re-run, all green together)
- core: `tsc --noEmit` clean; `vitest` 498/498; `rm -rf dist && bun run build` ok.
- client: `tsc -b` = only the 6 known pre-existing errors (zero new);
  `vitest` 301/301.
- server: `vitest` 74/74 (separate worker; shared contract intact). synthase
  `vitest` 9/9 (synthase NOT modified; its pre-existing test-file `tsc` error is
  unrelated to this work).

## Live execution: single-engine swap

The live canvas now runs **one** execution path. The bespoke per-node engine and the supplementary meta-trace pass are gone; everything folds + runs through `compileFlow(flow,{trace:true})`.

### Replaced / removed (in `client/src/components/editor/Editor.tsx`)
- **`findCodeChains`** (≈80 lines) — deleted. Chain batching was already dead (`useChainBatching = false`).
- **`handleQuickRun`** (the ≈600-line topological per-node loop with chain batching, per-code-node `executeScript`, viewer/output handle-fetch) — deleted.
- **`handleIncrementalRun`** (the ≈330-line stale-only variant + `liveValueCacheRef` value cache) — deleted.
- **`runMetaTracePass`** + `runMetaTracePassRef` + `META_TRACE_TYPES` + `resolveHandlesDeep` + `isCloneable` — deleted (superseded by the unified path + `workerClient.resolveSchematicHandles`).
- Now-unused imports/refs removed: `hashExecutionInputs`, `liveValueCacheRef`, `markNodeCached`, `defaultInputsForContract`, `missingRequiredInputs`, `missingInputsMessage`, `BlockContract`.
- Net: Editor.tsx 2452 → 1689 lines.

### New unified engine
- **`runUnifiedFlow({ onlyStale })`** — collect inputs → `compileFlow(...,{trace:true})` → `executeScript(...,{returnHandles:true})` once → distribute `__trace[nodeId]={value,ms,status}` to every node via `setNodeExecutionStatus(completed|error, ms)` (REAL ms) + `setExecutingNodeId`; output/file_output ← `__outputs`. Nested schematic handles deep-resolved via `workerClient.resolveSchematicHandles`.
  - `onlyStale:false` (manual Play / `handleQuickRun`) repaints all.
  - `onlyStale:true` (live/debounced trigger + "Run stale" / `handleIncrementalRun`) repaints only the stale set (`getNodesToExecute(true)`) so fresh schematics aren't re-resolved every keystroke.
- **Pure, unit-tested helpers** extracted to `client/src/lib/tracePlan.ts` (`collectFlowInputs`, `collectOutputNames`, `traceValueToCache`, `flowHasSubflowNodes`) — names mirror compileFlow's `__flowInputName` / output-node derivation exactly. Tests in `client/src/lib/tracePlan.test.ts` (9 tests) incl. a contract test that the derived names match `compileFlow(...).inputs/.outputs`.

### Preserved
Input collection (input/file_input/asset/all widgets), output + file_output display, ExecutionPanel logs, per-node error surfacing, viewer + Inspect previews (read nodeCache, now populated for ALL node types incl. meta nodes), SCHEMATIC rendering (nested-handle path), manual-vs-live triggers, the public flowStore API.

### Subflow shim (the one hybrid)
`compileFlow` does NOT fold the editor's `subflow` node (embedded `flowDefinition`, run via `executeSubflow`). **No example flow uses subflow.** Flows that DO contain a subflow node route through **`runSubflowLegacy`** — a trimmed, documented topological executor (input/file_input/asset/code/viewer/output/file_output/subflow + handle resolution). The common (subflow-free) case never touches it; this is the only remaining non-unified path and exists solely to avoid regressing subflow.

### Graceful fallback (critical)
- `FlowCompileError` (mid-edit graph, dangling edge, cycle, no code node) → logged as `[WARN]`, canvas left intact, run bails. Never blanks.
- `executeScript` throw or `result.success===false` → error surfaced on code nodes + ExecutionPanel; other nodes untouched.

### Verification
- `packages/core`: `tsc --noEmit` clean; `vitest run` = **498 passed** (core untouched, no dist rebuild).
- `client`: `tsc -b` = only the **6 known pre-existing** errors (CodePanel ×2, Workbench ×2, layout ×2), **zero new**; `vitest run` = **310 passed** (incl. 9 new tracePlan tests).

### NEEDS-VISUAL-REVIEW checklist
1. Open `?example=example-switch-route` → output `routed` = **70**; switch node shows its selected value on canvas.
2. A Map / Group example (Julia / quadratic group / bundle examples) → meta nodes show live per-node values (no "No data").
3. A SCHEMATIC flow → renders on the canvas node AND in the viewer (nested-handle resolve).
4. Per-node **ms badges** show real, non-zero timing.
5. Manual **Play** works; **live mode** (edit an input) re-runs and only stale nodes repaint.
6. Intentionally break a flow (delete a code node / dangling edge) → ExecutionPanel shows an error/warning, canvas stays intact (NOT blank).
7. (If you have one) a **subflow** node flow still executes via the legacy shim.

---

## Examples consolidated → ASM→ROM Studio showcase

The 15 overnight scratch examples (the per-meta-node + assembler demos) were **removed** and folded into ONE polished, purposeful showcase. `JULIA_STITCH_FLOW` and `WORLDGEN_FLOW` are untouched.

**Removed flows** (consts + `EXAMPLE_FLOWS` entries deleted from `client/src/lib/exampleFlows.ts`): `ARPU_ASSEMBLER_FLOW`, `CUSTOM_ISA_FLOW`, `BATPU2_ASSEMBLER_FLOW`, `URCL_ASSEMBLER_FLOW`, `IRIS_ASSEMBLER_FLOW`, `ROM_GENERATOR_FLOW`, `OBJECT_BUNDLE_FLOW`, `GROUP_PIPELINE_FLOW`, `SWITCH_SELECT_FLOW`, `MAP_DOUBLE_FLOW`, `CONFIG_BUNDLE_FLOW`, `MAP_AREAS_FLOW`, `GROUP_QUADRATIC_FLOW`, `SWITCH_ROUTE_FLOW`, `ROM_MAP_INSPECT_FLOW` (and their helper sources/contracts). `EXAMPLE_BLOCKS` was left intact — only flows were consolidated.

**Final list:** `EXAMPLE_FLOWS = [JULIA_STITCH_FLOW, WORLDGEN_FLOW, SHOWCASE_FLOW]`.

### The showcase — `SHOWCASE_FLOW` (`example-asm-rom-studio`, "ASM → ROM Studio")
A single assembler→ROM pipeline where every node earns its place (~24 nodes incl. 4 Frames + 2 Comments). The real verified ARPU **fibonacci** program is assembled to 16 machine-code bytes, then those bytes fan out two ways. Four labelled Frames behind their clusters; two sticky-note Comments.

- **Source** (frame): `program` textarea → `arpu-assembler` (→ `bytes`/`words`/`hex`). An **Inspect** ("peek bytes") taps the bytes; a **Reroute** ("bytes") carries the bus rightward into both downstream sections.
- **Config** (frame): three **Constants** for the base (16 / 2) + a `selector`, plus `bitWidth` and `rowWidth` constants. A **Switch** ("ROM base") picks hex vs binary by the selector (selector=0 → base 16). A **Bundle** packs `{base, bitWidth, rowWidth}` into one `config` object edge.
- **Per-byte** (frame): a **Map** ("hex each byte") whose body formats each byte to a 2-char hex string → `hexBytes` list, with an **Inspect** tap.
- **ROM** (frame): a **Group** ("ROM Layout") whose subgraph **Unbundles** `config` and feeds `rom-data` (base → digit string) and `rom-schematic` (bitWidth → Schematic). Group boundary inputs = `bytes` + `bytesSch` + `config`; outputs = `data` (string) + `rom` (schematic). A **viewer** previews the ROM. Two **Outputs**: `romData` (string, via an Inspect "peek digits") and `romPreview` (schematic).

**Meta-nodes demonstrated:** Constant, Switch, Bundle, Unbundle, Group, Map, Reroute, Inspect (+ Input/Output/Viewer and the three ASM/ROM code blocks). Reroute and Inspect are transparent — their outgoing edges keep the upstream `bytes`/`data` handle so the compiler resolves back through them.

### Verification (all green)
- `cd client && bunx tsc -b` → only the 6 known pre-existing errors, zero new.
- `bunx vitest run` → **262/262 pass** (incl. the showcase's fold + exec tests).
- `packages/core` untouched (no rebuild).

The showcase **folds and executes hermetically**. `exampleFlows.test.ts` now:
- asserts the flow-id list is exactly `[example-julia-stitch, example-worldgen, example-asm-rom-studio]`;
- folds `SHOWCASE_FLOW` (no error) and checks the `__sw_/__bundle_/__unbundle_/__group_/__map_` markers + output kinds;
- runs the folded source through the eval shim (the same pattern the prior exec tests used) with the **real** `Asm`/`Rom` providers from `@flow/core`, asserting the PURE outputs:
  - `hexBytes` = `['0a','00','1a','01','2a','06','40','0d','4f','5d','a4','ce','06','08','0e','0e']` (16 words),
  - `romData` = `'0A001A012A06400D4F5DA4CE06080E0E'` (base-16, 2 digits/byte, MSB-first).

**Simplification note:** `rom-schematic` reaches for the WASM `Schematic` global, which a node test can't supply. Rather than drop the schematic node, the test passes a tiny `SchematicStub` so the node executes end-to-end inside the Group **without throwing**; the test only asserts `romPreview` is present (not its value). So the showcase keeps the full Group-wrapped rom-data **and** rom-schematic, and the whole flow folds + the pure data executes. The `rom-data` `bitWidth` is intentionally left unwired (defaults to 0 → 2-digit hex cells) so the base-16 digit string is the clean `0A 00 1A …`; the bundled `bitWidth` drives the schematic, `rowWidth` is bundled for the demo but unconsumed.

### NEEDS-VISUAL-REVIEW
- **Live canvas layout** — positions/Frame sizes were laid out left→right and sectioned to not overlap, but I can't drive the browser headlessly. Open the editor → load "ASM → ROM Studio" and eyeball the four Frames sitting behind their clusters, the two Comments, and the bytes Reroute/bus. (Frames are listed first in the node array so they paint behind; `zIndex` lives in node `data` since `loadFlow` doesn't forward top-level RF props — confirm the frames still render behind in the live canvas, and nudge any node that overlaps a Frame header.)
- **Schematic preview** — the `rom-schematic` → viewer/`romPreview` path needs the real WASM kernel; confirm the ROM preview actually renders a block layout in the live editor (the test only proves it folds + runs through a stub).

## Editor polish: dynamic handles + tidy-preserves-frames + program selector

Three editor-polish fixes (2026-06-18).

### 1. Dynamic-port handles now re-measure (`useUpdateNodeInternals`)
None of the dynamic-port meta-node components told React Flow to re-measure their
handle bounds when the handle set (or node height) changed, so edges connected to
STALE positions. Each now imports `useUpdateNodeInternals` and runs
`useEffect(() => updateNodeInternals(id), [id, updateNodeInternals, <deps>])`:

| Node | File | Dep that triggers re-measure |
|------|------|------------------------------|
| BundleNode | `client/src/components/nodes/BundleNode.tsx` | `fieldsSig` (join of field names) |
| UnbundleNode | `client/src/components/nodes/UnbundleNode.tsx` | `fieldsSig` (join of field names) |
| SwitchNode | `client/src/components/nodes/SwitchNode.tsx` | `caseCount` |
| MapNode | `client/src/components/nodes/MapNode.tsx` | `boundarySig` (`bodyInputs.length:bodyOutputs.length`) + `expanded` |
| GroupNode | `client/src/components/nodes/GroupNode.tsx` | `boundarySig` (`groupInputs.length:groupOutputs.length`) + `expanded` |
| InspectNode | `client/src/components/nodes/InspectNode.tsx` | `id` on mount (custom-positioned handles) |
| RerouteNode | `client/src/components/nodes/RerouteNode.tsx` | `id` on mount (now destructures `id`; handles are negative-offset) |

NEEDS-VISUAL-REVIEW: handle-connection correctness is interactive — add/remove a
Bundle field / a Switch case / expand a Group with edges attached and confirm the
edges stay glued to the right port.

### 2. Tidy layout preserves Frames + Comments
`client/src/lib/layout.ts` used to feed ALL nodes (including `frame`/`comment`) to
ELK, so frames were laid out as ordinary boxes — losing their backdrop role and
scattering their cluster. Now:
- `frame` + `comment` are EXCLUDED from the ELK graph (`isLayoutNode` filter); only
  edges between real nodes participate.
- After ELK, a PURE helper `refitFrames(nodes, laidOutPositions)` (extracted into
  `client/src/lib/frameLayout.ts`, elk-free so it's unit-testable):
  - computes each frame's MEMBER nodes from ORIGINAL geometry (a real node whose
    CENTER lies inside the frame's original bounds);
  - re-bounds each frame around its (now-moved) members + padding, writing
    `position` and `data.width`/`data.height` (where FrameNode reads them) and
    leaving `data.zIndex` untouched (backdrop ordering — `loadFlow` drops top-level
    RF props, so size + zIndex must live in `data`);
  - a frame with NO members is left as-is (object identity preserved);
  - comments are nudged by the average delta of their nearest cluster (frame
    containing them, else global average) so they follow without jumping off-screen.
- Unit test: `client/src/lib/frameLayout.test.ts` — 2-member frame re-bounds after
  members move (asserts containment + zIndex preserved); empty frame untouched; real
  members move to laid-out positions; comment excluded from elk and nudged by cluster.

NEEDS-VISUAL-REVIEW: the resulting on-canvas tidy arrangement is interactive — run
"Tidy / Auto-arrange" on a flow with frames+comments and eyeball that frames still
sit behind their clusters and comments stay near their notes.

### 3. Showcase program selector (`exampleFlows.ts` SHOWCASE_FLOW)
The `example-asm-rom-studio` showcase's Switch only chose ROM base (16 vs 2). Added a
SECOND, more meaningful Switch that picks WHICH ARPU program gets assembled→ROM:
- a `program selector` number Constant (`c-prog-sel`, 0..2) →
- a 3-case `which program` Switch (`sw-prog`) whose cases are:
  - case0 = the existing verified **fibonacci** (`prog` input, 16 bytes),
  - case1 = a **counter loop** (`ASM_ROM_COUNTER`, 9 bytes),
  - case2 = a small **arithmetic** program (`ASM_ROM_ARITH`, 10 bytes),
- Switch `output` → `arpu-assembler.program`.

All three programs were verified to assemble against `@flow/core`'s `Asm.define`/`pack`
(same spec the arpu-assembler block uses). The Source frame was widened to fit the
new nodes; `asm`/`reroute` shifted right.

Exec test (`client/src/lib/exampleFlows.test.ts`): selector=0 still yields the
fibonacci `romData`/`hexBytes` (unchanged 16-byte assertion). Added a second exec test
that clones the flow with `c-prog-sel` = 2 and asserts the **arithmetic** program's
bytes (`0a 07 1a 03 40 1f 40 08 0e 08`, 10 words) and digit string — proving the
Switch selection actually changes what gets assembled. Fold test (Switch/Bundle/
Unbundle/Group/Map markers) still passes.

### Verification
- `bunx vitest run` → 17 files / 267 tests GREEN (incl. new frameLayout test + updated
  showcase fold/exec tests).
- `bunx tsc -b` → only the 6 known pre-existing errors (CodePanel ×2, Workbench ×2,
  layout ×2 from the un-installed `elkjs` type cascade); ZERO new. The pure
  `frameLayout.ts` is fully typed and elk-free, so the geometry logic type-checks
  cleanly on its own.
- `packages/core` untouched.

---

## Editor polish: handle row-anchoring + showcase frame separation

Two VISUAL fixes that CANNOT be unit-tested — they need a live canvas check.

### What changed
1. **Meta-node handles now anchored to their port ROWS (not % of node height).**
   Mirrored CodeNode's pattern: each `<Handle>` lives INSIDE the `relative` DOM
   element of the port it represents (`top: '50%'; translateY(-50%)` relative to
   that row), so the visible dot IS the real handle.
   - `GroupNode` — boundary in/out handles moved into the per-port label rows
     (removed the old `rowY(i,n)` percentage map).
   - `MapNode` / `BundleNode` / `SwitchNode` — single in/out handles moved into
     the fixed-height header row.
   - `UnbundleNode` — object INPUT moved into header (was fixed `top:18px`);
     per-field outputs were already row-anchored.
   - `InspectNode` — input + output moved into header (body grows when a value
     populates, so 50%-of-node drifted).
   - `RerouteNode` — node IS its dot; left as-is, added the resize hook.
   - New shared hook `client/src/hooks/useNodeResizeInternals.ts` attaches a
     ResizeObserver to each node root and calls `updateNodeInternals(id)` on
     height change (skips the priming observation). Complements the existing
     data-driven `updateNodeInternals` effects.

2. **SHOWCASE_FLOW (`exampleFlows.ts`) frames re-laid into 4 non-overlapping
   quadrants.** Source (top-left), Config (bottom-left), Per-byte (top-right),
   ROM (bottom-right), with ~200px gutters. Each frame's authored
   position/width/height was recomputed to wrap ONLY its cluster (48px pad +
   28px header — same math `refitFrames` uses). Verified programmatically: zero
   frame–frame overlaps, zero membership leaks (no node center inside a foreign
   frame), zero node–node overlaps. Comments parked in the gutters. Graph +
   edges UNCHANGED — only positions + frame extents.

### NEEDS A LIVE CANVAS CHECK (not covered by tests)
- Open the editor: edges should land exactly on the visible port dots.
- Grow a node (Inspect value populates / Group or Map expand / add a Bundle/
  Switch field): the dot + edge should stay aligned (ResizeObserver re-measure).
- Open the ASM → ROM Studio showcase: the 4 frames should be visibly separated
  and none should overlap a neighbour or a foreign cluster's nodes.

### Verification (automated portion)
- `bunx tsc -b` → only the 6 known pre-existing errors (CodePanel ×2,
  Workbench ×2, layout ×2); ZERO new.
- `bunx vitest run` → 17 files / 267 tests GREEN (showcase fold/exec +
  frameLayout still pass).
- `packages/core` untouched.

## Tidy layout: hierarchical frame containers (no overlap)

The tidy/auto-arrange action (`layoutWithElk` in `client/src/lib/layout.ts`) now
treats FRAMES as real elk CONTAINERS instead of laying every node out in one flat
graph and re-bounding frames afterward. The flat approach interleaved nodes from
different frames, so the refit frames OVERLAPPED. The new hierarchical layout:

- **Membership** (geometry, pure): a non-frame/non-comment node belongs to a
  frame if its CENTER lies within that frame's current bounds; on overlap the
  SMALLEST (innermost) frame wins. Nodes in no frame are "unframed".
  (`computeMembership` in `frameLayout.ts`.)
- **Graph shape**: `root.children = [one elk container per frame WITH members] +
  [unframed nodes as top-level nodes]`. Each member is laid out INSIDE its frame
  container; elk arranges the containers so they do not overlap.
- **Per-frame container options**: `elk.algorithm=layered`, `elk.direction=<dir>`,
  `elk.padding=[top=64,left=40,bottom=40,right=40]` (big TOP leaves room for the
  frame header label; generous side/bottom = the requested "more padding"),
  `elk.spacing.nodeNode=48`, `elk.layered.spacing.nodeNodeBetweenLayers=90`.
- **Root options**: `elk.algorithm=layered`, `elk.direction=<dir>`,
  `elk.hierarchyHandling=INCLUDE_CHILDREN` (cross-frame edges route across
  containers), `elk.spacing.nodeNode=120` and
  `elk.layered.spacing.nodeNodeBetweenLayers=160` (clear separation BETWEEN
  frames), plus `considerModelOrder=NODES_AND_EDGES` to keep author ordering.
- **Edges**: all edges between layout nodes are added at the ROOT level;
  INCLUDE_CHILDREN lets elk handle them across containers.
- **Position remap** (pure, `applyHierarchicalLayout` in `frameLayout.ts`): elk
  gives container positions relative to root and each child relative to its
  container. A frame container → frame node `position = {container.x,y}`,
  `data.width/height = {container.width,height}` (FrameNode reads size from
  `data` because loadFlow drops top-level RF props; `data.zIndex` preserved).
  Each member's absolute `position = {container.x + child.x, container.y +
  child.y}`. Unframed nodes use their root-relative position directly.
- **Comments** are decorative, excluded from elk, and nudged by the average
  old→new delta of their nearest cluster (member-less frames left untouched).

Tests: `client/src/lib/frameLayout.test.ts` extended (4 → 11) covering
membership (incl. nested), absolute member mapping, non-overlapping padded frame
rects, cross-frame edge endpoints staying in their containers, comment nudge,
and member-less-frame identity — all with synthetic elk-result inputs (elk not
run in tests).

Gates: `bunx tsc -b` = 5 known pre-existing errors (CodePanel ×2, Workbench ×2,
layout.ts elk-module-not-found ×1; the old `layout.ts` implicit-`any` on the
`.map((c)=>...)` was ELIMINATED by the rewrite — no new errors added).
`bunx vitest run` GREEN (17 files / 274 tests). `packages/core` untouched.

**NEEDS-VISUAL-REVIEW**: the on-canvas tidy result has not been eyeballed in the
editor — verify by clicking Tidy in the Flow editor and confirming frames are
laid out as non-overlapping padded containers with members inside.
