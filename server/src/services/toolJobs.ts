/**
 * Tool job store — the executor side of the Laravel <-> executor protocol
 * (remote-tools design §9). One store per process; state lives in memory (the
 * executor runs read-only with a tmpfs, and a restart loses running Workers
 * anyway, so Laravel treats a 404 for a known job as backend_unavailable).
 *
 *   queued -> running -> done | failed | timeout | cancelled
 *
 * Every job runs in a one-shot Bun Worker (or the docker sandbox when that
 * mode is configured) via the injected runner, with a wall-clock deadline,
 * Worker termination on cancel/timeout, and a process-level memory guard
 * (Bun Workers have no per-Worker heap limit — see checkMemory()).
 */
import { readFileSync } from 'node:fs';

export type ToolJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'timeout' | 'cancelled';
export type ToolErrorCode = 'validation' | 'execution_failed' | 'timeout' | 'cancelled' | 'output_too_large' | 'backend_unavailable';

export interface ToolOutputEntry {
  name: string;
  kind: 'schematic' | 'image' | 'text' | 'json';
  format: string;
  filename: string;
  base64: string;
}

export interface ToolRunResult {
  outputs: ToolOutputEntry[];
  /** Back-compat payload for POST /api/execute/tool's `output` field. */
  legacy?: unknown;
}

export class ToolRunError extends Error {
  constructor(public code: ToolErrorCode, message: string) {
    super(message);
    this.name = 'ToolRunError';
  }
}

export interface ToolRunRequest {
  kind: 'tool';
  graph: unknown;
  inputs: Record<string, unknown>;
  /** Engine (soft) timeout in ms. */
  timeout: number;
}

export interface ToolRunnerOptions {
  /** Hard wall-clock deadline for the Worker in ms. */
  timeoutMs: number;
  onProgress: (fraction: number, message?: string) => void;
  registerKill: (kill: () => void) => void;
}

export type ToolRunner = (request: ToolRunRequest, options: ToolRunnerOptions) => Promise<ToolRunResult>;

export interface ToolJobView {
  id: string;
  status: ToolJobStatus;
  progress: number | null;
  message: string | null;
  queued_position: number | null;
  error: { code: ToolErrorCode; message: string } | null;
  outputs: ToolOutputEntry[] | null;
  run_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface Job {
  id: string;
  owner: string;
  runId: string | null;
  status: ToolJobStatus;
  progress: number | null;
  message: string | null;
  error: ToolJobView['error'];
  result: ToolRunResult | null;
  request: ToolRunRequest | null;
  timeoutMs: number;
  created: number;
  started: number | null;
  finished: number | null;
  kill?: () => void;
  /** Set before kill() so the rejection is recorded with the right reason. */
  killReason?: { status: ToolJobStatus; code: ToolErrorCode; message: string };
  waiters: Array<(job: ToolJobView) => void>;
}

export class QueueFullError extends Error {}

const TERMINAL = new Set<ToolJobStatus>(['done', 'failed', 'timeout', 'cancelled']);
export const TOOL_JOB_RETENTION_MS = 60 * 60 * 1000;
/** Budget for Worker start-up (nucleation WASM init) and output encoding on top of the tool timeout. */
export const TOOL_JOB_GRACE_MS = 15_000;
export const MAX_TOOL_TIMEOUT_MS = 300_000;

/**
 * §9 sends `timeout` in seconds (meta.timeout, at most 300); the legacy sync
 * route sent milliseconds. Values up to 300 are seconds, larger ones ms.
 */
export function parseToolTimeoutMs(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 60_000;
  const ms = n <= 300 ? n * 1000 : n;
  return Math.min(MAX_TOOL_TIMEOUT_MS, Math.max(1000, Math.round(ms)));
}

const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The container's cgroup memory limit (v2, then v1), or null outside one. */
export function detectCgroupMemoryLimitMb(): number | null {
  for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const raw = readFileSync(file, 'utf8').trim();
      const bytes = Number(raw);
      if (raw !== 'max' && Number.isFinite(bytes) && bytes > 0 && bytes < 2 ** 50) return Math.floor(bytes / 1024 / 1024);
    } catch { /* not in a cgroup */ }
  }
  return null;
}

export function errorCodeOf(error: unknown): ToolErrorCode {
  const e = error as { code?: unknown; name?: string; message?: string };
  const known: ToolErrorCode[] = ['validation', 'execution_failed', 'timeout', 'cancelled', 'output_too_large', 'backend_unavailable'];
  if (typeof e?.code === 'string' && known.includes(e.code as ToolErrorCode)) return e.code as ToolErrorCode;
  if (e?.name === 'ExecutionTimeoutError') return 'timeout';
  if (e?.name === 'ExecutionCancelledError') return 'cancelled';
  const message = String(e?.message ?? '');
  if (/execution timeout|time limit|hard timeout/i.test(message)) return 'timeout';
  if (/^execution cancelled/i.test(message)) return 'cancelled';
  if (/output limit|exceed(s)? 20 ?MB/i.test(message)) return 'output_too_large';
  if (/capacity exhausted|restarted/i.test(message)) return 'backend_unavailable';
  return 'execution_failed';
}

