import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowToolClient } from './ToolClient';
import graph from '../../../../tools/image-to-schematic.json';

const state = vi.hoisted(() => ({ clients: [] as any[], replies: [] as Array<() => Promise<any>> }));
vi.mock('../worker/WorkerClient.js', () => ({ WorkerClient: class {
  destroy = vi.fn();
  on = vi.fn();
  waitForReady = vi.fn(async () => {});
  executeScript = vi.fn(() => state.replies.shift()!());
  constructor() { state.clients.push(this); }
} }));
const output = { file: { base64: 'c2NoZW0=', format: 'schem' }, metadata: { block_count: 1 } };
function readyRun() {
  state.replies.push(async () => ({ success: true, result: { schematic: { _schematicHandle: 'resident' } } }));
  state.replies.push(async () => ({ success: true, result: output }));
}
function make() { return new FlowToolClient(graph, () => ({} as Worker)); }
beforeEach(() => { state.clients.length = 0; state.replies.length = 0; });

describe('graph-backed tool host', () => {
  it('executes a graph with binary inputs and exports its resident schematic', async () => {
    readyRun();
    const client = make();
    const result = await client.run('image-to-schematic', {}, { file: new ArrayBuffer(4) });
    expect(result).toMatchObject({ base64: 'c2NoZW0=', metadata: { block_count: 1 } });
    const [source, inputs] = state.clients[0].executeScript.mock.calls[0];
    expect(source).toContain('Blocks.image');
    expect(inputs.file.data).toBeInstanceOf(Uint8Array);
    expect(inputs.width).toBe(64);
    client.dispose();
    expect(state.clients[0].destroy).toHaveBeenCalledOnce();
  });

  it('ignores an old run that finishes after cancellation and replacement', async () => {
    let finish!: (value: any) => void;
    state.replies.push(() => new Promise(resolve => { finish = resolve; }));
    const client = make();
    const done = vi.fn(); client.on('done', done);
    const old = client.run('', {}, { file: new ArrayBuffer(4) });
    const cancelled = expect(old).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    client.cancel(); readyRun();
    await client.run('', {}, { file: new ArrayBuffer(4) });
    finish({ success: true, result: { schematic: 'stale' } });
    await cancelled;
    expect(done).toHaveBeenCalledOnce();
    expect(state.clients[0].destroy).toHaveBeenCalledOnce();
  });

  it('serializes exports and transformations while retaining the last schematic', async () => {
    readyRun(); const client = make();
    await client.run('', {}, { file: new ArrayBuffer(4) });
    let finish!: (value: any) => void;
    state.replies.push(() => new Promise(resolve => { finish = resolve; }));
    const exporting = client.exportBytes('litematic');
    await expect(client.rotate('y', 90)).rejects.toThrow('already in progress');
    finish({ success: true, result: output }); await exporting;
    await expect(client.flip('bad')).rejects.toThrow('Invalid axis');
  });
});
