/**
 * End to end through the §9 protocol: POST /api/tool-jobs -> poll GET until
 * terminal, with the REAL one-shot Bun Worker path (TOOLS_ISOLATED_JOB=1, the
 * production mode) and the real official graphs.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { ToolJobStore } from '../src/services/toolJobs';
import { createToolJobsRouter } from '../src/routes/tool-jobs';

const TOKEN = 'e2e-token';
const saved: Record<string, string | undefined> = {};
const events = new Map<string, Array<{ fraction: number; message: string | null }>>();
let store: ToolJobStore;
let app: Hono;
let skinServer: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  for (const k of ['TOOLS_BACKEND_ENABLED', 'TOOLS_SERVICE_TOKEN', 'TOOLS_ISOLATED_JOB', 'SCHEMATI_URL']) saved[k] = process.env[k];
  const skin = await readFile(new URL('../../../tests/fixtures/tools/skin.png', import.meta.url));
  skinServer = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (req) => new URL(req.url).pathname.endsWith('/nobody') ? new Response('{}', { status: 404 }) : Response.json({ skin: skin.toString('base64'), name: 'Fixture', slim: false }) });
  Object.assign(process.env, { TOOLS_BACKEND_ENABLED: 'true', TOOLS_SERVICE_TOKEN: TOKEN, TOOLS_ISOLATED_JOB: '1', SCHEMATI_URL: `http://127.0.0.1:${skinServer.port}` });
  store = new ToolJobStore({ concurrency: 2, graceMs: 3000, onProgress: (id, fraction, message) => { const list = events.get(id) ?? []; list.push({ fraction, message }); events.set(id, list); } });
  app = new Hono().route('/api/tool-jobs', createToolJobsRouter(() => store));
});
afterAll(() => {
  store.dispose();
  skinServer.stop(true);
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const headers = { 'Content-Type': 'application/json', 'X-Tools-Service-Token': TOKEN, 'X-Tools-Owner': 'user:e2e' };
const tool = async (id: string) => JSON.parse(await readFile(new URL(`../../tools/${id}.json`, import.meta.url), 'utf8'));
const fixture = async (name: string) => ({ base64: (await readFile(new URL(`../../../tests/fixtures/tools/${name}`, import.meta.url))).toString('base64'), filename: name });

async function runJob(graph: any, inputs: Record<string, unknown>, opts: { cancelAfterMs?: number; timeout?: number } = {}) {
  const res = await app.request('/api/tool-jobs', { method: 'POST', headers, body: JSON.stringify({ graph, inputs, timeout: opts.timeout ?? graph.metadata?.tool?.timeout ?? 60, run_id: 'e2e' }) });
  expect(res.status).toBe(202);
  const created = await res.json();
  expect(created).toEqual({ id: expect.any(String), status: 'queued', queued_position: expect.any(Number) });
  const started = Date.now();
  let cancelled = false;
  while (true) {
    if (opts.cancelAfterMs !== undefined && !cancelled && Date.now() - started > opts.cancelAfterMs) {
      cancelled = true;
      const del = await app.request(`/api/tool-jobs/${created.id}`, { method: 'DELETE', headers });
      expect(del.status).toBe(200);
    }
    const job = await (await app.request(`/api/tool-jobs/${created.id}`, { headers })).json();
    if (['done', 'failed', 'timeout', 'cancelled'].includes(job.status)) return { job, events: events.get(created.id) ?? [] };
    await Bun.sleep(25);
  }
}

function expectOutputs(outputs: any[], expected: Record<string, { kind: string; format: string }>) {
  expect(outputs.map(o => o.name).sort()).toEqual(Object.keys(expected).sort());
  for (const out of outputs) {
    expect(Object.keys(out).sort()).toEqual(['base64', 'filename', 'format', 'kind', 'name']);
    expect(out).toMatchObject({ ...expected[out.name], filename: `${out.name}.${expected[out.name].format}` });
    const bytes = Buffer.from(out.base64, 'base64');
    expect(bytes.length).toBeGreaterThan(0);
    if (out.kind === 'schematic') expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x8b]); // gzip NBT
    if (out.kind === 'json') expect(() => JSON.parse(bytes.toString())).not.toThrow();
    if (out.kind === 'image') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  }
}

function expectProgress(job: any, seen: Array<{ fraction: number; message: string | null }>, authored: string) {
  expect(job.progress).toBe(1);
  const fractions = seen.map(e => e.fraction);
  expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  expect(fractions.some(f => f > 0.1 && f < 0.9)).toBe(true);
  const messages = seen.map(e => e.message);
  for (const m of ['Compiling graph', 'Checking inputs', 'Encoding outputs', authored]) expect(messages).toContain(m);
}

const json = (out: any) => JSON.parse(Buffer.from(out.base64, 'base64').toString());

describe('official tools through POST/GET /api/tool-jobs (real Workers)', () => {
  test('image-to-schematic', async () => {
    const { job, events } = await runJob(await tool('image-to-schematic'), { file: await fixture('image.png'), width: 8 });
    expect(job.error).toBeNull();
    expect(job.status).toBe('done');
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, metadata: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'metadata')).dimensions).toEqual([8, 4, 1]);
    expectProgress(job, events, 'Matching colours to blocks');
  }, 60000);

  test('image-to-schematic honours the litematic format input', async () => {
    const { job } = await runJob(await tool('image-to-schematic'), { file: await fixture('image.png'), width: 8, format: 'litematic' });
    expect(job.status).toBe('done');
    expect(job.outputs.find((o: any) => o.name === 'schematic')).toMatchObject({ kind: 'schematic', format: 'litematic', filename: 'schematic.litematic' });
  }, 60000);

  test('model-to-schematic', async () => {
    const { job, events } = await runJob(await tool('model-to-schematic'), { file: await fixture('tall-box.obj'), size: 384, size_axis: 'y' });
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, metadata: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'metadata')).dimensions).toEqual([24, 384, 96]);
    expectProgress(job, events, 'Voxelising model');
  }, 120000);

  test('skin-statue prefetches the skin under its canonical input name', async () => {
    const { job, events } = await runJob(await tool('skin-statue'), { username: 'Fixture' });
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, metadata: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'metadata')).dimensions).toEqual([16, 32, 8]);
    expectProgress(job, events, 'Placing blocks');
  }, 60000);

  test('skin-statue reports an unknown account as a validation failure', async () => {
    const { job } = await runJob(await tool('skin-statue'), { username: 'nobody' });
    expect(job).toMatchObject({ status: 'failed', error: { code: 'validation' }, outputs: null });
  }, 60000);

  test('sdf-playground', async () => {
    const { job, events } = await runJob(await tool('sdf-playground'), {});
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, definition: { kind: 'json', format: 'json' } });
    expectProgress(job, events, 'Filling the shape');
  }, 60000);

  test('build-animation keeps its generic outputs and drops the editor-only native', async () => {
    const { job, events } = await runJob(await tool('build-animation'), { count: 6, timeMs: 300 });
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, frame: { kind: 'json', format: 'json' }, durationMs: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'frame')).poses).toHaveLength(6);
    expectProgress(job, events, 'Sampling the timeline');
  }, 60000);

  test('building-footprints', async () => {
    const { job, events } = await runJob(await tool('building-footprints'), {});
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, buildings: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'buildings'))).toBe(2);
    expectProgress(job, events, 'Extruding buildings');
  }, 60000);

  test('circuit-lab (the native simulation port stays editor-only)', async () => {
    const { job, events } = await runJob(await tool('circuit-lab'), { powered: true, ticks: 8 });
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'schem' }, analysis: { kind: 'json', format: 'json' } });
    expect(json(job.outputs.find((o: any) => o.name === 'analysis')).lampLit).toBe(true);
    expectProgress(job, events, 'Simulating');
  }, 60000);

  test('internal transform takes a format input', async () => {
    const { createDefaultRegistry } = await import('../../packages/core/src/index');
    const N = (await createDefaultRegistry().createContext({ kind: 'node' })).Nucleation as any;
    const bar = N.Schematic.create('bar'); bar.setBlocks([0, 0, 0, 1, 0, 0], 'minecraft:stone');
    const { job } = await runJob(await tool('internal/transform'), { file: { base64: bar.toSchematicB64(), filename: 'bar.schem' }, rotate: [0, 90, 0], format: 'litematic' });
    expect(job.error).toBeNull();
    expectOutputs(job.outputs, { schematic: { kind: 'schematic', format: 'litematic' } });
  }, 60000);

  test('invalid inputs fail with the validation code', async () => {
    const { job } = await runJob(await tool('image-to-schematic'), { file: await fixture('image.png'), width: 99999 });
    expect(job).toMatchObject({ status: 'failed', error: { code: 'validation' }, outputs: null });
  }, 60000);
});

describe('runaway graphs', () => {
  const runaway = { nodes: [
    { id: 'spin', type: 'code', data: { label: 'spin', code: 'function generate(): { schematic: Schematic } { while (true) {} }', contract: { inputs: {}, outputs: { schematic: { kind: 'schematic' } } } } },
    { id: 'out', type: 'output', data: { label: 'schematic', dataType: 'schematic' } },
  ], edges: [{ id: 'e', source: 'spin', sourceHandle: 'schematic', target: 'out', targetHandle: 'input' }], metadata: { tool: { timeout: 1, runtime: 'any' } } };

  test('DELETE terminates the Worker', async () => {
    const started = Date.now();
    const { job } = await runJob(runaway, {}, { cancelAfterMs: 300, timeout: 60 });
    expect(job).toMatchObject({ status: 'cancelled', error: { code: 'cancelled' } });
    expect(Date.now() - started).toBeLessThan(3000);
  }, 20000);

  test('the wall clock kills a job that ignores its soft timeout', async () => {
    const { job } = await runJob(runaway, {}, { timeout: 1 });
    expect(job).toMatchObject({ status: 'timeout', error: { code: 'timeout' }, outputs: null });
  }, 20000);
});

describe('POST /api/execute/tool (sync, legacy)', () => {
  test('returns outputs[] alongside the legacy single file', async () => {
    const { default: executeRouter } = await import('../src/routes/execute');
    const legacyApp = new Hono().route('/api/execute', executeRouter);
    const res = await legacyApp.request('/api/execute/tool', { method: 'POST', headers, body: JSON.stringify({ graph: await tool('image-to-schematic'), inputs: { file: await fixture('image.png'), width: 8 }, timeout: 30000 }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.output).toMatchObject({ format: 'schem', base64: expect.any(String), metadata: { dimensions: [8, 4, 1] } });
    expect(body.outputs.map((o: any) => o.name).sort()).toEqual(['metadata', 'schematic']);
  }, 60000);
});
