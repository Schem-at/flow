/**
 * Bun Worker Thread entry point
 * This file runs in a separate Bun worker thread for non-blocking execution
 */

import { MESSAGE_TYPES, type WorkerMessage } from '../types/index.js';
import { MessageHandler } from './MessageHandler.js';

// Bun worker uses `self` for the worker context
declare const self: Worker;

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
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
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

// Worker initialized

