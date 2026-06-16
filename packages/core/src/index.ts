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

// Block compile pipeline (source → runnable JS)
export {
  compileBlock,
  stripTypes,
  isBlockSource,
  BlockCompileError,
  SYNTHASE_BASE_CONTEXT_KEYS,
  compileFlow,
  hashFlow,
  FlowCompileError,
  contractToTypeScript,
  composeBlockSource,
  type CompiledBlock,
  type CompileOptions,
  type CompiledFlow,
  type FlowLike,
} from './compile/index.js';

// Flow assets (binary payloads bundled inside flows via asset nodes)
export {
  assetNodeValue,
  isAssetNodeData,
  type AssetNodeData,
} from './utils/assets.js';
export { bytesToBase64, base64ToBytes } from './utils/base64.js';
export { encodePng } from './utils/png.js';
export { schematicPreviewPng } from './utils/schematic-preview.js';

// Toolkit ambients (Field/Image/Random/Table/Mcfunction — docs/dx-audit.md)
export { FieldOps, type FieldData } from './utils/field.js';
export { FlowImage, type PaletteName } from './utils/image.js';
export { Random } from './utils/random.js';
export { Table } from './utils/table.js';
export { Mcfunction, McfunctionBuilder } from './utils/mcfunction.js';

// Runtime providers (pluggable endowments: nucleation, standard helpers)
export {
  ProviderRegistry,
  createDefaultRegistry,
  flowlibProvider,
  vendorProvider,
  standardProvider,
  toolkitProvider,
  nucleationProvider,
  schematiProvider,
  createSchematiClient,
  NUCLEATION_VERSION,
  detectRuntimeEnvKind,
  type RuntimeProvider,
  type RuntimeEnv,
  type ProgressReporter,
  type SchematiSummary,
} from './providers/index.js';

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

