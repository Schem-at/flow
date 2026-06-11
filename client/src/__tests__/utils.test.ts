import { describe, it, expect } from 'vitest';
import {
  checkTypeCompatibility,
  validateConnection,
  parseExecutionError,
  getCompatibilityDescription,
  getCompatibilityColor,
  createSimpleError,
} from '../lib/utils';

// ============================================================================
// checkTypeCompatibility
// ============================================================================

describe('checkTypeCompatibility', () => {
  describe('exact matches', () => {
    it('returns exact for identical primitive types', () => {
      expect(checkTypeCompatibility('number', 'number')).toBe('exact');
      expect(checkTypeCompatibility('string', 'string')).toBe('exact');
      expect(checkTypeCompatibility('boolean', 'boolean')).toBe('exact');
      expect(checkTypeCompatibility('array', 'array')).toBe('exact');
      expect(checkTypeCompatibility('object', 'object')).toBe('exact');
    });

    it('returns exact for identical special types', () => {
      expect(checkTypeCompatibility('schematic', 'schematic')).toBe('exact');
      expect(checkTypeCompatibility('vec2', 'vec2')).toBe('exact');
      expect(checkTypeCompatibility('vec3', 'vec3')).toBe('exact');
      expect(checkTypeCompatibility('vector', 'vector')).toBe('exact');
      expect(checkTypeCompatibility('any', 'any')).toBe('exact');
    });
  });

  describe('compatible (hierarchy) matches', () => {
    it('returns compatible when source flows to any', () => {
      expect(checkTypeCompatibility('number', 'any')).toBe('compatible');
      expect(checkTypeCompatibility('string', 'any')).toBe('compatible');
      expect(checkTypeCompatibility('boolean', 'any')).toBe('compatible');
      expect(checkTypeCompatibility('schematic', 'any')).toBe('compatible');
    });

    it('returns compatible for vector hierarchy', () => {
      expect(checkTypeCompatibility('vec3', 'vector')).toBe('compatible');
      expect(checkTypeCompatibility('vec2', 'vector')).toBe('compatible');
      expect(checkTypeCompatibility('vec3', 'object')).toBe('compatible');
      expect(checkTypeCompatibility('vec2', 'object')).toBe('compatible');
      expect(checkTypeCompatibility('vector', 'object')).toBe('compatible');
      expect(checkTypeCompatibility('vec3', 'any')).toBe('compatible');
      expect(checkTypeCompatibility('vec2', 'any')).toBe('compatible');
    });

    it('returns compatible for array to any', () => {
      expect(checkTypeCompatibility('array', 'any')).toBe('compatible');
    });
  });

  describe('coercible matches', () => {
    it('returns coercible for number-string conversions', () => {
      expect(checkTypeCompatibility('number', 'string')).toBe('coercible');
      expect(checkTypeCompatibility('string', 'number')).toBe('coercible');
    });

    it('returns coercible for boolean conversions', () => {
      expect(checkTypeCompatibility('number', 'boolean')).toBe('coercible');
      expect(checkTypeCompatibility('string', 'boolean')).toBe('coercible');
      expect(checkTypeCompatibility('boolean', 'number')).toBe('coercible');
      expect(checkTypeCompatibility('boolean', 'string')).toBe('coercible');
    });

    it('returns coercible between vec2 and vec3', () => {
      expect(checkTypeCompatibility('vec2', 'vec3')).toBe('coercible');
      expect(checkTypeCompatibility('vec3', 'vec2')).toBe('coercible');
    });
  });

  describe('incompatible matches', () => {
    it('returns incompatible for unrelated types', () => {
      expect(checkTypeCompatibility('schematic', 'number')).toBe('incompatible');
      expect(checkTypeCompatibility('schematic', 'string')).toBe('incompatible');
      expect(checkTypeCompatibility('boolean', 'vec3')).toBe('incompatible');
      expect(checkTypeCompatibility('number', 'schematic')).toBe('incompatible');
      expect(checkTypeCompatibility('boolean', 'array')).toBe('incompatible');
    });
  });

  describe('edge cases', () => {
    it('handles undefined/null by defaulting to any', () => {
      // undefined/null sourceType defaults to 'any', and 'any' hierarchy is only ['any']
      // So 'any' -> 'number' is incompatible (any doesn't flow downward to specific types)
      expect(checkTypeCompatibility(undefined as unknown as string, 'number')).toBe('incompatible');
      expect(checkTypeCompatibility(null as unknown as string, 'string')).toBe('incompatible');
      // But specific type -> undefined/null target defaults to 'any', which is compatible
      expect(checkTypeCompatibility('number', undefined as unknown as string)).toBe('compatible');
      expect(checkTypeCompatibility('number', null as unknown as string)).toBe('compatible');
    });

    it('handles both undefined, resulting in exact any-any', () => {
      expect(checkTypeCompatibility(undefined as unknown as string, undefined as unknown as string)).toBe('exact');
    });

    it('is case insensitive', () => {
      expect(checkTypeCompatibility('Number', 'number')).toBe('exact');
      expect(checkTypeCompatibility('STRING', 'string')).toBe('exact');
      expect(checkTypeCompatibility('Vec3', 'vector')).toBe('compatible');
      expect(checkTypeCompatibility('NUMBER', 'ANY')).toBe('compatible');
    });

    it('trims whitespace', () => {
      expect(checkTypeCompatibility('  number  ', 'number')).toBe('exact');
      expect(checkTypeCompatibility('string', '  string  ')).toBe('exact');
    });

    it('treats unknown types as having a fallback hierarchy of [self, any]', () => {
      expect(checkTypeCompatibility('custom', 'any')).toBe('compatible');
      expect(checkTypeCompatibility('custom', 'custom')).toBe('exact');
      expect(checkTypeCompatibility('custom', 'number')).toBe('incompatible');
    });
  });
});

