/**
 * @schemati/flow-worker — PROTOTYPE worker agent.
 *
 * ⚠️  PROTOTYPE / DESIGN ARTIFACT — NOT WIRED INTO ANY BUILD.
 *     Companion design: docs/superpowers/specs/2026-06-18-flow-worker-design.md
 *
 * A community installs this on their own hardware. It:
 *   register → heartbeat → (long-poll) claim → execute headless → submit result
 *
 * It deliberately reuses the EXACT execution path schemati runs server-side:
 *   `runInExecutionWorker` from flow/server/src/services/workerExecutor.ts,
 * which spawns a one-shot, SES-isolated, hard-killable Bun worker running
 * `@flow/core`'s PolymeraseEngine. So a remote worker and the schemati pool
 * have identical execution semantics — there is no second engine to maintain.
 *
 * The schemati endpoints it calls (/api/v1/workers/*) are DESIGN-only and do
 * not exist yet. See §4 of the design doc for the message shapes.
 *
 * Run (once the server-side exists):
 *   bun run worker.ts  (with env: SCHEMATI_URL, ENROLLMENT_TOKEN, CONCURRENCY, WORKER_NAME)
 */

// NOTE: relative import into the existing flow server package. In a real
// package this would be `import { runInExecutionWorker } from '@flow/core/worker'`
// or a thin re-export. Kept relative here to show it reuses the real code.
import {
  runInExecutionWorker,
  EXECUTION_WORKER_GRACE_MS,
  type FlowWorkerResult,
} from '../server/src/services/workerExecutor.js';

const AGENT_VERSION = '0.1.0';
const ENGINE_VERSION = '@flow/core@0.1.0';
const CAPABILITIES = ['flow', 'schem', 'nucleation-wasm'];

interface Config {
  schematiUrl: string;
  enrollmentToken: string;
  concurrency: number;
  name: string;
  stateDir: string;
}

interface WorkerState {
  workerId: string;
  workerToken: string;
  heartbeatMs: number;
  claimMs: number;
}

