# Flow — Block System v2 + Workbench: Implementation Spec

**Status:** Ready to build. This is a clean-slate redesign of the code-block unit, its
type system, execution, and the workbench UI. **There is no migration to preserve** — the
old `export const io = {…}` + `export default function` format is dropped entirely.

**Audience:** the implementing model. The codebase is a Bun + Turborepo monorepo
(`client/`, `server/`, `shared/`, `packages/core` = `@flow/core`, `packages/synthase` =
`@flow/synthase`). Read the "Current code map" section for exact entry points.

---

## 1. Goal

Replace the fragile, regex-parsed code-block format with a **type-driven block system**:

- A block is a single self-contained TypeScript source file. The **types are the contract**
  and **drive the entire UI** (input widgets + output viewers). The body is plain JS.
- Run blocks **safely** (arbitrary user code), **fast**, and **in both the browser and the
  backend** from the same engine.
- **nucleation (WASM) must run** in both environments, with a **clean, version-pluggable
  injection** layer.
- Workers must be **killable**.
- Ship a **fully integrated workbench** with clean UX whose components are **reused by the
  node-based editor** (the workbench is the single-node editing experience).

Build order follows the owner's priorities: **(1) nucleation runs under the new contract →
(2) speed → (3) safety/kill → (4) node-editor integration.**

---

## 2. The block authoring model

A block is **one TypeScript source file** — the single source of truth, exportable/shareable
as-is. The editor *enhances* it (projects UI from it); it does not own a separate
representation.

```ts
// ─── Types = the node contract (drive the whole UI) ───────────────
type Material =
  | 'minecraft:white_concrete'
  | 'minecraft:gray_concrete'
  | 'minecraft:redstone_block';

type Layer = {
  schematic: Schematic;                 // domain type → picker (input) / 3D viewer (output)
  offset: Slider<{ min: 0; max: 64 }>;  // widget lives IN the type
};

type Inputs = {
  layers: Layer[];                      // list of objects → repeatable rows
  spacing: Slider<{ min: 0; max: 16; default: 1 }>;
  material: Material;                   // union → dropdown
};

type Outputs = {
  result: Schematic;                    // → 3D viewer
};

// ─── Helpers allowed; `generate` is the entry that gets called ────
function stack(a, b, dy) { /* … */ }

function generate(inputs) {
  const result = new Schematic();       // ambient — no import, no context arg
  // … plain JS body …
  return { result };
}
```

Rules:

- **Entry:** exactly one `function generate(inputs) { return outputs }`. No `export default`,
  no `export const io`. Any number of helper functions/consts may also exist in the module.
- **Ambient globals:** `Schematic` and the rest of the runtime context are **in scope
  without import or a context parameter**, for `generate` *and* all helpers.
- **Types erased at runtime:** the body runs as plain JS. Authors never need a TS toolchain.
- **`Inputs` / `Outputs`** are the contract. `Inputs` → the input form; `Outputs` → the
  output viewers.

---

## 3. The type system

### 3.1 Canonical descriptor (serializable)

Every type resolves to a plain-JSON **discriminated union** (`FlowType`) — serializable so it
crosses the worker boundary, persists, and drives UI uniformly. Define in `@flow/core`
(e.g. `packages/core/src/types/flow-type.ts`):

```ts
type FlowType =
  | { kind: 'number';  min?: number; max?: number; step?: number; default?: number; widget?: 'input' | 'slider' }
  | { kind: 'string';  default?: string; multiline?: boolean }
  | { kind: 'boolean'; default?: boolean }
  | { kind: 'enum';    options: Array<string | number>; default?: string | number }
  | { kind: 'block';   default?: string }        // domain: a minecraft block id
  | { kind: 'schematic' }                          // domain: nucleation Schematic
  | { kind: 'image' }                              // domain
  | { kind: 'vec3';    default?: [number, number, number] }
  | { kind: 'list';    of: FlowType; default?: unknown[] }
  | { kind: 'object';  fields: Record<string, FlowType> }
```

The set is **extensible** — new domain kinds are added in one place (the registry, §3.3).
Composition is unlimited: `list`/`object` nest arbitrarily.

### 3.2 TS → descriptor mapping (the parser)

A parser reads `Inputs`/`Outputs` (and referenced aliases + widget generics) from the source
and produces `FlowType` trees:

