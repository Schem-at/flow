# @schemati/flow-worker (PROTOTYPE)

> ⚠️ **PROTOTYPE / DESIGN ARTIFACT — NOT WIRED INTO ANY BUILD.**
> This directory is a runnable *sketch* accompanying the design doc at
> [`docs/superpowers/specs/2026-06-18-flow-worker-design.md`](../../docs/superpowers/specs/2026-06-18-flow-worker-design.md).
> The schemati-side endpoints (`/api/v1/workers/*`) it calls **do not exist yet**.
> Nothing here is imported by `flow/server` or `flow/packages`.

## What this is

A **distributed Flow Worker**: an agent a community installs on **their own
hardware** to execute schemati Flow jobs (primarily **tag-transition flow
hooks**) on their machine instead of schemati's servers.

It reuses schemati's **existing** headless execution path verbatim —
`runInExecutionWorker` from
[`flow/server/src/services/workerExecutor.ts`](../server/src/services/workerExecutor.ts),
which spawns a one-shot, SES-isolated, hard-killable Bun worker running
`@flow/core`'s `PolymeraseEngine`. So a remote community worker and schemati's
own pool have **identical** execution semantics — there is no second engine.

## The loop

```
register → heartbeat → (long-poll) claim → execute headless → submit result
```

See design doc §3 (job lifecycle) and §4 (protocol / message shapes).

## Run (once the server side exists)

```bash
SCHEMATI_URL=https://schemati.io \
ENROLLMENT_TOKEN=wenr_xxxxxxxx \
CONCURRENCY=4 \
WORKER_NAME=eu-box-1 \
bun run worker.ts
```

Or via Docker (image not yet published):

```bash
docker run -d --restart=unless-stopped --memory=2g --cpus=2 \
  -e SCHEMATI_URL=https://schemati.io \
  -e ENROLLMENT_TOKEN=wenr_xxxxxxxx \
  -e CONCURRENCY=4 -e WORKER_NAME=eu-box-1 \
  ghcr.io/schemati/flow-worker:latest
```

## Files

| File | What |
|---|---|
| `worker.ts` | The agent: register/heartbeat/claim/execute/result + graceful drain. PROTOTYPE. |
| `README.md` | This file. |

## What's missing before this runs for real

- Schemati side: `WorkerController` + `/api/v1/workers/*` routes, `worker.enroll`
  / `worker.auth` middleware, `workers` + `worker_jobs` tables, `FlowHookDispatcher`,
  and the one-line hook in `TagTransitionService::applyTransition()` (design §9).
- Persisted worker state (workerId/token reuse across restarts).
- Result signing + canonical output hashing for verification (design §6.3).
- Packaging as `@schemati/flow-worker` (re-export `@flow/core/worker` instead of
  the relative import into `flow/server`).
