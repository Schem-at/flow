/**
 * WorkerClient - Client-side interface for worker communication
 * Works with browser WebWorkers
 */

import {
  MESSAGE_TYPES,
  WORKER_STATES,
  DEFAULT_WORKER_CONFIG,
  type MessageType,
  type WorkerState,
  type WorkerMessage,
  type WorkerConfig,
  type IODefinition,
  type ExecutionResult,
  type DataHandle,
  type DataValue,
  type DataFormat,
  type DataMetadata,
  type SchematicData,
} from '../types/index.js';

export interface WorkerClientOptions extends WorkerConfig {
  /** URL to the worker script */
  workerUrl?: string;
  /** Worker instance (if already created) */
  worker?: Worker;
  /** Whether to use module workers */
  useModule?: boolean;
}

/**
 * Result from executing a subflow in the worker
 */
export interface SubflowResult {
  success: boolean;
  outputs: Record<string, unknown>;
  schematics?: Record<string, SchematicData> | null;
  executionTime?: number;
  error?: { message: string; nodeId?: string };
}

type EventCallback<T = unknown> = (data: T) => void;

/**
 * WorkerClient manages communication with a Synthase execution worker
 */
export class WorkerClient {
  private config: WorkerConfig;
  private worker: Worker | null = null;
  private state: WorkerState = WORKER_STATES.INITIALIZING;
  private messageId = 0;
  private pendingMessages = new Map<number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private eventListeners = new Map<string, Set<EventCallback>>();
  private initPromise: Promise<void> | null = null;

  constructor(options: WorkerClientOptions = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...options };
    
