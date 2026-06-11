# Flow

Visual, node-based editor for building and running Minecraft schematic scripts.

Bun + Turborepo monorepo. Self-contained: the sandboxed JS execution engine
(`@flow/synthase`) and the isomorphic core (`@flow/core`) live in `packages/`.

## Layout

```
client/            React + Vite editor UI
server/            Hono + Bun backend
shared/            Shared types/utilities
packages/core      @flow/core   — isomorphic schematic execution engine
packages/synthase  @flow/synthase — sandboxed JS execution engine
```

## Develop

```bash
bun install
bun run dev          # turbo dev --filter=client
bun run build        # turbo build (all workspaces)
bun run test         # turbo test
```

## Use as a submodule of schemati

This repo is consumed by [`schemati`](https://github.com/Schem-at) as a git submodule
mounted at `schemati/flow`. The `deploy` script builds the client and copies it into
schemati's public dir:

```bash
bun run deploy       # turbo build && cp -r client/dist/ ../public/flow/
```

> **Note:** `deploy` only resolves correctly when this repo sits inside `schemati`
> (i.e. as the submodule). A standalone clone has no `../public/flow/` target — that is
> expected; `deploy` is a schemati-context operation. Use `bun run build` for standalone work.

## Known issues

- `client` currently has pre-existing TypeScript errors (`tsc -b`) carried over from active
  in-progress work — notably a `moduleRef` field used in the UI that is not yet present on
  `@flow/core`'s node-data type, plus some unused-import lint errors. `bun run build` will
  fail on the client until these are reconciled. The other workspaces build cleanly.
