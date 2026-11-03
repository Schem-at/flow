import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { ToolJobStore, parseToolTimeoutMs, ToolRunError, type ToolRunner } from '../src/services/toolJobs';
import { createToolJobsRouter } from '../src/routes/tool-jobs';

const graph = { nodes: [{ id: 'out', type: 'output', data: { label: 'schematic' } }], edges: [], metadata: { tool: { timeout: 60, runtime: 'any' } } };
const outputs = [{ name: 'result', kind: 'json' as const, format: 'json', filename: 'result.json', base64: btoa('{}') }];

/** A runner whose jobs finish only when the test says so. */
function controllable() {
  const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; progress: (f: number, m?: string) => void; killed: boolean }>();
  let seq = 0;
  const runner: ToolRunner = (request, options) => new Promise((resolve, reject) => {
    const key = String(request.inputs?.key ?? ++seq);
    const entry = { resolve, reject, progress: options.onProgress, killed: false };
    pending.set(key, entry);
    options.registerKill(() => { entry.killed = true; reject(new ToolRunError('cancelled', 'Execution cancelled')); });
  });
  return { runner, pending };
}

const tick = () => new Promise(r => setTimeout(r, 5));
const TOKEN = 'test-service-token';
let envBackup: Record<string, string | undefined>;
beforeAll(() => {
  envBackup = { e: process.env.TOOLS_BACKEND_ENABLED, t: process.env.TOOLS_SERVICE_TOKEN };
  process.env.TOOLS_BACKEND_ENABLED = 'true';
  process.env.TOOLS_SERVICE_TOKEN = TOKEN;
});
afterAll(() => {
  if (envBackup.e === undefined) delete process.env.TOOLS_BACKEND_ENABLED; else process.env.TOOLS_BACKEND_ENABLED = envBackup.e;
  if (envBackup.t === undefined) delete process.env.TOOLS_SERVICE_TOKEN; else process.env.TOOLS_SERVICE_TOKEN = envBackup.t;
});

function app(store: ToolJobStore) {
  return new Hono().route('/api/tool-jobs', createToolJobsRouter(() => store));
}
const headers = (owner = 'user:1') => ({ 'Content-Type': 'application/json', 'X-Tools-Service-Token': TOKEN, 'X-Tools-Owner': owner });
const post = (a: Hono, body: unknown, owner?: string) => a.request('/api/tool-jobs', { method: 'POST', headers: headers(owner), body: JSON.stringify(body) });
const get = (a: Hono, id: string, owner?: string) => a.request(`/api/tool-jobs/${id}`, { headers: headers(owner) });
const del = (a: Hono, id: string, owner?: string) => a.request(`/api/tool-jobs/${id}`, { method: 'DELETE', headers: headers(owner) });

describe('timeout units', () => {
  test('section 9 sends seconds; legacy callers send milliseconds', () => {
    expect(parseToolTimeoutMs(120)).toBe(120_000);
    expect(parseToolTimeoutMs(30_000)).toBe(30_000);
    expect(parseToolTimeoutMs(undefined)).toBe(60_000);
    expect(parseToolTimeoutMs(9_999_999)).toBe(300_000);
    expect(parseToolTimeoutMs(0)).toBe(60_000);
  });
});

