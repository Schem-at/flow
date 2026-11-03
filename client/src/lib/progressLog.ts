/**
 * Worker progress message → execution-log line, and log line → display tone.
 * Shared by ExecutionPanel and useLocalExecutor.
 */

export interface ProgressPayload {
  message?: string;
  percent?: number;
  data?: { level?: string } | unknown;
}

export type LogTone = 'error' | 'warn' | 'ok' | 'info';

export function formatProgressLog(payload: ProgressPayload): string | null {
  if (!payload?.message) return null;
  // Clean up log prefix if present
  const message = payload.message.startsWith('Log: ') ? payload.message.substring(5) : payload.message;

  const level = (payload.data as { level?: unknown } | undefined)?.level;
  const upper = typeof level === 'string' ? level.toUpperCase() : '';
  if (upper === 'ERROR') return `[ERROR] ${message}`;
  if (upper === 'WARN' || upper === 'WARNING') return `[WARN] ${message}`;
  if (upper === 'SUCCESS' || upper === 'OK') return `[OK] ${message}`;
  if (upper === 'DEBUG') return `[DEBUG] ${message}`;
  if (upper === 'INFO') return `[INFO] ${message}`;
  // Already tagged by the sender (e.g. "[ERROR] …").
  if (LEVEL_TAG.test(message)) return message;
  // No level: neutral info. Only an explicit success is ever [OK].
  return `[INFO] ${message}`;
}

const LEVEL_TAG = /^\[(ERROR|WARN|OK|INFO|DEBUG)\] /;
/** Optional `[time] ` prefix the store adds, then the level tag. */
const LOG_LINE_TAG = /^(?:\[[^\]]*\] )?\[(ERROR|WARN|OK|INFO|DEBUG)\] /;

export function logTone(log: string): LogTone {
  const tag = LOG_LINE_TAG.exec(log)?.[1];
  if (tag === 'ERROR') return 'error';
  if (tag === 'WARN') return 'warn';
  if (tag === 'OK') return 'ok';
  return 'info';
}
