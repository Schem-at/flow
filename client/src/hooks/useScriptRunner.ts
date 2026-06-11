import { useEffect, useRef, useState, useCallback } from 'react';
import { WorkerClient } from '@flow/core/worker';
// @ts-ignore - Vite worker import from source
import Worker from '../../../packages/core/src/worker/browser.worker.ts?worker';

/**
 * Runs a single code block in isolation via the synthase web worker.
 *
 * Unlike useLocalExecutor, this hook has NO dependency on the flow graph
 * store — logs are kept in local state. It is meant for the standalone
 * workbench where there is no React Flow graph.
 */

export interface RunnerLog {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

type RunResult = Awaited<ReturnType<WorkerClient['executeScript']>>;

export function useScriptRunner() {
  const clientRef = useRef<WorkerClient | null>(null);
  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState<RunnerLog[]>([]);

  const pushLog = useCallback((level: RunnerLog['level'], message: string) => {
    setLogs((prev) => [...prev, { level, message }]);
  }, []);

  useEffect(() => {
    const client = new WorkerClient({
      worker: new Worker(),
      // Lets the client terminate + respawn on cancel/hard-timeout.
      workerFactory: () => new Worker(),
    } as ConstructorParameters<typeof WorkerClient>[0]);
    clientRef.current = client;

    // Ready only once the worker has finished initializing (WASM load can be
    // slow over the network); the constructor alone doesn't mean runnable.
    client.on('ready', () => setReady(true));
    if ((client as unknown as { state?: string }).state === 'ready') {
      setReady(true);
    }

    client.on('progress', (payload: any) => {
      if (!payload?.message) return;
      const raw: string = payload.message.startsWith('Log: ')
        ? payload.message.slice(5)
        : payload.message;
      const lvl = payload?.data?.level?.toLowerCase?.();
      pushLog(lvl === 'error' ? 'error' : lvl === 'warn' ? 'warn' : 'ok', raw);
    });

    client.on('error', (e: any) => pushLog('error', `Worker error: ${e?.message || e}`));

    return () => {
      client.destroy();
      clientRef.current = null;
      setReady(false);
    };
  }, [pushLog]);

  const run = useCallback(
    async (code: string, inputs: Record<string, unknown>): Promise<RunResult> => {
      if (!clientRef.current) throw new Error('Worker not ready');
      return clientRef.current.executeScript(code, inputs, { timeout: 60000 });
    },
    [],
  );

  /** Hard-kill the running execution (terminate + respawn the worker). */
  const cancel = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.cancelExecution();
      pushLog('warn', 'Execution cancelled');
    } catch (e) {
      pushLog('error', `Cancel failed: ${(e as Error).message}`);
    }
  }, [pushLog]);

  /** Resolve a worker data handle (e.g. resident schematic) to serialized data. */
  const getData = useCallback(async (handleId: string) => {
    if (!clientRef.current) throw new Error('Worker not ready');
    return clientRef.current.getData(handleId);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { run, cancel, getData, logs, clearLogs, ready };
}