// ============================================================================
// validateConnection
// ============================================================================

describe('validateConnection', () => {
  it('returns valid for compatible connections', () => {
    const result = validateConnection({ type: 'number' }, { type: 'any' });
    expect(result.isValid).toBe(true);
    expect(result.compatibility).toBe('compatible');
    expect(result.sourceType).toBe('number');
    expect(result.targetType).toBe('any');
  });

  it('returns valid for exact match connections', () => {
    const result = validateConnection({ type: 'string' }, { type: 'string' });
    expect(result.isValid).toBe(true);
    expect(result.compatibility).toBe('exact');
  });

  it('returns valid for coercible connections', () => {
    const result = validateConnection({ type: 'number' }, { type: 'string' });
    expect(result.isValid).toBe(true);
    expect(result.compatibility).toBe('coercible');
    expect(result.message).toContain('coerced');
  });

  it('returns invalid for incompatible connections', () => {
    const result = validateConnection({ type: 'schematic' }, { type: 'number' });
    expect(result.isValid).toBe(false);
    expect(result.compatibility).toBe('incompatible');
    expect(result.message).toContain('Cannot connect');
  });

  it('defaults undefined ports to any', () => {
    const result = validateConnection(undefined, undefined);
    expect(result.isValid).toBe(true);
    expect(result.sourceType).toBe('any');
    expect(result.targetType).toBe('any');
    expect(result.compatibility).toBe('exact');
  });

  it('defaults undefined source port to any', () => {
    // 'any' source -> 'number' target: 'any' hierarchy is only ['any'], doesn't include 'number'
    // So this is actually incompatible (any doesn't flow downward to specific types)
    const result = validateConnection(undefined, { type: 'number' });
    expect(result.isValid).toBe(false);
    expect(result.sourceType).toBe('any');
    expect(result.compatibility).toBe('incompatible');
  });

  it('defaults undefined target port to any', () => {
    const result = validateConnection({ type: 'number' }, undefined);
    expect(result.isValid).toBe(true);
    expect(result.targetType).toBe('any');
    expect(result.compatibility).toBe('compatible');
  });

  it('message format for exact/compatible uses arrow notation', () => {
    const exact = validateConnection({ type: 'number' }, { type: 'number' });
    expect(exact.message).toBe('number → number');

    const compatible = validateConnection({ type: 'vec3' }, { type: 'vector' });
    expect(compatible.message).toBe('vec3 → vector');
  });

  it('message format for coercible mentions coercion', () => {
    const result = validateConnection({ type: 'number' }, { type: 'string' });
    expect(result.message).toBe('number will be coerced to string');
  });

  it('message format for incompatible mentions cannot connect', () => {
    const result = validateConnection({ type: 'schematic' }, { type: 'boolean' });
    expect(result.message).toBe('Cannot connect schematic to boolean');
  });
});

// ============================================================================
// parseExecutionError
// ============================================================================

