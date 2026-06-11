/**
 * Worker executor — spawns one-shot Bun workers for user-code execution so
 * the main server thread never runs user code and every execution is
 * killable (hard timeout / explicit cancellation -> worker.terminate()).
 */

import type {
  ExecutionWorkerRequest,
  ExecutionWorkerResponse,
  ExecutionWorkerEvent,
} from '../worker/execution.worker.js';

export type {
  ExecutionWorkerRequest,
  ExecutionWorkerEvent,
  FlowWorkerResult,
  FlowOutputEntry,
  ScriptWorkerResult,
} from '../worker/execution.worker.js';

/**
 * Extra budget on top of the script/flow timeout for worker startup
 * (nucleation WASM init) and result serialization. The engine inside the
 * worker enforces the soft timeout; this is the hard-kill deadline.
 */
export const EXECUTION_WORKER_GRACE_MS = 15_000;

export class ExecutionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionTimeoutError';
  }
}

export class ExecutionCancelledError extends Error {
  constructor(message = 'Execution cancelled') {
    super(message);
    this.name = 'ExecutionCancelledError';
  }
}

/**
 * Resolve the worker entry next to this file. In dev the server runs from
 * TS sources (Bun executes .ts workers natively); the tsc build emits the
 * compiled .js sibling.
 */
function resolveWorkerUrl(): URL {
  const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  return new URL(`../worker/execution.worker.${ext}`, import.meta.url);
}

export interface RunInWorkerOptions {
  /** Hard-kill deadline in ms (worker is terminated when it elapses). */
  timeoutMs: number;
  /** Streamed events from the worker (logs, node progress). */
  onEvent?: (event: ExecutionWorkerEvent) => void;
  /**
   * Receives a kill function that terminates the worker and rejects the
   * pending execution with ExecutionCancelledError (used by cancelRun).
   */
  registerKill?: (kill: () => void) => void;
}

/**
 * Run a single request in a fresh one-shot execution worker.
 * The worker is ALWAYS terminated when this settles — on success, error,
 * hard timeout, or cancellation — so no user code can keep running.
 */
export async function runInExecutionWorker<T>(
  request: ExecutionWorkerRequest,
  options: RunInWorkerOptions
): Promise<T> {
  const worker = new Worker(resolveWorkerUrl(), { type: 'module' } as WorkerOptions);

  try {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new ExecutionTimeoutError(
            `Execution killed after ${options.timeoutMs}ms (hard timeout)`
          )
        );
      }, options.timeoutMs);

      options.registerKill?.(() => {
        clearTimeout(timer);
        reject(new ExecutionCancelledError());
      });

      worker.onmessage = (event: MessageEvent<ExecutionWorkerResponse>) => {
        const message = event.data;
        if (message.kind === 'event') {
          try {
            options.onEvent?.(message);
          } catch (err) {
            console.error('Execution event handler failed:', err);
          }
          return;
        }
        clearTimeout(timer);
        if (message.ok) {
          resolve(message.payload as T);
        } else {
          reject(new Error(message.error.message));
        }
      };

      worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        reject(new Error(event?.message || 'Execution worker crashed'));
      };

      worker.postMessage(request);
    });
  } finally {
    // One-shot worker: kill it no matter how we settled.
    worker.terminate();
  }
}
