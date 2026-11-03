import { test, expect, afterEach } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createDefaultRegistry, SynthaseService } from '../../packages/core/src/index';
import { MessageHandler } from '../../packages/core/src/worker/MessageHandler';
import { workerDataStore } from '../../packages/core/src/worker/WorkerDataStore';
import { loadedNucleationModule } from '../../packages/core/src/utils/schematic';
import { executeTool } from '../src/services/toolExecution';

afterEach(() => workerDataStore.clear());

test('all public Nucleation exports are reachable unchanged, including animation and SDF', async () => {
  const context = await createDefaultRegistry().createContext({ kind: 'node' });
  expect(Object.keys(context.Nucleation as object).sort()).toEqual(Object.keys(loadedNucleationModule()!).sort());
  const service = new SynthaseService(context);
  const result = await service.executeScript(`function generate() {
    const build = Nucleation.BuildAnimation.create('Native animation');
    build.setDefaultEffect(Nucleation.AnimationEffect.dropAndPop(500, 8));
    build.setBlock(0, 0, 0, 'minecraft:stone');
    return { groups: build.groupCount(), duration: build.durationMs(),
      frame: JSON.parse(build.frameJson(250)), distance: Nucleation.Sdf.sphere(4).evalAt(0, 0, 0) };
  }`, {});
  expect(result.success).toBe(true);
  expect(result.result).toMatchObject({ groups: 1, duration: 500, distance: -4 });
  expect((result.result as any).frame.poses).toHaveLength(1);
});

test('native animation and schematic objects survive structured-clone round trips between nodes', async () => {
  let response: any;
  const handler = new MessageHandler({ postMessage: message => { response = message; }, postProgress: () => {} });
  await handler.handleMessage({ type: 'INITIALIZE', payload: {}, id: 'init' });
  await handler.handleMessage({ type: 'EXECUTE_SCRIPT', id: 'first', payload: { options: { returnHandles: true }, inputs: {}, code: `function generate() {
    const animation = Nucleation.BuildAnimation.create('round trip');
    animation.setBlock(0, 0, 0, 'minecraft:stone');
    const schematic = Nucleation.Schematic.create('raw');
    schematic.setBlock(0, 0, 0, 'minecraft:stone');
    return { animation, schematic };
  }` } });
  expect(response.payload.success).toBe(true);
  const inputs = structuredClone(response.payload.result);
  expect(inputs.animation.metadata.nativeType).toBe('BuildAnimation');
  expect(inputs.schematic._schematicHandle).toBeString();
  const preview = workerDataStore.serialize(inputs.schematic._schematicHandle);
  expect(preview?.data).toBeInstanceOf(Uint8Array);
  await handler.handleMessage({ type: 'EXECUTE_SCRIPT', id: 'second', payload: { inputs, code: `type Inputs = { animation: any; schematic: any }; function generate(inputs: Inputs) {
    inputs.animation.setBlock(1,0,0,'minecraft:gold_block');
    return { groups: inputs.animation.groupCount(), blocks: inputs.schematic.blockCount() };
  }` } });
  expect(response.payload.success).toBe(true);
  expect(response.payload.result).toEqual({ groups: 2, blocks: 1 });
});

for (const id of ['sdf-playground', 'build-animation', 'building-footprints', 'circuit-lab']) {
  test(`native showcase ${id} executes its graph`, async () => {
    const { compileFlow } = await import('../../packages/core/src/compile/flow-compiler');
    const graph = JSON.parse(await readFile(new URL(`../../tools/${id}.json`, import.meta.url), 'utf8'));
    const context = await createDefaultRegistry().createContext({ kind: 'node' });
    const result = await new SynthaseService(context).executeScript(compileFlow(graph).source, {});
    if (!result.success) throw new Error(result.error?.message);
    expect(result.success).toBe(true);
    const output = result.result as any;
    expect(output.schematic.blockCount()).toBeGreaterThan(0);
    if (id === 'circuit-lab') expect(output.analysis.lampLit).toBe(true);
    if (id === 'build-animation') expect(output.frame.poses).toHaveLength(12);
  });
}

for (const [id, fixture, input, dimensions] of [
  ['image-to-schematic', 'image.png', { width: 8 }, [8, 4, 1]],
  ['model-to-schematic', 'tall-box.obj', { size: 384, size_axis: 'y' }, [24, 384, 96]],
] as const) {
  test(`official ${id} runs in a one-shot worker`, async () => {
    const { runInExecutionWorker } = await import('../src/services/workerExecutor');
    const graph = JSON.parse(await readFile(new URL(`../../tools/${id}.json`, import.meta.url), 'utf8'));
    const file = await readFile(new URL(`../../../tests/fixtures/tools/${fixture}`, import.meta.url));
    const result: any = await runInExecutionWorker({ kind: 'tool', graph, inputs: { ...input, file: { base64: file.toString('base64') } }, timeout: 10000 }, { timeoutMs: 15000 });
    expect(result.metadata.dimensions).toEqual([...dimensions]);
    expect(result.metadata.block_count).toBeGreaterThan(0);
    if (id === 'model-to-schematic') expect(result.metadata).toMatchObject({ shading: 'none', lighting: null });
    expect(result.base64.length).toBeGreaterThan(100);
  });
}

test('skin graph resolves an asset and exports a statue', async () => {
  const skin = await readFile(new URL('../../../tests/fixtures/tools/skin.png', import.meta.url));
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => Response.json({ skin: skin.toString('base64'), name: 'Fixture', slim: false }) });
  const prior = process.env.SCHEMATI_URL;
  process.env.SCHEMATI_URL = `http://127.0.0.1:${server.port}`;
  try {
    const graph = JSON.parse(await readFile(new URL('../../tools/skin-statue.json', import.meta.url), 'utf8'));
    const output = await executeTool(graph, { username: 'Fixture' }, 10000);
    expect(output.metadata.dimensions).toEqual([16, 32, 8]);
    expect(output.metadata.block_count).toBeGreaterThan(0);
    expect(output.metadata).toMatchObject({ username: 'Fixture', slim: false });
  } finally {
    if (prior === undefined) delete process.env.SCHEMATI_URL; else process.env.SCHEMATI_URL = prior;
    server.stop(true);
  }
});

test('native transform graph rotates a saved schematic', async () => {
  const context = await createDefaultRegistry().createContext({ kind: 'node' });
  const N = context.Nucleation as any;
  const schematic = N.Schematic.create('bar'); schematic.setBlocks([0,0,0,1,0,0], 'minecraft:stone');
  const graph = JSON.parse(await readFile(new URL('../../tools/internal/transform.json', import.meta.url), 'utf8'));
  const output = await executeTool(graph, { file: { base64: schematic.toSchematicB64() }, rotate: [0,90,0] }, 10000);
  expect(output.metadata.dimensions).toEqual([1,1,2]);
});

test('one-shot execution kills runaway graph code', async () => {
  const { runInExecutionWorker } = await import('../src/services/workerExecutor');
  await expect(runInExecutionWorker({ kind: 'script', code: 'function generate() { while (true) {} }', inputs: {}, timeout: 100 }, { timeoutMs: 200 })).rejects.toThrow(/hard timeout/i);
});
