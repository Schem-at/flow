/**
 * Browser Web Worker entry point
 * This file is the entry point for the browser worker bundle
 */

import { MESSAGE_TYPES, type WorkerMessage } from '../types/index.js';
import { MessageHandler } from './MessageHandler.js';

// Declare self as DedicatedWorkerGlobalScope
declare const self: DedicatedWorkerGlobalScope;

// Initialize the message handler
const messageHandler = new MessageHandler({
  postMessage: (message: WorkerMessage) => {
    self.postMessage(message);
  },
  postProgress: (message: string, percent?: number, data?: unknown) => {
    self.postMessage({
      type: MESSAGE_TYPES.EXECUTION_PROGRESS,
      payload: { message, percent, data },
    });
  },
});

// Set up the main message listener
self.onmessage = async function (event: MessageEvent<WorkerMessage>) {
  try {
    await messageHandler.handleMessage(event.data);
  } catch (error) {
    const err = error as Error;
    self.postMessage({
      type: MESSAGE_TYPES.ERROR,
      payload: err.message,
      id: event.data.id,
    });
  }
};

// Handle unhandled errors
self.onerror = function (error) {
  self.postMessage({
    type: MESSAGE_TYPES.ERROR,
    payload: typeof error === 'string' ? error : 'Unknown worker error',
  });
};

// Handle unhandled promise rejections
self.onunhandledrejection = function (event: PromiseRejectionEvent) {
  self.postMessage({
    type: MESSAGE_TYPES.ERROR,
    payload: event.reason?.message || 'Unhandled promise rejection',
  });
};

// Worker initialized

