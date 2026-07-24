# Flow Worker — overnight notes (2026-06-18)

Owner of this file: the Flow-Worker design agent. (I did **not** touch
`MORNING-REVIEW.md` — that's another agent's.)

## What I produced

**Design doc (the deliverable):**
`docs/superpowers/specs/2026-06-18-flow-worker-design.md` — full engineering
design for a distributed "Flow Worker": an agent a community installs on their
own hardware to run schemati Flow jobs (esp. tag-transition flow hooks). Covers
all 10 requested sections: use cases/goals/non-goals, architecture (+ASCII
diagram), job lifecycle (retry/timeout/idempotency), protocol (register/
heartbeat/claim/result with JSON shapes + new `routes/api.php` entries), data
model (`workers` + `worker_jobs` migration sketch), security (untrusted flow
code + semi-trusted worker → result validation/trust levels/re-run verification),
install & ops (`bunx`/Docker/drain/auto-update), failover & routing
(community-first then shared pool), inline prototype sketches, and open
questions / phased rollout.

**Prototype skeleton (clearly marked, NOT wired in):**
- `flow/worker-agent/worker.ts` — runnable Bun agent: register → heartbeat →
  long-poll claim → execute headless → submit result, with graceful drain. It
  reuses the REAL execution path (`runInExecutionWorker` from
  `flow/server/src/services/workerExecutor.ts`) so semantics match production.
- `flow/worker-agent/README.md` — what it is, how to run, what's missing.

## Design-only vs prototype

| Piece | Status |
|---|---|
| Whole design doc | **Design** (markdown, the priority deliverable) |
| `flow/worker-agent/worker.ts` | **Prototype sketch** — compiles conceptually, reuses real `runInExecutionWorker`, but calls server endpoints that don't exist yet. Not imported by any build. |
| `/api/v1/workers/*` routes, `WorkerController`, `worker.enroll`/`worker.auth` middleware | **Design only** (sketched in doc §4/§9, not implemented) |
| `workers` + `worker_jobs` migrations | **Design only** (migration sketch in doc §5) |
| `FlowHookDispatcher` + the hook seam in `TagTransitionService::applyTransition()` | **Design only** (sketch in doc §9; the seam is identified at the exact post-commit point) |

## Key grounding facts (verified in the codebase)

- Headless execution already exists and is reusable as-is:
  `flow/server/src/services/workerExecutor.ts` (`runInExecutionWorker`, one-shot
  killable Bun worker) + `flow/server/src/worker/execution.worker.ts` (the
  `{kind:'flow', flow, timeout, folded, inputs}` → `FlowWorkerResult` protocol)
  + `@flow/core` (`PolymeraseEngine`, SES). A worker is this minus the HTTP server.
- The tag-transition hook seam is `TagTransitionService::applyTransition()`,
  right after the DB transaction + activity log + `notifyAuthors`. One added
  dispatcher call — everything else is additive.
- Per-community token infra already exists (`Community::tokens()`/
  `activeTokens()`), and the JWT + `ensure_valid_jwt` middleware pattern in
  `routes/api.php` is what the worker auth extends.

## I did NOT

- Commit anything (left dirty for review).
- Modify editor node files, `flow-compiler.ts`, or the nodes registry.
- Touch `MORNING-REVIEW.md`.

## Suggested next step

Phase 0/1 from the doc: extract the agent as `@schemati/flow-worker` pointed at
schemati's own hardware (trust=trusted shared pool), add `workers`/`worker_jobs`
+ the `FlowHookDispatcher` + the one-line hook — so tag transitions can trigger
async flows on the pool before any community-worker exposure.
