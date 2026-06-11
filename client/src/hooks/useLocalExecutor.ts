import { useEffect, useCallback } from 'react';
import { WorkerClient, type SubflowResult } from '@flow/core/worker';
// @ts-ignore - Import worker directly from source
import Worker from '../../../packages/core/src/worker/browser.worker.ts?worker';
import { useFlowStore } from '../store/flowStore';

interface SubflowNode {
  id: string;
  type: string;
  data: { code?: string; value?: unknown; label?: string };
}

interface SubflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * ONE worker client per page. Handles (resident WASM schematics) live in the
 * worker's data store, so everything that executes or resolves handles —
 * Editor, FlowRunner, CodePanel test runs, viewer nodes — must share the same
 * worker. The client respawns its worker on cancel/hard-timeout via the factory.
 */
let sharedClient: WorkerClient | null = null;

export function getSharedWorkerClient(): WorkerClient {
  if (!sharedClient) {
    sharedClient = new WorkerClient({
      worker: new Worker(),
      workerFactory: () => new Worker(),
    });
  }
  return sharedClient;
}

export function useLocalExecutor() {
  const workerClient = getSharedWorkerClient();
  const { addExecutionLog } = useFlowStore();

  useEffect(() => {
    const onProgress = (payload: any) => {
      if (!payload?.message) return;

      // Route Progress.report() percentages to the executing node's bar.
      if (typeof payload.percent === 'number') {
        const { executingNodeId, setNodeProgress } = useFlowStore.getState();
        if (executingNodeId) {
          setNodeProgress(executingNodeId, {
            percent: payload.percent,
            message: payload.message,
          });
        }
        return; // progress ticks would flood the execution log
      }
      // Clean up log prefix if present
      const message = payload.message.startsWith('Log: ')
        ? payload.message.substring(5)
        : payload.message;

      // Determine log level/style based on message content or data
      let formattedMessage = message;
      if (payload.data && payload.data.level) {
        // If we have structured log data
        const level = payload.data.level.toUpperCase();
        if (level === 'ERROR') formattedMessage = `[ERROR] ${message}`;
        else if (level === 'WARN') formattedMessage = `[WARN] ${message}`;
        else formattedMessage = `[OK] ${message}`;
      } else if (!message.startsWith('[')) {
        // Add default prefix if none exists
        formattedMessage = `[OK] ${message}`;
      }

      addExecutionLog(formattedMessage);
    };

    const onError = (error: any) => {
      addExecutionLog(`[ERROR] Worker error: ${error?.message || error}`);
    };

    workerClient.on('progress', onProgress);
    workerClient.on('error', onError);
    return () => {
      // Detach listeners only — the shared worker outlives any one mount.
      workerClient.off('progress', onProgress);
      workerClient.off('error', onError);
    };
  }, [workerClient, addExecutionLog]);

  const executeScript = useCallback(async (
    code: string,
    inputs: Record<string, unknown>,
    options: { returnHandles?: boolean } = {}
  ) => {
    return workerClient.executeScript(code, inputs, {
      timeout: 60000,
      returnHandles: options.returnHandles,
    });
  }, [workerClient]);

  /**
   * Execute a subflow entirely within the worker.
   * This keeps WASM objects in memory between nodes, avoiding serialization overhead.
   */
  const executeSubflow = useCallback(async (
    nodes: SubflowNode[],
    edges: SubflowEdge[],
    inputs: Record<string, unknown>,
    outputNodeIds: string[]
  ): Promise<SubflowResult> => {
    return workerClient.executeSubflow(nodes, edges, inputs, outputNodeIds, { timeout: 60000 });
  }, [workerClient]);

  /** Resolve a worker data handle (resident schematic) to serialized data. */
  const getData = useCallback(
    (handleId: string) => workerClient.getData(handleId),
    [workerClient]
  );

  return { executeScript, executeSubflow, getData, workerClient };
}
