import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ExecutionError } from '../store/flowStore'
import type { IOPort } from '@flow/core'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ============================================================================
// Type Compatibility System
// ============================================================================

export type TypeCompatibility = 'exact' | 'compatible' | 'coercible' | 'incompatible';

/**
 * Type hierarchy for compatibility checking
 * More specific types should be able to flow to more general types
 */
const TYPE_HIERARCHY: Record<string, string[]> = {
  // number can flow to: number, any
  'number': ['number', 'any'],
  // string can flow to: string, any
  'string': ['string', 'any'],
  // boolean can flow to: boolean, any
  'boolean': ['boolean', 'any'],
  // array can flow to: array, any
  'array': ['array', 'any'],
  // object can flow to: object, any
  'object': ['object', 'any'],
  // schematic is a special type
  'schematic': ['schematic', 'any'],
  // vector types
  'vec2': ['vec2', 'vector', 'object', 'any'],
  'vec3': ['vec3', 'vector', 'object', 'any'],
  'vector': ['vector', 'object', 'any'],
  // any accepts anything
  'any': ['any'],
};

/**
 * Types that can be coerced to another type (with potential data loss)
 */
const COERCIBLE_TYPES: Record<string, string[]> = {
  'number': ['string', 'boolean'],
  'string': ['number', 'boolean'],
  'boolean': ['number', 'string'],
  'array': ['object'],
};

/**
 * Check if a source type is compatible with a target type
 */
export function checkTypeCompatibility(
  sourceType: string,
  targetType: string
): TypeCompatibility {
  // Normalize types (lowercase, trim)
  const source = sourceType?.toLowerCase().trim() || 'any';
  const target = targetType?.toLowerCase().trim() || 'any';

  // Exact match
  if (source === target) {
    return 'exact';
  }

  // Check type hierarchy - source can flow to target
  const sourceHierarchy = TYPE_HIERARCHY[source] || [source, 'any'];
  if (sourceHierarchy.includes(target)) {
    return 'compatible';
  }

  // Check if target is 'any' (accepts everything)
  if (target === 'any') {
    return 'compatible';
  }

  // Check coercible types
  const coercibleTo = COERCIBLE_TYPES[source] || [];
  if (coercibleTo.includes(target)) {
    return 'coercible';
  }

  // Check if both are in the same family (e.g., both vectors)
  if (source.includes('vec') && target.includes('vec')) {
    return 'coercible';
  }

  return 'incompatible';
}

/**
 * Get a human-readable description of type compatibility
 */
export function getCompatibilityDescription(compatibility: TypeCompatibility): string {
  switch (compatibility) {
    case 'exact':
      return 'Types match exactly';
    case 'compatible':
      return 'Types are compatible';
    case 'coercible':
      return 'Types can be coerced (may lose data)';
    case 'incompatible':
      return 'Types are incompatible';
  }
}

/**
 * Get color class for type compatibility
 */
export function getCompatibilityColor(compatibility: TypeCompatibility): string {
  switch (compatibility) {
    case 'exact':
      return 'text-green-400 border-green-500';
    case 'compatible':
      return 'text-blue-400 border-blue-500';
    case 'coercible':
      return 'text-yellow-400 border-yellow-500';
    case 'incompatible':
      return 'text-red-400 border-red-500';
  }
}

export interface ConnectionValidation {
  isValid: boolean;
  compatibility: TypeCompatibility;
  sourceType: string;
  targetType: string;
  message: string;
}

/**
 * Validate a connection between two ports
 */
export function validateConnection(
  sourcePort: IOPort | undefined,
  targetPort: IOPort | undefined
): ConnectionValidation {
  const sourceType = sourcePort?.type || 'any';
  const targetType = targetPort?.type || 'any';
  
  const compatibility = checkTypeCompatibility(sourceType, targetType);
  
  return {
    isValid: compatibility !== 'incompatible',
    compatibility,
    sourceType,
    targetType,
    message: compatibility === 'incompatible' 
      ? `Cannot connect ${sourceType} to ${targetType}`
      : compatibility === 'coercible'
        ? `${sourceType} will be coerced to ${targetType}`
        : `${sourceType} → ${targetType}`,
  };
}

/**
 * Parse an error (from script execution, catch block, etc.) into a structured ExecutionError
 * Attempts to extract line numbers and column info from stack traces
 */
export function parseExecutionError(
  error: Error | { message: string; type?: string; stack?: string } | string,
  scriptCode?: string
): ExecutionError {
  // Handle string errors
  if (typeof error === 'string') {
    return { message: error };
  }

  const message = error.message || String(error);
  const type = ('name' in error ? error.name : undefined) || ('type' in error ? error.type : undefined);
  const stack = 'stack' in error ? error.stack : undefined;

  // Try to extract line/column from stack trace or message
  // Patterns:
  // - "at eval (<anonymous>:5:10)"
  // - "at <anonymous>:5:10"
  // - "SyntaxError: ... (5:10)"
  // - "line 5, column 10"
  let lineNumber: number | undefined;
  let columnNumber: number | undefined;

  // Try stack trace patterns first
  if (stack) {
    // Match patterns like ":5:10" or "line 5"
    const stackLineMatch = stack.match(/<anonymous>:(\d+):(\d+)/) ||
                          stack.match(/eval:(\d+):(\d+)/) ||
                          stack.match(/at\s+.*:(\d+):(\d+)/);
    if (stackLineMatch) {
      lineNumber = parseInt(stackLineMatch[1], 10);
      columnNumber = parseInt(stackLineMatch[2], 10);
    }
  }

  // Try message patterns
  if (!lineNumber) {
    const messageLineMatch = message.match(/line\s+(\d+)/i) ||
                            message.match(/\((\d+):(\d+)\)/) ||
                            message.match(/:(\d+):(\d+)$/);
    if (messageLineMatch) {
      lineNumber = parseInt(messageLineMatch[1], 10);
      if (messageLineMatch[2]) {
        columnNumber = parseInt(messageLineMatch[2], 10);
      }
    }
  }

  // Extract code snippet if we have line number and script code
  let codeSnippet: string | undefined;
  if (lineNumber && scriptCode) {
    const lines = scriptCode.split('\n');
    const startLine = Math.max(0, lineNumber - 3);
    const endLine = Math.min(lines.length, lineNumber + 2);
    
    codeSnippet = lines
      .slice(startLine, endLine)
      .map((line, idx) => {
        const actualLineNum = startLine + idx + 1;
        const prefix = actualLineNum === lineNumber ? '> ' : '  ';
        return `${prefix}${actualLineNum.toString().padStart(3)} | ${line}`;
      })
      .join('\n');
  }

  return {
    message,
    type,
    stack,
    lineNumber,
    columnNumber,
    codeSnippet,
  };
}

/**
 * Create a simple ExecutionError from just a message
 */
export function createSimpleError(message: string): ExecutionError {
  return { message };
}
