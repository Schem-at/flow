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
  deriveBoundary,
  groupNodes,
  ungroup,
  nextGroupId,
  isGroupNodeData,
  isMapNodeData,
  type CompiledBlock,
  type CompileOptions,
  type CompiledFlow,
  type CompileFlowOptions,
  type NodeTraceEntry,
  type TracedResult,
  type FlowLike,
  type BoundaryPort,
  type GroupBoundary,
  type GroupNodeData,
  type MapNodeData,
  type GroupSubgraph,
  type GroupNodeLike,
  type GroupEdge,
  type GroupResult,
  type UngroupResult,
} from './compile/index.js';

// Form meta-node (dense multi-field input form; expands to input + bundle nodes)
export {
  expandFormNodes,
  isFormNodeData,
  type FormField,
  type FormNodeData,
} from './compile/form.js';

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

// ARPU assembler — an EXAMPLE/reference ISA built on the generic Asm kit. It
// proves the kit handles a real-world ISA (byte-for-byte vs arpuemu). NOT a
// platform primitive: there is no `Arpu` ambient global. See asm/examples/arpu.ts.
export { assemble, toHex, fromHex, ISA } from './asm/examples/arpu.js';

// BatPU-2 assembler — a second EXAMPLE/reference ISA (16-bit Minecraft CPU),
// hand-rolled on the kit helpers; byte-for-byte vs mattbatwings' assembler.py.
// See asm/examples/batpu2.ts. (Namespaced so it doesn't collide with ARPU's `assemble`.)
export { assemble as assembleBatpu2, toBits as batpu2ToBits, BATPU2_OPCODES, batpu2Symbols } from './asm/examples/batpu2.js';

// URCL assembler — a third EXAMPLE, demonstrating the kit's resolved-IR back-end
// (URCL is a target-independent IL with no fixed encoding). See asm/examples/urcl.ts.
export { assembleUrcl, formatUrclIR, URCL_MNEMONICS, URCL_PORTS } from './asm/examples/urcl.js';

// IRIS assembler — a fourth EXAMPLE (URCL's real hardware target). BEST-EFFORT:
// no reference assembler exists, so its encoding is assumed/documented and only
// its deterministic logic is tested (not hardware-correct bytes). See asm/examples/iris.ts.
export { assembleIris, lowerIris, encodeIris, IRIS_OPCODES } from './asm/examples/iris.js';

// Carbon 1.1 assembler — a fifth EXAMPLE (8-bit ACC-based Minecraft CPU by
// tony-ist), hand-rolled on the kit helpers; byte-for-byte vs the Rust reference.
// See asm/examples/carbon.ts.
export { assemble as assembleCarbon, toHex as carbonToHex, CARBON_OPCODES, CARBON_CONDITIONS } from './asm/examples/carbon.js';

// Provider→endowed-global-names manifest (drives editor ambient-dts drift guards).
export { PROVIDER_ENDOWMENT_KEYS, PROVIDER_DECLARATIONS } from './runtime-types.js';

// Generic ROM generator (ISA-agnostic) — endowed to blocks as the `Rom` global. See asm/rom.ts.
export {
  romString,
  romData,
  romLayout,
  romLayoutData,
  digitsPerByte,
  type RomStringOptions,
  type RomLayoutConfig,
  type RomPlacement,
  type RomBlockRole,
} from './asm/rom.js';

// Assembler construction kit (ISA-agnostic) — endowed to blocks as the `Asm` global.
// Build an assembler for ANY ISA via `define(spec)`, or compose the primitives. See asm/kit.ts.
export {
  define,
  parseNumber,
  stripComments,
  normalizeLines,
  tokenizeLines,
  LabelTable,
  pack,
  packBytes,
  AssembleError,
  ParseError,
  type IsaSpec,
  type Assembler,
  type InstructionDef,
  type AliasDef,
  type EncodeContext,
  type LabelResolveContext,
  type PackField,
  type OperandKind,
  type ResolvedOperand,
  type AsmInstruction,
  type AsmIR,
  type NormalizeOptions,
} from './asm/kit.js';

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

