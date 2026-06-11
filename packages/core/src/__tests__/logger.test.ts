import { describe, it, expect, vi } from 'vitest';
import { createLogger, noopLogger, type LogEntry } from '../utils/logger';

describe('createLogger', () => {
  it('calls callback with info entry', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info('hello');

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('info');
    expect(entries[0].message).toBe('hello');
    expect(entries[0].status).toBe('info');
    expect(entries[0].type).toBe('script_log');
    expect(entries[0].timestamp).toBeDefined();
  });

  it('calls callback with warn entry', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.warn('watch out');

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('warn');
    expect(entries[0].message).toBe('watch out');
    expect(entries[0].status).toBe('warn');
  });

  it('calls callback with error entry', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.error('something broke');

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
    expect(entries[0].message).toBe('something broke');
    expect(entries[0].status).toBe('error');
  });

  it('calls callback with debug entry (status is info)', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.debug('debug info');

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('debug');
    expect(entries[0].message).toBe('debug info');
    expect(entries[0].status).toBe('info');
  });

  it('converts non-string messages to strings', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info(42);
    logger.info(null);
    logger.info(undefined);
    logger.info({ key: 'val' });

    expect(entries[0].message).toBe('42');
    expect(entries[1].message).toBe('null');
    expect(entries[2].message).toBe('undefined');
    expect(entries[3].message).toBe('[object Object]');
  });

  it('accumulates multiple log entries', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info('one');
    logger.warn('two');
    logger.error('three');
    logger.debug('four');

    expect(entries).toHaveLength(4);
    expect(entries.map(e => e.level)).toEqual(['info', 'warn', 'error', 'debug']);
  });

  it('outputs to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logger = createLogger();

    logger.info('test info');
    logger.warn('test warn');
    logger.error('test error');
    logger.debug('test debug');

    expect(consoleSpy).toHaveBeenCalledWith('[SCRIPT INFO] test info');
    expect(warnSpy).toHaveBeenCalledWith('[SCRIPT WARN] test warn');
    expect(errorSpy).toHaveBeenCalledWith('[SCRIPT ERROR] test error');
    expect(debugSpy).toHaveBeenCalledWith('[SCRIPT DEBUG] test debug');

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('works without a callback', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger();
    expect(() => logger.info('no callback')).not.toThrow();
    consoleSpy.mockRestore();
  });
});

describe('noopLogger', () => {
  it('does not throw on any method', () => {
    expect(() => noopLogger.info('test')).not.toThrow();
    expect(() => noopLogger.warn('test')).not.toThrow();
    expect(() => noopLogger.error('test')).not.toThrow();
    expect(() => noopLogger.debug('test')).not.toThrow();
  });

  it('has all required methods', () => {
    expect(typeof noopLogger.info).toBe('function');
    expect(typeof noopLogger.warn).toBe('function');
    expect(typeof noopLogger.error).toBe('function');
    expect(typeof noopLogger.debug).toBe('function');
  });
});
