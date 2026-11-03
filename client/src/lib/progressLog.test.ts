import { describe, it, expect } from 'vitest';
import { formatProgressLog, logTone } from './progressLog';

// Bug #36: "Execution failed: ..." arrived as a level-less progress message and
// the log labelled every level-less (and every info/debug) message [OK], green.

describe('formatProgressLog', () => {
  it('labels an error-level failure [ERROR]', () => {
    const line = formatProgressLog({ message: 'Execution failed: boom', data: { level: 'error' } })!;
    expect(line).toBe('[ERROR] Execution failed: boom');
    expect(logTone(line)).toBe('error');
  });

  it('never labels a level-less message [OK]; it defaults to info', () => {
    const line = formatProgressLog({ message: 'Execution failed: boom' })!;
    expect(line).not.toContain('[OK]');
    expect(line).toBe('[INFO] Execution failed: boom');
    expect(logTone(line)).toBe('info');
  });

  it('keeps info and debug script logs neutral, not [OK]', () => {
    expect(formatProgressLog({ message: 'Log: hello', data: { level: 'info' } })).toBe('[INFO] hello');
    expect(formatProgressLog({ message: 'Log: dbg', data: { level: 'debug' } })).toBe('[DEBUG] dbg');
  });

  it('only an explicit success level is [OK]', () => {
    expect(formatProgressLog({ message: 'Script executed successfully', data: { level: 'success' } })).toBe(
      '[OK] Script executed successfully'
    );
  });

  it('labels warnings [WARN]', () => {
    expect(formatProgressLog({ message: 'Execution cancelled by user', data: { level: 'warn' } })).toBe(
      '[WARN] Execution cancelled by user'
    );
  });
});

describe('logTone', () => {
  it('reads the level tag after the timestamp prefix', () => {
    expect(logTone('[12:00:00] [ERROR] x')).toBe('error');
    expect(logTone('[12:00:00] [WARN] x')).toBe('warn');
    expect(logTone('[12:00:00] [OK] x')).toBe('ok');
    expect(logTone('[12:00:00] [INFO] x')).toBe('info');
  });

  it('is decided by the level tag, not by text inside the message', () => {
    expect(logTone('[12:00:00] [INFO] user printed [OK] in a log')).toBe('info');
    expect(logTone('[12:00:00] [OK] Downloaded [ERROR]-report.litematic')).toBe('ok');
  });
});