| TS type | FlowType |
|---|---|
| `number` | `{ kind: 'number' }` |
| `Slider<{min;max;step;default}>` | `{ kind:'number', widget:'slider', … }` |
| `string` | `{ kind: 'string' }` |
| string-literal union `'a' \| 'b'` | `{ kind:'enum', options:['a','b'] }` |
| `boolean` | `{ kind: 'boolean' }` |
| `Schematic` / `Block` / `Image` | `{ kind:'schematic' }` / `{kind:'block'}` / `{kind:'image'}` |
| `T[]` / `Array<T>` | `{ kind:'list', of: map(T) }` |
| `{ a: A; b: B }` (object/alias) | `{ kind:'object', fields:{ a: map(A), b: map(B) } }` |

- **Widget-in-type helpers** (`Slider<…>`, optionally `Textarea`, `Color`, …) are TS generic
  aliases declared in an **ambient `.d.ts`** the editor ships (also gives Monaco
  autocomplete). They carry UI metadata as type-literal generic args.
- **Defaults:** prefer the type itself (`Slider<{default}>`); top-level scalars *may* also use
  `generate`'s default params; nested defaults live in the type. If unspecified, the
  registry's per-kind default applies.
- **Parser implementation:** use the TypeScript compiler API (lazy-loaded — see §6.4). The
  parser is needed **only in the editor** to build UI, **not** in the execution path.

### 3.3 The registry (one place per type)

A single registry maps `kind → behaviour`, so adding a type wires up its input widget **and**
output viewer **and** validation at once:

```ts
registerType('schematic', {
  inputWidget: SchematicPicker,     // React component (input)
  outputViewer: SchematicViewer,    // React component (output) — wraps schematic-renderer
  validate: (v) => /* … */,
  // serialize/deserialize for the data value if needed
});
```

- `list` renders its element widget/viewer N times (add/remove rows → gallery of viewers).
- `object` renders a group of sub-fields.
- Unknown/`any` falls back to a JSON editor (input) / JSON tree (output).

This registry is the answer to **"output viewers for each type"** and **"unlimited
composition"** — the UI builder simply recurses over the `FlowType` tree.

---

## 4. Execution engine

### 4.1 Synthase becomes a pure executor

Strip all contract/IO concerns out of `@flow/synthase`. It must no longer require or parse
`export const io` / `export default` (`packages/synthase/src/script-validator.ts:79-88,
370-402` — remove those requirements). Synthase keeps its real value: **sandbox, resource
limits, caching**. Demote the regex blocklist to *lint hints*, not a security control.

### 4.2 Compile pipeline (in `@flow/core`, isomorphic)

One module (e.g. `packages/core/src/compile/`) turns block source → runnable JS, used by
**both** the browser worker and the backend:

1. **Strip types** with **sucrase** (pure-JS, fast, isomorphic — no WASM/native binary). Do
   *not* typecheck.
2. **Wrap** the stripped source so synthase's existing `default(inputs, context)` convention
   still works and globals are ambient in `generate` + helpers:

   ```js
   export default async function (__inputs, __ctx) {
     const { Schematic, Block, Vec, Logger, Noise /* …all endowments */ } = __ctx;
     /* ── stripped user source injected here (helpers + generate) ── */
     return await generate(__inputs);
   }
   ```

   This needs no `globalThis` pollution and no concurrency races (context is an argument).

3. Hand the wrapped JS string to synthase to execute.

Type-stripping in the execution path; TS-type *parsing* (§3.2) stays in the editor only.

### 4.3 Two environments, one engine

Both paths already funnel through `@flow/core` → `SynthaseService`
(`packages/core/src/services/SynthaseService.ts`): the browser via
`packages/core/src/worker/MessageHandler.ts`, the backend via
`server/src/.../Engine.ts` + `server/src/routes/execute.ts`. Put the compile step and the
context assembly in `@flow/core` so **both inherit it**. The backend must run user code in a
**killable** context (Node `worker_threads` / subprocess), never on the main server thread.

---

## 5. Nucleation integration (primary requirement)

nucleation already runs and is isomorphic; this section makes the injection **clean and
version-pluggable**.

### 5.1 Current facts (grounding)

- Init is explicit: `await import('nucleation')` → `await nucleation.default()` →
  `nucleation.SchematicWrapper` is `Schematic` (`packages/core/src/.../schematic.ts:39-46`,
  `contextProviders.ts:65-73`).
- Loading is environment-split inside the package: browser via
  `new URL('./nucleation_bg.wasm', import.meta.url)` + `vite-plugin-wasm` +
  `optimizeDeps.exclude:['nucleation']` (`client/vite.config.ts`); Node via `fs.readFileSync`.