describe('POST/GET/DELETE /api/tool-jobs', () => {
  test('requires the service token and an owner', async () => {
    const store = new ToolJobStore({ runner: controllable().runner });
    const a = app(store);
    expect((await a.request('/api/tool-jobs', { method: 'POST', body: '{}' })).status).toBe(401);
    const noOwner = await a.request('/api/tool-jobs', { method: 'POST', headers: { 'X-Tools-Service-Token': TOKEN }, body: JSON.stringify({ graph }) });
    expect(noOwner.status).toBe(422);
    const noGraph = await post(a, { inputs: {} });
    expect(noGraph.status).toBe(422);
    expect((await noGraph.json()).error.code).toBe('validation');
    store.dispose();
  });

  test('refuses browser-only tools', async () => {
    const store = new ToolJobStore({ runner: controllable().runner });
    const res = await post(app(store), { graph: { ...graph, metadata: { tool: { timeout: 60, runtime: 'browser' } } } });
    expect(res.status).toBe(422);
    store.dispose();
  });

  test('queues, reports progress, and returns outputs only when done', async () => {
    const { runner, pending } = controllable();
    const store = new ToolJobStore({ runner, concurrency: 1 });
    const a = app(store);
    const first = await post(a, { graph, inputs: { key: 'a' }, timeout: 120, run_id: 'run-1' });
    expect(first.status).toBe(202);
    const created = await first.json();
    expect(created).toEqual({ id: expect.any(String), status: 'queued', queued_position: 1 });
    const second = await (await post(a, { graph, inputs: { key: 'b' } }, 'user:2')).json();
    // The first job started immediately, so the second is next in line.
    expect(second.queued_position).toBe(1);
    const third = await (await post(a, { graph, inputs: { key: 'c' } }, 'user:3')).json();
    expect(third.queued_position).toBe(2);
    await del(a, third.id, 'user:3');
    await tick();

    let job = await (await get(a, created.id)).json();
    expect(job).toMatchObject({ id: created.id, status: 'running', queued_position: null, error: null, outputs: null, run_id: 'run-1' });
    expect(job.progress).toBe(0);
    expect((await (await get(a, second.id, 'user:2')).json()).queued_position).toBe(1);

    pending.get('a')!.progress(0.4, 'Placing blocks');
    job = await (await get(a, created.id)).json();
    expect(job).toMatchObject({ progress: 0.4, message: 'Placing blocks' });
    pending.get('a')!.progress(0.2, 'Backwards');
    expect((await (await get(a, created.id)).json()).progress).toBe(0.4);

    pending.get('a')!.resolve({ outputs });
    await tick();
    job = await (await get(a, created.id)).json();
    expect(job).toMatchObject({ status: 'done', progress: 1, error: null, outputs, queued_position: null });
    expect(job.finished_at).toEqual(expect.any(String));
    await tick();
    expect((await (await get(a, second.id, 'user:2')).json()).status).toBe('running');
    pending.get('b')!.resolve({ outputs });
    store.dispose();
  });

  test('jobs are private to their owner', async () => {
    const store = new ToolJobStore({ runner: controllable().runner });
    const a = app(store);
    const { id } = await (await post(a, { graph })).json();
    expect((await get(a, id, 'user:9')).status).toBe(404);
    expect((await del(a, id, 'user:9')).status).toBe(404);
    store.dispose();
  });

  test('DELETE terminates a running job and cancels a queued one', async () => {
    const { runner, pending } = controllable();
    const store = new ToolJobStore({ runner, concurrency: 1 });
    const a = app(store);
    const running = await (await post(a, { graph, inputs: { key: 'r' } })).json();
    const queued = await (await post(a, { graph, inputs: { key: 'q' } })).json();
    await tick();
    const q = await (await del(a, queued.id)).json();
    expect(q).toMatchObject({ status: 'cancelled', queued_position: null });
    const cancelled = await (await del(a, running.id)).json();
    expect(pending.get('r')!.killed).toBe(true);
    expect(cancelled).toMatchObject({ status: 'cancelled', error: { code: 'cancelled', message: expect.any(String) }, outputs: null });
    await tick();
    expect(pending.has('q')).toBe(false);
    // Cancelling a finished job returns it unchanged.
    expect((await (await del(a, running.id)).json()).status).toBe('cancelled');
    store.dispose();
  });

  test('maps runner failures to the 8.5 error codes and statuses', async () => {
    const { runner, pending } = controllable();
    const store = new ToolJobStore({ runner, concurrency: 4 });
    const a = app(store);
    const ids: Record<string, string> = {};
    for (const key of ['v', 't', 'x', 'o']) ids[key] = (await (await post(a, { graph, inputs: { key } }, `user:${key}`)).json()).id;
    await tick();
    pending.get('v')!.reject(new ToolRunError('validation', 'Width is outside the allowed range.'));
    pending.get('t')!.reject(new ToolRunError('timeout', 'Script execution timeout after 100ms'));
    pending.get('x')!.reject(new Error('boom'));
    pending.get('o')!.reject(new ToolRunError('output_too_large', 'Outputs exceed 20 MB.'));
    await tick();
    const status = async (k: string) => (await (await get(a, ids[k], `user:${k}`)).json());
    expect(await status('v')).toMatchObject({ status: 'failed', error: { code: 'validation', message: 'Width is outside the allowed range.' } });
    expect(await status('t')).toMatchObject({ status: 'timeout', error: { code: 'timeout' } });
    expect(await status('x')).toMatchObject({ status: 'failed', error: { code: 'execution_failed', message: 'boom' } });
    expect(await status('o')).toMatchObject({ status: 'failed', error: { code: 'output_too_large' } });
    store.dispose();
  });

  test('429 when the owner or the whole executor is at capacity', async () => {
    const store = new ToolJobStore({ runner: controllable().runner, concurrency: 1, maxActive: 3, maxPerOwner: 2 });
    const a = app(store);
    expect((await post(a, { graph }, 'user:1')).status).toBe(202);
    expect((await post(a, { graph }, 'user:1')).status).toBe(202);
    const owner = await post(a, { graph }, 'user:1');
    expect(owner.status).toBe(429);
    expect(owner.headers.get('Retry-After')).toBeTruthy();
    expect((await post(a, { graph }, 'user:2')).status).toBe(202);
    expect((await post(a, { graph }, 'user:3')).status).toBe(429);
    store.dispose();
  });

  test('finished jobs are kept for an hour, then collected', async () => {
    let now = 1_000_000;
    const { runner, pending } = controllable();
    const store = new ToolJobStore({ runner, now: () => now });
    const a = app(store);
    const { id } = await (await post(a, { graph, inputs: { key: 'g' } })).json();
    await tick();
    pending.get('g')!.resolve({ outputs });
    await tick();
    now += 59 * 60_000;
    store.gc();
    expect((await get(a, id)).status).toBe(200);
    now += 2 * 60_000;
    store.gc();
    expect((await get(a, id)).status).toBe(404);
    store.dispose();
  });

  test('the memory guard terminates the youngest running job', async () => {
    let rss = 100 * 1024 * 1024;
    const { runner, pending } = controllable();
    let now = 0;
    const store = new ToolJobStore({ runner, concurrency: 2, memoryLimitMb: 500, sampleRss: () => rss, now: () => now });
    const a = app(store);
    const older = (await (await post(a, { graph, inputs: { key: 'old' } }, 'user:1')).json()).id;
    await tick(); now += 1000;
    const younger = (await (await post(a, { graph, inputs: { key: 'young' } }, 'user:2')).json()).id;
    await tick();
    store.checkMemory();
    expect(pending.get('young')!.killed).toBe(false);
    rss = 600 * 1024 * 1024;
    store.checkMemory();
    await tick();
    expect(pending.get('young')!.killed).toBe(true);
    expect(pending.get('old')!.killed).toBe(false);
    expect(await (await get(a, younger, 'user:2')).json()).toMatchObject({ status: 'failed', error: { code: 'execution_failed', message: expect.stringMatching(/memory/i) } });
    expect((await (await get(a, older, 'user:1')).json()).status).toBe('running');
    store.dispose();
  });

  test('wait() resolves when the job settles (used by the sync route)', async () => {
    const { runner, pending } = controllable();
    const store = new ToolJobStore({ runner });
    const { id } = store.submit('sync', { graph, inputs: { key: 'w' }, timeoutMs: 1000 });
    const waiting = store.wait(id);
    await tick();
    pending.get('w')!.resolve({ outputs, legacy: { base64: 'x', format: 'schem' } });
    const job = await waiting;
    expect(job.status).toBe('done');
    expect(store.legacyOutput(id)).toEqual({ base64: 'x', format: 'schem' });
    store.dispose();
  });
});

