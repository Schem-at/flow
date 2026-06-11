/**
 * Core constants for the Polymerase engine
 */

// Re-export from types for backward compatibility
export { MESSAGE_TYPES, WORKER_STATES, DEFAULT_WORKER_CONFIG } from '../types/index.js';

/**
 * Supported schematic file formats
 */
export const SCHEMATIC_FORMATS = {
  LITEMATIC: 'litematic',
  SCHEMATIC: 'schematic',
  SCHEM: 'schem',
  NBT: 'nbt',
} as const;

/**
 * Default execution limits
 */
export const EXECUTION_LIMITS = {
  DEFAULT_TIMEOUT: 5000,
  WORKER_TIMEOUT: 60000,
  MAX_RECURSION_DEPTH: 20,
  MAX_IMPORTED_SCRIPTS: 50,
} as const;

/**
 * Engine configuration defaults
 */
export const ENGINE_DEFAULTS = {
  FLOW_VERSION: '1.0.0',
  NODE_SPACING: 200,
  EDGE_TYPE: 'smoothstep',
} as const;

