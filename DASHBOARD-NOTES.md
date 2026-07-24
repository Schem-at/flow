# Flow Worker Admin Dashboard — Notes (overnight design)

**Deliverable:** `docs/superpowers/specs/2026-06-18-worker-admin-dashboard-design.md`
(repo-root-relative; absolute: `/Users/harrison/Documents/code/schemati/docs/superpowers/specs/2026-06-18-worker-admin-dashboard-design.md`)

Design-only. No app code, editor nodes, flow-compiler.ts, MORNING-REVIEW.md, or WORKER-NOTES.md were touched.

## What it covers
A monitoring + light-control admin surface for Flow Workers (distributed agents that pull Flow jobs, e.g. from tag-transition hooks). Grounded in the real schemati stack first, then designed to be buildable here.

## Key design decisions (grounded in the codebase)
- **Two surfaces, one service layer.** Platform admins → a **Filament page** (`/admin`, sits next to existing SystemHealth/ApiMonitoring widgets). Community admins → a **Folio + Livewire 4 + Flux** page at `/communities/{community}/workers` (mirrors `RolesManager`/`MembersList`). Both call shared `app/Services/Fleet/{FleetQueries,WorkerControls}` so logic is written once.
- **Live updates = `wire:poll`** (5s tables / 3s drawer logs / 30s metrics). That is the app's actual convention (discord-settings.blade `wire:poll.5s`; Filament widgets 30/60s). Reverb is configured but the Echo JS client is commented out — so Reverb is a documented optional v2, not v1.
- **RBAC reuses `App\Enums\CommunityPermission`.** Adds one case `MANAGE_WORKERS`. Authorize in `mount()` (`playerCan(...)` → `abort(403)`) and re-check in every action; ownership enforced via `$community->workers()->findOrFail()`. Token/registration stays admin-only (matches enum's existing note).
- **Heartbeat-derived online/offline** (not the stored status string) via an Eloquent scope + accessor; `HEARTBEAT_TTL` config (~30s, 3 missed beats).
- **Metrics via a rollup table** (`worker_metric_buckets`, filled by a 1-min scheduled job) — charts never scan `worker_jobs`. Live counters cached ~10s so 50 polling tabs hit DB ~once. Jobs table eager-loads flow+worker to kill N+1.
- **Teardown-safe**: only `wire:poll`/Flux/Alpine — no bare `setInterval`/global listeners, so the article-editor 404 class of bug can't occur (per `.livewire4-patterns.md` §8).

## Sections in the spec
Purpose/audience + RBAC · assumed schema (workers/worker_jobs + new rollup) · Workers/Jobs/Metrics/Fleet-health views · controls (drain/disable/requeue/cancel/routing pref/live logs) · data flow & efficient queries · ASCII mockups (Flux dark) for all 4 views + drawers · Livewire 4 component sketches (shell + table island + controls service + Folio page + Filament wrapper) · permissions/pagination/empty+error states · open questions · suggested build order.

## Coordinate with the worker-design doc
- Schema field names are the contract (see spec §2). New: `communities.worker_routing` column, `worker_metric_buckets` table.
- Open questions for the worker side: log transport (Redis list recommended), running-job cancel mechanism, p50/p95 accuracy, routing enforcement point (enqueue vs pull), shared-pool visibility scope.