const STATUS_FOR: Partial<Record<ToolErrorCode, ToolJobStatus>> = { timeout: 'timeout', cancelled: 'cancelled' };

export interface ToolJobStoreOptions {
  runner?: ToolRunner;
  /** Jobs running at once (Workers). */
  concurrency?: number;
  /** Queued + running jobs before POST answers 429. */
  maxActive?: number;
  /** Queued + running jobs per X-Tools-Owner. */
  maxPerOwner?: number;
  retentionMs?: number;
  now?: () => number;
  /** Terminate the youngest job when the process RSS passes this (MB). null disables. */
  memoryLimitMb?: number | null;
  sampleRss?: () => number;
  /** Background GC / memory sampling; tests drive gc()/checkMemory() directly. */
  timers?: boolean;
  /** Worker deadline on top of the tool timeout (start-up + encoding). */
  graceMs?: number;
  /** Observer for every accepted progress update (tests, logging). */
  onProgress?: (id: string, fraction: number, message: string | null) => void;
}

export class ToolJobStore {
  private jobs = new Map<string, Job>();
  private runner: ToolRunner;
  private concurrency: number;
  private maxActive: number;
  private maxPerOwner: number;
  private retentionMs: number;
  private now: () => number;
  private memoryLimitMb: number | null;
  private sampleRss: () => number;
  private intervals: Array<ReturnType<typeof setInterval>> = [];
  private graceMs: number;
  private observe?: ToolJobStoreOptions['onProgress'];

  constructor(options: ToolJobStoreOptions = {}) {
    this.runner = options.runner ?? defaultRunner;
    this.concurrency = options.concurrency ?? env('TOOLS_MAX_CONCURRENCY', 2);
    this.maxActive = options.maxActive ?? env('TOOLS_MAX_ACTIVE_JOBS', 32);
    this.maxPerOwner = options.maxPerOwner ?? env('TOOLS_MAX_JOBS_PER_OWNER', 8);
    this.retentionMs = options.retentionMs ?? TOOL_JOB_RETENTION_MS;
    this.now = options.now ?? Date.now;
    const detected = detectCgroupMemoryLimitMb();
    this.memoryLimitMb = options.memoryLimitMb !== undefined ? options.memoryLimitMb
      : process.env.TOOLS_MEMORY_LIMIT_MB ? env('TOOLS_MEMORY_LIMIT_MB', 0) || null
      : detected ? Math.floor(detected * 0.85) : null;
    this.sampleRss = options.sampleRss ?? (() => process.memoryUsage.rss());
    this.graceMs = options.graceMs ?? TOOL_JOB_GRACE_MS;
    this.observe = options.onProgress;
    if (options.timers) {
      this.intervals.push(setInterval(() => this.gc(), 60_000));
      if (this.memoryLimitMb) this.intervals.push(setInterval(() => this.checkMemory(), 1000));
      for (const i of this.intervals) (i as { unref?: () => void }).unref?.();
    }
  }

  submit(owner: string, input: { graph: unknown; inputs?: Record<string, unknown>; timeoutMs: number; runId?: string | null }) {
    this.gc();
    const active = [...this.jobs.values()].filter(j => !TERMINAL.has(j.status));
    if (active.length >= this.maxActive) throw new QueueFullError('The tool executor is busy. Retry shortly.');
    if (active.filter(j => j.owner === owner).length >= this.maxPerOwner) throw new QueueFullError('Too many tool runs at once for this account. Wait for one to finish.');
    const id = crypto.randomUUID();
    const job: Job = {
      id, owner, runId: input.runId ?? null, status: 'queued', progress: null, message: null, error: null, result: null,
      request: { kind: 'tool', graph: input.graph, inputs: input.inputs ?? {}, timeout: input.timeoutMs },
      timeoutMs: input.timeoutMs, created: this.now(), started: null, finished: null, waiters: [],
    };
    this.jobs.set(id, job);
    const queued_position = this.position(job);
    this.drain();
    return { id, status: 'queued' as const, queued_position };
  }

  get(id: string, owner?: string): ToolJobView | null {
    const job = this.jobs.get(id);
    return job && (owner === undefined || job.owner === owner) ? this.view(job) : null;
  }

  /** Cancels a queued/running job (terminating its Worker); a finished job is returned unchanged. */
  cancel(id: string, owner?: string): ToolJobView | null {
    const job = this.jobs.get(id);
    if (!job || (owner !== undefined && job.owner !== owner)) return null;
    if (job.status === 'queued') this.finish(job, 'cancelled', null, { code: 'cancelled', message: 'The run was cancelled.' });
    else if (job.status === 'running') this.abort(job, { status: 'cancelled', code: 'cancelled', message: 'The run was cancelled.' });
    return this.view(job);
  }

  wait(id: string): Promise<ToolJobView> {
    const job = this.jobs.get(id);
    if (!job) return Promise.reject(new Error('Job not found.'));
    if (TERMINAL.has(job.status)) return Promise.resolve(this.view(job));
    return new Promise(resolve => job.waiters.push(resolve));
  }

