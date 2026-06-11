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
    const worker = new Worker();
    const client = new WorkerClient({ worker });
    clientRef.current = client;
    setReady(true);

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

  const clearLogs = useCallback(() => setLogs([]), []);

  return { run, logs, clearLogs, ready };
}