- Single-threaded at the wrapper level; needs `WebAssembly`, ES-module context, COOP/COEP
  (already set in `client/vite.config.ts`). Current version **0.2.13** (just bumped from
  0.1.x — verify runtime API at integration time).

### 5.2 Required: a pluggable provider abstraction

Replace the ad-hoc inline nucleation load with a small **provider registry** so adding a new
nucleation version (or a new domain library) is a one-file change:

```ts
interface RuntimeProvider {
  name: string;                       // e.g. 'nucleation'
  version: string;                    // e.g. '0.2.13'
  /** Called once per worker; returns the endowments to inject (e.g. { Schematic, … }). */
  create(env: RuntimeEnv): Promise<Record<string, unknown>>;
}
```

- A `nucleationProvider` encapsulates the WASM init and exposes `{ Schematic, SchematicBuilder,
  … }`. Swapping versions = swap this provider's import/loader; **nothing else changes**.
- A `ProviderRegistry` assembles all providers (nucleation + pure-JS helpers: `Vec`, `Noise`,
  `Logger`, `Calculator`, `Easing`, `Pathfinding`, `Progress`) into the context object.
- **Init once per worker, cache it**, then endow the cached objects into each execution. Keep
  nucleation init in **trusted scope** (outside the sandbox).
- The provider must be **isomorphic** (works in browser worker + Node). Keep env-branching
  inside the provider, not scattered in callers.

**Acceptance:** adding `nucleationProvider@0.3.x` (or a second domain library) is a single new
provider module + one registry line; `generate` authors and the engine are untouched.

---

## 6. Workers, performance & kill

### 6.1 Keep what's already fast

- **One persistent worker**, reused (`useLocalExecutor.ts:26-31`, `WorkerClient.ts`).
- **Resident WASM objects + handles:** `WorkerDataStore` keeps `Schematic` objects in the
  worker; the main thread gets lightweight `DataHandle`s; bytes serialize only on demand
  (`WorkerDataStore.ts:107-141`, `returnHandles`). Make this the **default** path.
- **Subflows stay in-worker:** `executeSubflow` passes WASM references node→node via a `Map`,
  serializing only at final output (`MessageHandler.ts:329-456`). Preserve this affinity.

### 6.2 Add

- **Zero-copy transfer:** when bytes cross the boundary, use **Transferable** ArrayBuffers
  (`postMessage(msg, [buffer])`). Today it's a full structured-clone copy
  (`browser.worker.ts:14`). Big win for large schematics.
- **Serialize cache:** cache serialized bytes per handle until the object mutates/releases
  (`getData()` re-serializes every call today).
- **Worker pool + affinity (optional, later):** parallelism across independent runs; route a
  flow to one worker so intermediates stay resident. Note: a WASM `Schematic` is bound to one
  worker's memory and **cannot cross workers without serializing** — design around affinity.

### 6.3 Kill / cancel (required)

- Cooperative cancel (`CANCEL_EXECUTION`) does **not** stop a tight loop. Robust kill =
  **`worker.terminate()` + respawn** (browser) and **`worker_thread.terminate()` /
  subprocess kill** (backend).
- Maintain a small set of terminable workers; on **timeout** or **user cancel**, terminate and
  respawn a fresh worker. Surface a **Cancel** control in the UI and a hard **timeout** in the
  engine. Resource limits (`resource-monitor.ts`, `execution-limits.ts`) stay as a backstop.

### 6.4 Note

The TypeScript type parser (§3.2) is heavy — **lazy-load it in the editor only**. The worker's
execution path needs only sucrase (small) + synthase, so keep the worker bundle light.

---

## 7. Security / sandbox

Threat model: blocks are authored by some users and **run by others** (and on the **backend**),
so user code is untrusted. The current regex blocklist is **not** a real boundary.

- **Primary:** run `generate` inside an **SES Compartment** (Agoric `ses`: `lockdown()` +
  `Compartment`), isomorphic. The Compartment's only endowments are the assembled context
  (§5.2) — so inside the box, `Schematic`/`Vec`/… exist and **nothing else does** (no `fetch`,
  no `globalThis` authority). This collapses the sandbox into the ambient-context design.