  legacyOutput(id: string): unknown {
    return this.jobs.get(id)?.result?.legacy ?? null;
  }

  gc() {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, job] of this.jobs) if (job.finished !== null && job.finished < cutoff) this.jobs.delete(id);
  }

  /**
   * Bun Workers share the process heap and Bun has no per-Worker resourceLimits,
   * so the guard watches process RSS and terminates the youngest running job
   * (the likeliest culprit, and the cheapest to lose) when it passes the limit.
   * The container's mem_limit remains the hard backstop.
   */
  checkMemory() {
    if (!this.memoryLimitMb) return;
    if (this.sampleRss() / 1024 / 1024 <= this.memoryLimitMb) return;
    const running = [...this.jobs.values()].filter(j => j.status === 'running' && !j.killReason);
    const youngest = running.sort((a, b) => (b.started ?? 0) - (a.started ?? 0))[0];
    if (youngest) this.abort(youngest, { status: 'failed', code: 'execution_failed', message: 'The tool ran out of memory. Try smaller inputs.' });
  }

  dispose() {
    for (const i of this.intervals) clearInterval(i);
    for (const job of this.jobs.values()) if (job.status === 'running') this.abort(job, { status: 'cancelled', code: 'cancelled', message: 'The executor is shutting down.' });
  }

  private position(job: Job): number | null {
    if (job.status !== 'queued') return null;
    // Map iteration is insertion (= submission) order, which is also run order.
    let n = 1;
    for (const other of this.jobs.values()) {
      if (other === job) return n;
      if (other.status === 'queued') n++;
    }
    return n;
  }

  private view(job: Job): ToolJobView {
    const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
    return {
      id: job.id, status: job.status, progress: job.progress, message: job.message,
      queued_position: this.position(job), error: job.error,
      outputs: job.status === 'done' ? job.result?.outputs ?? [] : null,
      run_id: job.runId, created_at: iso(job.created)!, started_at: iso(job.started), finished_at: iso(job.finished),
    };
  }

  private abort(job: Job, reason: NonNullable<Job['killReason']>) {
    job.killReason = reason;
    const kill = job.kill;
    // Record the outcome now (the runner's rejection arrives later and is ignored), then terminate.
    this.finish(job, reason.status, null, { code: reason.code, message: reason.message });
    kill?.();
  }

  private finish(job: Job, status: ToolJobStatus, result: ToolRunResult | null, error: Job['error']) {
    if (TERMINAL.has(job.status)) return;
    job.status = status;
    job.result = result;
    job.error = error;
    job.request = null;
    job.kill = undefined;
    job.finished = this.now();
    if (status === 'done') { job.progress = 1; job.message = job.message ?? 'Done'; }
    const view = this.view(job);
    for (const resolve of job.waiters.splice(0)) resolve(view);
    queueMicrotask(() => this.drain());
  }

  private drain() {
    let running = [...this.jobs.values()].filter(j => j.status === 'running').length;
    for (const job of this.jobs.values()) {
      if (running >= this.concurrency) return;
      if (job.status !== 'queued' || !job.request) continue;
      running++;
      this.start(job);
    }
  }

  private start(job: Job) {
    const request = job.request!;
    job.status = 'running';
    job.started = this.now();
    job.progress = 0;
    job.message = 'Starting';
    let settled = false;
    this.runner(request, {
      timeoutMs: job.timeoutMs + this.graceMs,
      onProgress: (fraction, message) => {
        if (settled || job.status !== 'running' || !Number.isFinite(fraction)) return;
        job.progress = Math.max(job.progress ?? 0, Math.min(0.99, Math.max(0, fraction)));
        if (message) job.message = message;
        this.observe?.(job.id, job.progress, job.message);
      },
      registerKill: (kill) => { job.kill = kill; if (job.killReason) kill(); },
    }).then(
      (result) => { settled = true; this.finish(job, 'done', result, null); },
      (error) => {
        settled = true;
        if (job.killReason) return this.finish(job, job.killReason.status, null, { code: job.killReason.code, message: job.killReason.message });
        const code = errorCodeOf(error);
        this.finish(job, STATUS_FOR[code] ?? 'failed', null, { code, message: String((error as Error)?.message || 'The tool failed.') });
      },
    );
  }
}

/** Default runner: a one-shot execution Worker (or the docker sandbox outside isolated mode). */
const defaultRunner: ToolRunner = async (request, options) => {
  const { runInExecutionWorker } = await import('./workerExecutor.js');
  return runInExecutionWorker<ToolRunResult>(request, {
    timeoutMs: options.timeoutMs,
    registerKill: options.registerKill,
    onEvent: (event) => {
      if (event.event !== 'progress') return;
      const p = event.payload as { fraction?: number; message?: string };
      if (typeof p.fraction === 'number') options.onProgress(p.fraction, p.message);
    },
  });
};

let shared: ToolJobStore | undefined;
export function toolJobStore(): ToolJobStore {
  return (shared ??= new ToolJobStore({ timers: true }));
}
