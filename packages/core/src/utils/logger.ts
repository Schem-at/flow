/**
 * Log entry structure
 */
export interface LogEntry {
  type: 'script_log' | 'system_log';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  status: 'info' | 'warn' | 'error';
  timestamp?: string;
  data?: unknown;
}

/**
 * Log callback function type
 */
export type LogCallback = (entry: LogEntry) => void;

/**
 * Logger interface exposed to scripts
 */
export interface ScriptLogger {
  info: (message: unknown) => void;
  warn: (message: unknown) => void;
  error: (message: unknown) => void;
  debug: (message: unknown) => void;
}

/**
 * Creates a logger object that forwards messages to a provided callback function.
 * This allows scripts to log information back to the main application's UI.
 * 
 * @param logCallback - The function to call with log entries.
 * @returns A logger object with info, warn, error, and debug methods.
 */
export function createLogger(logCallback?: LogCallback): ScriptLogger {
  const log = (level: LogEntry['level'], message: unknown, status: LogEntry['status']) => {
    const msgStr = String(message);
    const prefix = `[SCRIPT ${level.toUpperCase()}]`;
    
    // Console output
    switch (level) {
      case 'info':
        console.log(`${prefix} ${msgStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${msgStr}`);
        break;
      case 'error':
        console.error(`${prefix} ${msgStr}`);
        break;
      case 'debug':
        console.debug(`${prefix} ${msgStr}`);
        break;
    }
    
    // Callback to main thread/UI
    logCallback?.({
      type: 'script_log',
      level,
      message: msgStr,
      status,
      timestamp: new Date().toISOString(),
    });
  };

  return {
    info: (message: unknown) => log('info', message, 'info'),
    warn: (message: unknown) => log('warn', message, 'warn'),
    error: (message: unknown) => log('error', message, 'error'),
    debug: (message: unknown) => log('debug', message, 'info'),
  };
}

/**
 * No-op logger for when logging is not needed
 */
export const noopLogger: ScriptLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

