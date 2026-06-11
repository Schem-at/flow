/**
 * BunWorkerClient - Client interface for Bun worker threads
 * Used by the server for non-blocking execution
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
} from '../types/index.js';

export interface BunWorkerClientOptions extends WorkerConfig {
  /** Path to the worker script */
  workerPath?: string;
}

type EventCallback<T = unknown> = (data: T) => void;

/**
 * BunWorkerClient manages communication with a Bun worker thread
 */
export class BunWorkerClient {
  private config: WorkerConfig;
  private worker: Worker | null = null;
  private state: WorkerState = WORKER_STATES.INITIALIZING;
  private messageId = 0;
  private pendingMessages = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  private eventListeners = new Map<string, Set<EventCallback>>();

  constructor(options: BunWorkerClientOptions = {}) {
    this.config = { ...DEFAULT_WORKER_CONFIG, ...options };
  }

  /**
   * Create and initialize a worker from a path
   */
  async create(workerPath: string): Promise<void> {
    if (this.worker) {
      this.destroy();
    }

    try {
      // Create Bun worker
      this.worker = new Worker(workerPath, {
        type: 'module',
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
   * Create a worker from a URL
   */
  async createFromUrl(workerUrl: string | URL): Promise<void> {
    if (this.worker) {
      this.destroy();
    }

    try {
      this.worker = new Worker(workerUrl, {
        type: 'module',
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
   * Set up event handlers for the worker
   */
  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, payload, id, error } = event.data;

      // Handle responses to specific messages
      if (id !== undefined && this.pendingMessages.has(id)) {
        const { resolve, reject, timeout } = this.pendingMessages.get(id)!;
        clearTimeout(timeout);
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

        case MESSAGE_TYPES.NODE_START:
          this.emit('nodeStart', payload);
          break;

        case MESSAGE_TYPES.NODE_FINISH:
          this.emit('nodeFinish', payload);
          break;

        case MESSAGE_TYPES.NODE_ERROR:
          this.emit('nodeError', payload);
          break;

        default:
          console.warn('Unhandled message type:', type);
      }
    };

    this.worker.onerror = (error: ErrorEvent) => {
      console.error('Worker error:', error);
      this.state = WORKER_STATES.ERROR;
      this.emit('error', error);
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
    options: { timeout?: number } = {}
  ): Promise<ExecutionResult> {
    if (this.state !== WORKER_STATES.READY) {
      throw new Error(`Worker not ready. Current state: ${this.state}`);
    }

    try {
      this.state = WORKER_STATES.EXECUTING;
      this.emit('executionStart', undefined);

      const result = (await this.sendMessage(MESSAGE_TYPES.EXECUTE_SCRIPT, {
        code,
        inputs,
        options: {
          timeout: options.timeout || 60000,
        },
      })) as ExecutionResult;

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
    return (await this.sendMessage(
      MESSAGE_TYPES.GET_CONTEXT_PROVIDERS,
      {}
    )) as Record<string, unknown>;
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

      // Clear pending messages
      for (const [, { reject, timeout }] of this.pendingMessages) {
        clearTimeout(timeout);
        reject(new Error('Worker terminated'));
      }
      this.pendingMessages.clear();

      if (oldWorker) {
        oldWorker.terminate();
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
        resolve,
        reject,
        timeout,
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

    // Clear pending messages
    for (const [, { reject, timeout }] of this.pendingMessages) {
      clearTimeout(timeout);
      reject(new Error('Worker destroyed'));
    }
    this.pendingMessages.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.state = WORKER_STATES.ERROR;
  }
}

