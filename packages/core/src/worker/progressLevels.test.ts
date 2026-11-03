/**
 * Bug #36: execution failures were posted as plain progress messages with no
 * level, so the client log labelled them [OK] and coloured them green.
 * Every failure path must tag its progress message with level 'error'.
 */

import { describe, it, expect } from 'vitest';
import { MessageHandler } from './MessageHandler.js';
import { MESSAGE_TYPES } from '../types/index.js';

interface Progress {
  message: string;
  percent?: number;
  data?: unknown;
}

function makeHandler(executeScript: () => Promise<unknown>) {
  const progress: Progress[] = [];
  const posted: Array<{ type: string; payload: unknown }> = [];
  const handler = new MessageHandler({
    postMessage: (m) => posted.push(m as { type: string; payload: unknown }),
    postProgress: (message, percent, data) => progress.push({ message, percent, data }),
  });
  // Skip WASM init: a stub service is all the failure paths need.
  Object.assign(handler as unknown as Record<string, unknown>, {
    isInitialized: true,
    synthaseService: { executeScript },
  });
  return { handler, progress, posted };
}

const levelOf = (p: Progress | undefined) => (p?.data as { level?: string } | undefined)?.level;

describe('worker progress levels', () => {
  it('a thrown script error posts "Execution failed" with level error', async () => {
    const { handler, progress } = makeHandler(async () => {
      throw new Error('boom');
    });
    await handler.handleMessage({
      type: MESSAGE_TYPES.EXECUTE_SCRIPT,
      payload: { code: 'x', inputs: {} },
      id: '1',
    } as never);
    const failed = progress.find((p) => p.message.startsWith('Execution failed'));
    expect(failed?.message).toBe('Execution failed: boom');
    expect(levelOf(failed)).toBe('error');
  });

  it('an unsuccessful execution result posts "Execution failed" with level error', async () => {
    const { handler, progress } = makeHandler(async () => ({ success: false, error: { message: 'bad input' } }));
    await handler.handleMessage({
      type: MESSAGE_TYPES.EXECUTE_SCRIPT,
      payload: { code: 'x', inputs: {} },
      id: '2',
    } as never);
    const failed = progress.find((p) => p.message.startsWith('Execution failed'));
    expect(failed).toBeDefined();
    expect(levelOf(failed)).toBe('error');
  });

  it('a failing subflow node posts "Subflow execution failed" with level error', async () => {
    const { handler, progress } = makeHandler(async () => ({ success: false, error: { message: 'node blew up' } }));
    await handler.handleMessage({
      type: MESSAGE_TYPES.EXECUTE_FLOW,
      payload: {
        nodes: [{ id: 'c1', type: 'code', data: { code: 'function generate() { return {}; }', label: 'C' } }],
        edges: [],
        inputs: {},
      },
      id: '3',
    } as never);
    const failed = progress.find((p) => p.message.startsWith('Subflow execution failed'));
    expect(failed).toBeDefined();
    expect(levelOf(failed)).toBe('error');
  });

  it('success and status messages carry an info/success level, never a missing one', async () => {
    const { handler, progress } = makeHandler(async () => ({ success: true, result: {} }));
    await handler.handleMessage({
      type: MESSAGE_TYPES.EXECUTE_SCRIPT,
      payload: { code: 'x', inputs: {} },
      id: '4',
    } as never);
    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) expect(levelOf(p), p.message).toMatch(/^(info|success)$/);
  });
});