    if (options.worker) {
      this.worker = options.worker;
      this.setupWorkerEventHandlers();
      this.initPromise = this.initializeWorker();
    }
  }

  /**
   * Create and initialize a worker from a URL
   */
  async createFromUrl(workerUrl: string, useModule = true): Promise<void> {
    if (this.worker) {
      this.destroy();
    }

    try {
      this.worker = new Worker(workerUrl, {
        type: useModule ? 'module' : 'classic',
      });
      this.setupWorkerEventHandlers();
      await this.initializeWorker();
    } catch (error) {
      this.state = WORKER_STATES.ERROR;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create a worker from a blob URL (for bundled workers)
   */
  async createFromBlob(workerCode: string): Promise<void> {
    if (this.worker) {
      this.destroy();
    }

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      this.worker = new Worker(blobUrl);
      this.setupWorkerEventHandlers();
      await this.initializeWorker();
    } catch (error) {
      this.state = WORKER_STATES.ERROR;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the worker
   */
  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, payload, id, error } = event.data;

      // Ignore messages from dead workers during reinitialization
      if (this.state === WORKER_STATES.INITIALIZING && type === MESSAGE_TYPES.EXECUTION_PROGRESS) {
        console.warn('Received progress from dead worker:', payload);
        return;
      }

      // Handle responses to specific messages
      if (id !== undefined && this.pendingMessages.has(id)) {
        const { resolve, reject } = this.pendingMessages.get(id)!;
        this.pendingMessages.delete(id);

        if (error || type === MESSAGE_TYPES.ERROR) {
          reject(new Error(error || String(payload)));
        } else {
          resolve(payload);
        }
        return;
      }

      // Handle broadcast messages
      switch (type) {
        case MESSAGE_TYPES.EXECUTION_PROGRESS:
          if (this.state === WORKER_STATES.EXECUTING) {
            this.emit('progress', payload);
          }
          break;

        case MESSAGE_TYPES.INITIALIZE_SUCCESS:
          this.state = WORKER_STATES.READY;
          this.emit('ready', undefined);
          break;

        case MESSAGE_TYPES.INITIALIZE_ERROR:
          this.state = WORKER_STATES.ERROR;
          this.emit('error', new Error(String(payload)));
          break;

        case MESSAGE_TYPES.EXECUTION_CANCELLED:
          this.state = WORKER_STATES.READY;
          this.emit('executionCancelled', payload);
          break;

        default:
          console.warn('Unhandled message type:', type);
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      this.state = WORKER_STATES.ERROR;
      this.emit('error', error);
    };

    this.worker.onmessageerror = (error) => {
      console.error('Worker message error:', error);
    };
  }

  /**
   * Initialize the worker
   */
  private async initializeWorker(): Promise<void> {
    await this.sendMessage(MESSAGE_TYPES.INITIALIZE, {
      customContextProviders: this.config.customContextProviders || {},
    });
    this.state = WORKER_STATES.READY;
    this.emit('ready', undefined);
  }

  /**
   * Wait for the worker to be ready
   */
  async waitForReady(): Promise<void> {
    if (this.state === WORKER_STATES.READY) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    
    return new Promise((resolve, reject) => {
      const onReady = () => {
        this.off('ready', onReady);
        this.off('error', onError);
        resolve();
      };
      const onError = (err: unknown) => {
        this.off('ready', onReady);
        this.off('error', onError);
        reject(err);
      };
      this.on('ready', onReady);
      this.on('error', onError);
    });
  }

  /**
   * Execute a script in the worker
   */
  async executeScript(
    code: string,
    inputs: Record<string, unknown> = {},
    options: { timeout?: number; returnHandles?: boolean } = {}
  ): Promise<ExecutionResult> {
    if (this.state !== WORKER_STATES.READY) {
      throw new Error(`Worker not ready. Current state: ${this.state}`);
    }

    try {
      this.state = WORKER_STATES.EXECUTING;
      this.emit('executionStart', undefined);

      const result = await this.sendMessage(MESSAGE_TYPES.EXECUTE_SCRIPT, {
        code,
        inputs,
        options: {
          timeout: options.timeout || 60000,
          returnHandles: options.returnHandles,
        },
      }) as ExecutionResult;

      this.state = WORKER_STATES.READY;
      this.emit('executionSuccess', result);

      return result;
    } catch (error) {
      this.state = WORKER_STATES.READY;
      this.emit('executionError', error);
      throw error;
    }
  }

  /**
   * Execute a subflow (multiple nodes) within the worker.
   * This keeps WASM objects in memory between nodes and only serializes
   * at the final output boundary, avoiding redundant serialization overhead.
   */
  async executeSubflow(
    nodes: Array<{ id: string; type: string; data: { code?: string; value?: unknown; label?: string } }>,
    edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
    inputs: Record<string, unknown>,
    outputNodeIds: string[],
    options: { timeout?: number } = {}
  ): Promise<SubflowResult> {
    if (this.state !== WORKER_STATES.READY) {
      throw new Error(`Worker not ready. Current state: ${this.state}`);
    }

    try {
      this.state = WORKER_STATES.EXECUTING;
      this.emit('executionStart', undefined);

      const result = await this.sendMessage(MESSAGE_TYPES.EXECUTE_FLOW, {
        nodes,
        edges,
        inputs,
        outputNodeIds,
        options: {
          timeout: options.timeout || 60000,
        },
      }) as SubflowResult;

      this.state = WORKER_STATES.READY;
      this.emit('executionSuccess', result);

      return result;
    } catch (error) {
      this.state = WORKER_STATES.READY;
      this.emit('executionError', error);
      throw error;
    }
  }

  /**
   * Validate a script and get its IO schema
   */
  async parseIOSchema(code: string): Promise<IODefinition | null> {
    if (this.state !== WORKER_STATES.READY) {
      return null;
    }

    try {
      const result = await this.sendMessage(MESSAGE_TYPES.VALIDATE_SCRIPT, { code });
      return result as IODefinition | null;
    } catch (error) {
      console.warn('Schema validation failed:', error);
      return null;
    }
  }

  /**
   * Get available context providers
   */
  async getContextProviders(): Promise<Record<string, unknown>> {
    return (await this.sendMessage(MESSAGE_TYPES.GET_CONTEXT_PROVIDERS, {})) as Record<string, unknown>;
  }

  // ==========================================================================
  // Data Store Methods - Keep data in worker, get handles instead
  // ==========================================================================

  /**
   * Store data in the worker and get a lightweight handle
   * Use this for large objects like schematics that don't need to be
   * serialized until preview/export
   */
  async storeData(
    value: unknown,
    format: DataFormat,
    options?: { name?: string; pinned?: boolean; metadata?: DataMetadata }
  ): Promise<DataHandle> {
    return (await this.sendMessage(MESSAGE_TYPES.STORE_DATA, {
      value,
      format,
      options,
    })) as DataHandle;
  }

  /**
   * Get full serialized data from a handle
   * Use sparingly - prefer getPreview for display purposes
   */
  async getData(handleId: string): Promise<DataValue | null> {
    return (await this.sendMessage(MESSAGE_TYPES.GET_DATA, {
      handleId,
      options: { fullData: true },
    })) as DataValue | null;
  }

  /**
   * Get a preview of data from a handle
   * May be lower quality/smaller for performance
   */
  async getPreview(handleId: string, maxDimension?: number): Promise<DataValue | null> {
    return (await this.sendMessage(MESSAGE_TYPES.GET_PREVIEW, {
      handleId,
      options: { fullData: false, maxDimension },
    })) as DataValue | null;
  }

  /**
   * Release a data handle and free memory in worker
   */
  async releaseData(handleId: string): Promise<boolean> {
    const result = (await this.sendMessage(MESSAGE_TYPES.RELEASE_DATA, {
      handleId,
    })) as { released: boolean };
    return result.released;
  }

  /**
   * List all data handles in the worker store
   */
  async listHandles(): Promise<{
    handles: DataHandle[];
    stats: { used: number; max: number; count: number };
  }> {
    return (await this.sendMessage(MESSAGE_TYPES.LIST_HANDLES, {})) as {
      handles: DataHandle[];
      stats: { used: number; max: number; count: number };
    };
  }

  /**
   * Cancel current execution by terminating the worker
   */
  async cancelExecution(): Promise<boolean> {
    if (this.state !== WORKER_STATES.EXECUTING) {
      return false;
    }

    try {
      // Terminating worker for cancellation

      const oldWorker = this.worker;
      this.state = WORKER_STATES.INITIALIZING;
      this.worker = null;
      this.pendingMessages.clear();

      if (oldWorker) {
        oldWorker.terminate();
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Worker terminated
      }

      this.emit('executionCancelled', { forced: true });
      return true;
    } catch (error) {
      console.error('Failed to cancel execution:', error);
      this.state = WORKER_STATES.ERROR;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendMessage(type: MessageType, payload: unknown = null): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const id = ++this.messageId;
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error(`Message timeout: ${type}`));
      }, this.config.timeout);

      this.pendingMessages.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.worker.postMessage({ type, payload, id });
    });
  }

  /**
   * Event emitter methods
   */
  on<T = unknown>(event: string, listener: EventCallback<T>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as EventCallback);
  }

  off<T = unknown>(event: string, listener: EventCallback<T>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as EventCallback);
    }
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  /**
   * State accessors
   */
  getState(): WorkerState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === WORKER_STATES.READY;
  }

  isExecuting(): boolean {
    return this.state === WORKER_STATES.EXECUTING;
  }

  /**
   * Terminate the worker and clean up
   */
  destroy(): void {
    this.eventListeners.clear();
    this.pendingMessages.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.state = WORKER_STATES.ERROR;
  }
}

