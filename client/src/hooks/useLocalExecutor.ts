import { useEffect, useRef, useCallback, useState } from 'react';
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

export function useLocalExecutor() {
  const workerClientRef = useRef<WorkerClient | null>(null);
  const [workerClient, setWorkerClient] = useState<WorkerClient | null>(null);
  const { addExecutionLog } = useFlowStore();

  useEffect(() => {
    // Initialize worker
    const worker = new Worker();
    const client = new WorkerClient({ worker });
    workerClientRef.current = client;
    setWorkerClient(client);

    // Set up event listeners
    client.on('progress', (payload: any) => {
      if (payload.message) {
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
      }
    });

    client.on('error', (error: any) => {
      addExecutionLog(`[ERROR] Worker error: ${error.message || error}`);
    });

    return () => {
      client.destroy();
      workerClientRef.current = null;
      setWorkerClient(null);
    };
  }, [addExecutionLog]);

  const executeScript = useCallback(async (
    code: string, 
    inputs: Record<string, unknown>,
    options: { returnHandles?: boolean } = {}
  ) => {
    if (!workerClientRef.current) {
      throw new Error('Worker client not initialized');
    }
    return workerClientRef.current.executeScript(code, inputs, { 
      timeout: 60000,
      returnHandles: options.returnHandles 
    });
  }, []);

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
    if (!workerClientRef.current) {
      throw new Error('Worker client not initialized');
    }
    return workerClientRef.current.executeSubflow(nodes, edges, inputs, outputNodeIds, { timeout: 60000 });
  }, []);

  return { executeScript, executeSubflow, workerClient };
}
