/**
 * Worker module exports
 * Provides both browser WebWorker and Bun Worker Thread support
 */

export { WorkerClient, type WorkerClientOptions, type SubflowResult } from './WorkerClient.js';
export { BunWorkerClient, type BunWorkerClientOptions } from './BunWorkerClient.js';
export { MessageHandler } from './MessageHandler.js';
export { createContextProviders, createMinimalContextProviders } from './contextProviders.js';
export { WorkerDataStore, workerDataStore } from './WorkerDataStore.js';

// Re-export types
export type { WorkerMessage, WorkerConfig, WorkerState, DataHandle, DataValue } from '../types/index.js';
export { MESSAGE_TYPES, DATA_STORE_MESSAGES, WORKER_STATES, DEFAULT_WORKER_CONFIG } from '../types/index.js';

