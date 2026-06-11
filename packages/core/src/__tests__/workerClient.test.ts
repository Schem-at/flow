/**
 * WorkerClient kill/respawn behavior, tested against a scripted fake Worker.
 */
import { describe, it, expect, vi } from 'vitest';
import { WorkerClient } from '../worker/WorkerClient.js';
import { MESSAGE_TYPES } from '../types/index.js';

type Behavior = 'echo' | 'hang';

class FakeWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessageerror: ((ev: unknown) => void) | null = null;
  terminated = false;

  constructor(public behavior: Behavior = 'echo') {}

  postMessage(msg: { type: string; payload: unknown; id: number }): void {
    if (this.terminated) return;
    const { type, id } = msg;

    if (type === MESSAGE_TYPES.INITIALIZE) {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { type: MESSAGE_TYPES.INITIALIZE_SUCCESS, payload: { status: 'initialized' }, id },
        } as MessageEvent);
      });
      return;
    }

    if (type === MESSAGE_TYPES.EXECUTE_SCRIPT) {
      if (this.behavior === 'hang') return; // simulate a tight-loop zombie
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: MESSAGE_TYPES.EXECUTE_SCRIPT,
            payload: { success: true, result: { ok: true } },
            id,
          },
        } as MessageEvent);
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeClient(behaviors: Behavior[]) {
  const workers: FakeWorker[] = [];
  let spawn = 0;
  const workerFactory = () => {
    const w = new FakeWorker(behaviors[Math.min(spawn, behaviors.length - 1)]);
    spawn += 1;
    workers.push(w);
    return w as unknown as Worker;
  };
  const client = new WorkerClient({ workerFactory });
  return { client, workers };
}

describe('WorkerClient kill + respawn', () => {
  it('spawns from workerFactory and reaches READY', async () => {
    const { client, workers } = makeClient(['echo']);
    await client.waitForReady();
    expect(client.isReady()).toBe(true);
    expect(workers).toHaveLength(1);
  });

  it('cancelExecution terminates the worker, rejects in-flight calls, and respawns', async () => {
    const { client, workers } = makeClient(['hang', 'echo']);
    await client.waitForReady();

    const cancelled = vi.fn();
    client.on('executionCancelled', cancelled);

    const exec = client.executeScript('while(true){}', {}, { timeout: 60000 });
    const execAssertion = expect(exec).rejects.toThrow('Execution cancelled');
    expect(client.isExecuting()).toBe(true);

    const result = await client.cancelExecution();
    expect(result).toBe(true);
    await execAssertion;

    expect(cancelled).toHaveBeenCalledWith({ forced: true });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(client.isReady()).toBe(true);

    // The fresh worker is fully usable
    const ok = await client.executeScript('return 1', {});
    expect(ok).toEqual({ success: true, result: { ok: true } });
  });

  it('hard timeout terminates an unresponsive worker and respawns', async () => {
    const { client, workers } = makeClient(['hang', 'echo']);
    await client.waitForReady();

    await expect(
      client.executeScript('while(true){}', {}, { timeout: 50 })
    ).rejects.toThrow(/timeout/i);

    // Zombie killed, replacement spawned and re-initialized
    await vi.waitFor(() => {
      expect(client.isReady()).toBe(true);
    });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);

    const ok = await client.executeScript('return 1', {});
    expect(ok).toEqual({ success: true, result: { ok: true } });
  });
});
