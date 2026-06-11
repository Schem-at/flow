// index.ts
// Main Synthase class - new unified architecture
export { Synthase } from "./synthase";

// Utility functions for common operations
export { SynthaseUtils } from "./synthase-utils";

// Safety and monitoring classes
export { ExecutionLimits } from "./execution-limits";
export { ScriptValidator } from "./script-validator";
export { ResourceMonitor } from "./resource-monitor";

// Script registry implementations
export {
	InMemoryScriptRegistry,
	HttpScriptRegistry,
	CompositeScriptRegistry,
} from "./script-registry";

// Type definitions and utilities
export {
	type ParameterDef,
	type ParameterSpec,
	type IOSchema,
	type LoadedScript,
	type ScriptRegistry,
	type ScriptContentResolver,
	type ExecutionContext,
	type ImportedScript,
	type ValidationResult,
	type CacheEntry,
	type ResourceStats,
	type ExecutionLimitsConfig,
	type ResourceMonitorConfig,
	ParameterUtils,
} from "./types";

// Re-export utility types for convenience
export type { QuickExecuteOptions } from "./synthase-utils";

// Version info
export const VERSION = "2.0.0";

// Quick access helpers - import and then destructure
import { SynthaseUtils } from "./synthase-utils";
export const {
	execute,
	executeWithValidation,
	validate,
	executeBatch,
	createReusable,
	createHotReloadable,
	benchmark,
} = SynthaseUtils;

// Default export for simple usage
import { Synthase } from "./synthase";
export default Synthase;