describe('parseExecutionError', () => {
  describe('string errors', () => {
    it('parses a plain string error', () => {
      const result = parseExecutionError('something failed');
      expect(result.message).toBe('something failed');
      expect(result.type).toBeUndefined();
      expect(result.lineNumber).toBeUndefined();
      expect(result.columnNumber).toBeUndefined();
      expect(result.codeSnippet).toBeUndefined();
    });

    it('parses an empty string error', () => {
      const result = parseExecutionError('');
      expect(result.message).toBe('');
    });
  });

  describe('Error objects', () => {
    it('extracts message from Error object', () => {
      const err = new Error('test error');
      const result = parseExecutionError(err);
      expect(result.message).toBe('test error');
    });

    it('extracts type from Error name', () => {
      const err = new TypeError('wrong type');
      const result = parseExecutionError(err);
      expect(result.message).toBe('wrong type');
      expect(result.type).toBe('TypeError');
    });

    it('extracts type from SyntaxError', () => {
      const err = new SyntaxError('unexpected token');
      const result = parseExecutionError(err);
      expect(result.type).toBe('SyntaxError');
    });

    it('extracts type from custom error-like object', () => {
      const err = { message: 'custom', type: 'CustomError' };
      const result = parseExecutionError(err);
      expect(result.message).toBe('custom');
      expect(result.type).toBe('CustomError');
    });
  });

  describe('stack trace parsing', () => {
    it('extracts line and column from anonymous eval stack', () => {
      const err = new Error('fail');
      err.stack = 'Error: fail\n    at eval (<anonymous>:5:10)\n    at something';
      const result = parseExecutionError(err);
      expect(result.lineNumber).toBe(5);
      expect(result.columnNumber).toBe(10);
    });

    it('extracts line and column from eval pattern', () => {
      const err = new Error('fail');
      err.stack = 'Error: fail\n    at eval:3:15';
      const result = parseExecutionError(err);
      expect(result.lineNumber).toBe(3);
      expect(result.columnNumber).toBe(15);
    });

    it('falls back to message pattern for line info', () => {
      const err = { message: 'error at line 7', stack: undefined };
      const result = parseExecutionError(err as unknown as Error);
      expect(result.lineNumber).toBe(7);
    });

    it('extracts line from parenthesized format in message', () => {
      const err = { message: 'SyntaxError: unexpected (4:12)' };
      const result = parseExecutionError(err as unknown as Error);
      expect(result.lineNumber).toBe(4);
      expect(result.columnNumber).toBe(12);
    });
  });

  describe('code snippet extraction', () => {
    const scriptCode = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const d = 4;',
      'throw new Error("boom");',
      'const e = 5;',
      'const f = 6;',
    ].join('\n');

    it('extracts code snippet around error line', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at eval (<anonymous>:5:1)';
      const result = parseExecutionError(err, scriptCode);
      expect(result.codeSnippet).toBeDefined();
      expect(result.lineNumber).toBe(5);
      // The error line (5) should be marked with '>'
      expect(result.codeSnippet).toContain('>');
      expect(result.codeSnippet).toContain('throw new Error("boom");');
    });

    it('includes surrounding context lines', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at eval (<anonymous>:5:1)';
      const result = parseExecutionError(err, scriptCode);
      // Should include lines around line 5
      expect(result.codeSnippet).toContain('const c = 3;');
      expect(result.codeSnippet).toContain('const d = 4;');
      expect(result.codeSnippet).toContain('const e = 5;');
      expect(result.codeSnippet).toContain('const f = 6;');
    });

    it('does not produce snippet without scriptCode', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at eval (<anonymous>:5:1)';
      const result = parseExecutionError(err);
      expect(result.codeSnippet).toBeUndefined();
    });

    it('does not produce snippet without line number', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at somewhere';
      const result = parseExecutionError(err, scriptCode);
      expect(result.codeSnippet).toBeUndefined();
    });

    it('handles error on first line gracefully', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at eval (<anonymous>:1:1)';
      const result = parseExecutionError(err, scriptCode);
      expect(result.codeSnippet).toBeDefined();
      expect(result.codeSnippet).toContain('const a = 1;');
    });

    it('handles error on last line gracefully', () => {
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at eval (<anonymous>:7:1)';
      const result = parseExecutionError(err, scriptCode);
      expect(result.codeSnippet).toBeDefined();
      expect(result.codeSnippet).toContain('const f = 6;');
    });
  });
});

// ============================================================================
// Helper functions
// ============================================================================

describe('getCompatibilityDescription', () => {
  it('returns description for each compatibility level', () => {
    expect(getCompatibilityDescription('exact')).toBe('Types match exactly');
    expect(getCompatibilityDescription('compatible')).toBe('Types are compatible');
    expect(getCompatibilityDescription('coercible')).toBe('Types can be coerced (may lose data)');
    expect(getCompatibilityDescription('incompatible')).toBe('Types are incompatible');
  });
});

describe('getCompatibilityColor', () => {
  it('returns color classes for each compatibility level', () => {
    expect(getCompatibilityColor('exact')).toContain('green');
    expect(getCompatibilityColor('compatible')).toContain('blue');
    expect(getCompatibilityColor('coercible')).toContain('yellow');
    expect(getCompatibilityColor('incompatible')).toContain('red');
  });
});

describe('createSimpleError', () => {
  it('creates an error with just a message', () => {
    const result = createSimpleError('simple error');
    expect(result).toEqual({ message: 'simple error' });
  });
});