- **nucleation stays outside the sandbox** (pre-init in trusted scope); only the resulting
  `Schematic` class is endowed inward. (This is why SES/endowment is chosen over QuickJS-WASM —
  bridging nucleation's WASM through a WASM interpreter is impractical.)
- **Harden endowments:** audit that `Schematic`/nucleation (and any provider) expose **no path
  to ambient authority** (network/fs). A leak there defeats the sandbox.
- **DoS / runaway:** SES cannot interrupt an infinite loop in-thread → rely on the **killable
  worker** (§6.3) + resource limits for hard timeouts.
- Demote the synthase regex blocklist to lint hints.

---

## 8. Workbench UI (fully integrated, reused by the node editor)

The workbench is the **single-block editing experience**. Build its pieces as **reusable
components** so the node editor mounts the *same* surfaces when editing/inspecting a node.

Route already exists at `/workbench` (`client/src/App.tsx`, current files:
`components/Workbench.tsx`, `hooks/useScriptRunner.ts`, `lib/codeBlock.ts`). Rebuild it around:

**Default layout = no raw types on screen.** Out of the box the workbench shows: the
**visual `<ContractBuilder>`** for defining inputs/outputs, the **`<BlockEditor>`** (body logic
only), the live **`<InputForm>`**, and **`<OutputView>`**. The `type Inputs/Outputs`
declarations are **never shown as code by default** — they are authored entirely through the
UI. **Viewing/editing them as code is strictly opt-in** (a toggle that reveals the full source
including the type declarations). Beginners can build a complete block without ever seeing a
type annotation.

- **`<ContractBuilder>`** — the **primary, default** way to define inputs and outputs: a
  **visual** builder (add field → name it → pick a type from the registry → set
  widget/constraints/default → nest for `list`/`object`). It is the surface a user interacts
  with first; the underlying `Inputs`/`Outputs` types are generated from it and kept hidden.
- **`<BlockEditor>`** — Monaco for the **body only** (`generate` + helpers). By default it does
  **not** display the `type Inputs/Outputs` declarations (those live in the ContractBuilder);
  the generated ambient `.d.ts` is fed in invisibly so `inputs.*` and `Schematic` still
  autocomplete/typecheck.
- **Opt-in "Code" view** — a toggle that reveals/edits the **full `.ts` source**, including the
  `Inputs`/`Outputs` type declarations, for power users. Editing there round-trips back into
  the builder (generate↔reparse, graceful on parse failure). **The single `.ts` file is always
  canonical**; the ContractBuilder is a projection of it, and the Code view is the same file
  shown raw.
- **`<InputForm>`** — generated from the `Inputs` `FlowType`, recursing for `list`/`object`
  (add/remove rows, grouped fields). Distinct from `<ContractBuilder>` (which *defines* the
  contract; the form *fills in values* to run).
- **`<OutputView>`** — renders each output via its registered viewer (schematic 3D, image,
  list→gallery, object→tree, tabular→table, primitives). Uses `schematic-renderer` **1.4.5**.
- **Run / Cancel** controls + **logs** panel.

UX bar: clean, minimal, fast iteration (edit → run → preview). Keep components decoupled from
`flowStore`/React-Flow so they drop straight into the node editor later. The node editor's
expanded-node view == `<BlockEditor>` + `<ContractBuilder>`; its ports == the block's
`Inputs`/`Outputs` `FlowType`; its inline form == `<InputForm>`; its node preview ==
`<OutputView>`.

---

## 9. Toy examples (ship these as runnable blocks)

Provide each in the new contract. They exercise generative *and* analytic directions,
composition, domain types, and viewers. (`Noise`, `Vec`, etc. come from providers; nucleation
`Schematic` API per the installed version.)

### 9.1 Redstone bus (smoke test — already exists)
`Inputs { length: number; material: Block }` → `Outputs { schematic: Schematic }`. Lays
redstone wire + repeaters along X.

### 9.2 Parametric terrain
```ts
type Inputs = {
  width:  Slider<{ min: 8; max: 256; default: 64 }>;
  depth:  Slider<{ min: 8; max: 256; default: 64 }>;
  amplitude: Slider<{ min: 1; max: 64; default: 16 }>;
  scale:  Slider<{ min: 0.01; max: 0.2; step: 0.01; default: 0.05 }>;
  seed:   number;
  surface: Block;        // e.g. minecraft:grass_block
};
type Outputs = { terrain: Schematic };
function generate(inputs) { /* sample Noise(seed) over width×depth, set columns up to height */ }
```

### 9.3 Parametric building
```ts
type Inputs = {
  width:  Slider<{ min: 4; max: 64; default: 12 }>;
  depth:  Slider<{ min: 4; max: 64; default: 10 }>;
  floors: Slider<{ min: 1; max: 32; default: 4 }>;
  wall:   Block;
  glass:  Block;
  roof:   'flat' | 'gable' | 'pyramid';
};
type Outputs = { building: Schematic };
```

### 9.4 Build analysis (the other direction)
```ts
type Inputs = { schematic: Schematic };
type Outputs = {
  dimensions:  Vec3;                                   // grouped readout
  blockCounts: Array<{ block: Block; count: number }>; // → table
  heatmap:     Image;                                  // top-down density → image viewer
};
function generate(inputs) { /* iterate blocks, tally, render heatmap */ }
```

These demonstrate: `Schematic` as **input** and **output**, `list`-of-`object`, `enum`
dropdowns, `Slider`, `Vec3`, `Image`, and table/gallery viewers.

---

## 10. Current code map (where things live)

- **Execution:** `packages/synthase/src/synthase.ts` (Blob+`import()`,
  `defaultFunction(inputs, context)` ≈ line 139; entry extraction ≈ 684);
  `script-validator.ts` (io/default requirement — remove); `resource-monitor.ts`,
  `execution-limits.ts` (limits).
- **Core:** `packages/core/src/services/SynthaseService.ts`; `worker/MessageHandler.ts`,
  `worker/WorkerClient.ts`, `worker/WorkerDataStore.ts`, `worker/contextProviders.ts`,
  `worker/browser.worker.ts`; nucleation init in `…/schematic.ts`; types in
  `packages/core/src/types/index.ts` (+ new `flow-type.ts`).
- **Backend:** `server/src/routes/execute.ts`, `server/src/.../Engine.ts`.
- **Client:** `App.tsx` (routes), `components/Workbench.tsx`, `hooks/useScriptRunner.ts`,
  `lib/codeBlock.ts` (current fragile io parse — **replace**), `components/others/SchematicRenderer.tsx`,
  `components/nodes/InputNode.tsx` (widget rendering to generalize),
  `components/editor/ExecutionPanel.tsx`.
- **Config:** `client/vite.config.ts` (COOP/COEP, `vite-plugin-wasm`, env-driven HMR/proxy).
- **Versions:** nucleation `0.2.13`, schematic-renderer `1.4.5`.
- **UUID note:** use the existing `lib/uuid.ts` helper (insecure-context safe), not
  `crypto.randomUUID` directly.

---

## 11. Phased plan & acceptance criteria

**Phase 1 — Foundation (nucleation under the new contract).**
- Compile pipeline (sucrase strip + `generate` wrap + ambient context). Synthase accepts it.
- Pluggable nucleation provider (§5.2); init once, endow `Schematic`.
- Workbench runs the bus + terrain blocks end-to-end, schematic renders.
- ✅ *Accept:* `generate(inputs)` with ambient `Schematic` runs in the browser worker and
  produces a rendered schematic; no `export default`/`io` anywhere.

**Phase 2 — Type system + viewers + workbench UX.**
- `FlowType` + TS→descriptor parser + registry; `<InputForm>`, `<OutputView>`,
  `<ContractBuilder>`, `<BlockEditor>`; all four toy examples run with generated forms/viewers.
- ✅ *Accept:* a `list`-of-`object` input (terrain layers / analysis table) renders, runs, and
  previews; "edit as code" round-trips the contract.

**Phase 3 — Safety + kill + backend.**
- SES sandbox with endowments; killable workers (terminate + respawn) on timeout/cancel;
  backend execution in a killable thread/subprocess via the same `@flow/core` engine.
- ✅ *Accept:* an infinite-loop block is killed by timeout and via a Cancel button; a block
  cannot reach `fetch`/network inside the sandbox; the same block runs identically on the
  backend `/api/.../run` path.

**Phase 4 — Node-editor integration.**
- The node editor reuses `<BlockEditor>`/`<ContractBuilder>`/`<InputForm>`/`<OutputView>`;
  node ports derive from the block's `Inputs`/`Outputs` `FlowType`; edges respect type
  compatibility (the registry knows kinds).
- ✅ *Accept:* a block authored in the workbench appears as a node with correctly typed ports
  and the same input/preview surfaces.

---

## 12. Non-negotiables (summary)

1. nucleation runs in **browser + backend**, behind a **version-pluggable** provider.
2. Block = single `.ts` file, `generate(inputs)` entry, ambient `Schematic`, types-as-contract.
3. Types **drive the UI**; unlimited composition; per-type viewers.
4. Workers are **killable**; execution is **sandboxed** (SES endowments); nucleation pre-init
   in trusted scope.
5. Clean cutover — **no legacy format, no migration.**
6. Workbench components are **reused by the node editor**.
7. Inputs/outputs are defined through a **visual UI by default**; the raw type **code view is
   opt-in** (hidden until toggled). A user can author a full block without seeing a type.