// A claimed job as returned by POST /workers/claim (see design §4.3).
interface ClaimedJob {
  jobId: string;
  attempt: number;
  leaseTtlMs: number;
  priority: number;
  flow: {
    id: string;
    version: string;
    data?: unknown; // FlowData graph
    folded?: { source: string; hash: string; nodeOrder: string[] };
    timeoutMs: number;
  };
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  envelope?: { alg: string; sig: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadConfig(): Config {
  const env = process.env;
  const schematiUrl = env.SCHEMATI_URL;
  const enrollmentToken = env.ENROLLMENT_TOKEN;
  if (!schematiUrl) throw new Error('SCHEMATI_URL is required');
  return {
    schematiUrl: schematiUrl.replace(/\/$/, ''),
    enrollmentToken: enrollmentToken ?? '',
    concurrency: Number(env.CONCURRENCY ?? 1),
    name: env.WORKER_NAME ?? `worker-${process.pid}`,
    stateDir: env.WORKER_STATE_DIR ?? './.flow-worker',
  };
}

const authHeaders = (s: WorkerState) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${s.workerToken}`,
});

// ── register ──────────────────────────────────────────────────────────────
async function register(cfg: Config): Promise<WorkerState> {
  const res = await fetch(`${cfg.schematiUrl}/api/v1/workers/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.enrollmentToken}`,
    },
    body: JSON.stringify({
      name: cfg.name,
      agentVersion: AGENT_VERSION,
      engineVersion: ENGINE_VERSION,
      capabilities: CAPABILITIES,
      maxConcurrency: cfg.concurrency,
    }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const j: any = await res.json();
  return {
    workerId: j.workerId,
    workerToken: j.workerToken,
    heartbeatMs: j.heartbeatIntervalMs ?? 15000,
    claimMs: j.claimLongPollMs ?? 25000,
  };
}

// In a real agent: persist {workerId, workerToken} under stateDir and reuse on
// restart so we don't re-enroll. Omitted for brevity in this prototype.
async function loadOrRegister(cfg: Config): Promise<WorkerState> {
  return register(cfg);
}

// ── heartbeat (best-effort; the server-side lease reaper is the safety net) ──
async function heartbeat(cfg: Config, s: WorkerState, freeSlots: number) {
  try {
    await fetch(`${cfg.schematiUrl}/api/v1/workers/heartbeat`, {
      method: 'POST',
      headers: authHeaders(s),
      body: JSON.stringify({
        status: freeSlots > 0 ? 'idle' : 'busy',
        freeSlots,
        activeJobs: cfg.concurrency - freeSlots,
        agentVersion: AGENT_VERSION,
        engineVersion: ENGINE_VERSION,
      }),
    });
  } catch {
    /* best-effort */
  }
}

// ── execute (IDENTICAL engine to schemati's server) ──────────────────────────
async function executeJob(cfg: Config, s: WorkerState, job: ClaimedJob): Promise<FlowWorkerResult> {
  return runInExecutionWorker<FlowWorkerResult>(
    {
      kind: 'flow',
      flow: job.flow.data as any,
      timeout: job.flow.timeoutMs,
      folded: job.flow.folded,
      inputs: job.inputs,
    },
    {
      timeoutMs: job.flow.timeoutMs + EXECUTION_WORKER_GRACE_MS,
      onEvent: (event) => {
        // Best-effort progress streaming. Fire-and-forget.
        postEvent(cfg, s, job.jobId, event).catch(() => {});
      },
    }
  );
}

async function postEvent(cfg: Config, s: WorkerState, jobId: string, event: unknown) {
  await fetch(`${cfg.schematiUrl}/api/v1/workers/jobs/${jobId}/events`, {
    method: 'POST',
    headers: authHeaders(s),
    body: JSON.stringify(event),
  });
}

async function submitResult(cfg: Config, s: WorkerState, job: ClaimedJob, r: FlowWorkerResult) {
  await fetch(`${cfg.schematiUrl}/api/v1/workers/result`, {
    method: 'POST',
    headers: authHeaders(s),
    body: JSON.stringify({
      jobId: job.jobId,
      attempt: job.attempt,
      status: r.status === 'completed' ? 'succeeded' : r.status,
      executionTimeMs: r.endTime ? r.endTime - r.startTime : null,
      engineVersion: ENGINE_VERSION,
      outputs: r.outputs, // already base64 (schem/binary) or value
      resultHash: hashOutputs(r.outputs),
      logs: [],
    }),
  });
}

async function submitFailure(cfg: Config, s: WorkerState, job: ClaimedJob, err: Error) {
  await fetch(`${cfg.schematiUrl}/api/v1/workers/result`, {
    method: 'POST',
    headers: authHeaders(s),
    body: JSON.stringify({
      jobId: job.jobId,
      attempt: job.attempt,
      status: err.name === 'ExecutionTimeoutError' ? 'timeout' : 'worker_crash',
      error: err.message,
      engineVersion: ENGINE_VERSION,
    }),
  }).catch(() => {});
}

// Placeholder: in production, hash a canonicalized form of the outputs so the
// server can compare against a verification re-run (design §6.3).
function hashOutputs(outputs: FlowWorkerResult['outputs']): string {
  const canon = JSON.stringify(outputs ?? []);
  // Bun/Node global crypto; cheap non-crypto placeholder for the sketch.
  let h = 0;
  for (let i = 0; i < canon.length; i++) h = (Math.imul(31, h) + canon.charCodeAt(i)) | 0;
  return `sketch:${(h >>> 0).toString(16)}`;
}

// ── control loop: long-poll claim → execute → result ─────────────────────────
async function controlLoop(cfg: Config, s: WorkerState) {
  let active = 0;

  setInterval(() => heartbeat(cfg, s, cfg.concurrency - active), s.heartbeatMs);

  // graceful drain on SIGTERM/SIGINT
  let draining = false;
  const drain = () => {
    draining = true;
    fetch(`${cfg.schematiUrl}/api/v1/workers/drain`, { method: 'POST', headers: authHeaders(s) }).catch(
      () => {}
    );
  };
  process.on('SIGTERM', drain);
  process.on('SIGINT', drain);

  while (true) {
    if (draining && active === 0) process.exit(0);
    const free = cfg.concurrency - active;
    if (draining || free <= 0) {
      await sleep(250);
      continue;
    }

    let res: Response;
    try {
      res = await fetch(`${cfg.schematiUrl}/api/v1/workers/claim`, {
        method: 'POST',
        headers: authHeaders(s),
        body: JSON.stringify({ capabilities: CAPABILITIES, freeSlots: free, max: 1 }),
      });
    } catch {
      await sleep(2000);
      continue;
    }

    if (res.status === 204) continue; // long-poll returned empty; re-poll
    if (!res.ok) {
      await sleep(2000);
      continue;
    }

    const { jobs } = (await res.json()) as { jobs: ClaimedJob[] };
    for (const job of jobs ?? []) {
      active++;
      executeJob(cfg, s, job)
        .then((r) => submitResult(cfg, s, job, r))
        .catch((err) => submitFailure(cfg, s, job, err as Error))
        .finally(() => {
          active--;
        });
    }
  }
}

async function main() {
  const cfg = loadConfig();
  console.log(`[flow-worker] starting "${cfg.name}" → ${cfg.schematiUrl} (concurrency=${cfg.concurrency})`);
  const state = await loadOrRegister(cfg);
  console.log(`[flow-worker] registered as ${state.workerId}`);
  await controlLoop(cfg, state);
}

main().catch((err) => {
  console.error('[flow-worker] fatal:', err);
  process.exit(1);
});
