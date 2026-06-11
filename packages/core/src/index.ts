/**
 * @flow/core
 * 
 * Isomorphic execution engine for Polymerase
 * Works in both browser and Node/Bun environments
 */

// Main Engine
export { PolymeraseEngine, default as Engine, type EngineOptions } from './Engine.js';

// Services
export {
  SynthaseService,
  type SynthaseOptions,
  type ValidationResult,
  type ReusableExecutor,
  type ContextProviders,
} from './services/index.js';

// Types
export * from './types/index.js';

// Utilities
export {
  Calculator,
  Easing,
  createLogger,
  noopLogger,
  createNoiseProvider,
  Vec2,
  Vec3,
  VectorUtils,
  initializeSchematicProvider,
  SchematicUtils,
  Pathfinding,
  MESSAGE_TYPES,
  WORKER_STATES,
  DEFAULT_WORKER_CONFIG,
  SCHEMATIC_FORMATS,
  EXECUTION_LIMITS,
  ENGINE_DEFAULTS,
  type CalculatorType,
  type EasingType,
  type EasingFunction,
  type EasingName,
  type LogEntry,
  type LogCallback,
  type ScriptLogger,
  type NoiseProvider,
  type FractalNoiseOptions,
  type VectorUtilsType,
  type SchematicWrapper,
  type SchematicClass,
  type PathfindingOptions,
  type PathResult,
  type PathfindingType,
} from './utils/index.js';

// Worker utilities (tree-shakeable)
export {
  WorkerClient,
  BunWorkerClient,
  MessageHandler,
  createContextProviders,
  createMinimalContextProviders,
  WorkerDataStore,
  workerDataStore,
  DATA_STORE_MESSAGES,
  type WorkerClientOptions,
  type BunWorkerClientOptions,
  type DataHandle,
} from './worker/index.js';

// Version
export const VERSION = '0.1.0';