describe('request body limits (16 MB decoded per file ≈ 21.3 MB base64 + JSON)', () => {
  const big = (mb: number) => 'A'.repeat(mb * 1024 * 1024);

  test('POST /api/tool-jobs accepts a 26 MB body', async () => {
    const store = new ToolJobStore({ runner: controllable().runner });
    const res = await post(app(store), { graph, inputs: { file: { base64: big(26), filename: 'x.schem' } } });
    expect(res.status).toBe(202);
    store.dispose();
  });

  test('POST /api/tool-jobs refuses bodies over 32 MB with 413', async () => {
    const store = new ToolJobStore({ runner: controllable().runner });
    const res = await post(app(store), { graph, inputs: { file: { base64: big(33) } } });
    expect(res.status).toBe(413);
    store.dispose();
  });

  test('POST /api/execute/tool accepts a 26 MB body through the real app', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    process.env.DATABASE_PATH ??= `${mkdtempSync(`${tmpdir()}/flow-db-`)}/test.db`;
    const { app: server } = await import('../src/index');
    // No graph: the body got through the size limit and was rejected by validation instead.
    const res = await server.request('/api/execute/tool', { method: 'POST', headers: headers(), body: JSON.stringify({ pad: big(26) }) });
    expect(res.status).toBe(422);
    const tooBig = await server.request('/api/execute/tool', { method: 'POST', headers: headers(), body: JSON.stringify({ pad: big(33) }) });
    expect(tooBig.status).toBe(413);
  });
});
