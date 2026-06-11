/**
 * Factory for creating context providers for the execution environment
 */

import { Calculator } from '../utils/calculator.js';
import { Easing } from '../utils/easing.js';
import { createLogger, type LogCallback } from '../utils/logger.js';
import { createNoiseProvider } from '../utils/noise.js';
import { VectorUtils } from '../utils/vector.js';
import { initializeSchematicProvider, SchematicUtils } from '../utils/schematic.js';
import { Pathfinding } from '../utils/pathfinding.js';
import type { ContextProviders } from '../services/SynthaseService.js';

export interface ProgressReporter {
  report: (percent: number, message?: string, data?: unknown) => void;
  step: (current: number, total: number, message?: string) => void;
  log: (message: string, data?: unknown) => void;
}

export interface ContextProviderOptions {
  logCallback?: LogCallback;
  progressCallback?: (message: string, percent?: number, data?: unknown) => void;
  seed?: string | number;
  customProviders?: Record<string, unknown>;
}

/**
 * Create progress reporter for scripts
 */
function createProgressReporter(
  callback?: (message: string, percent?: number, data?: unknown) => void
): ProgressReporter {
  return {
    report: (percent: number, message = '', data = null) => {
      const clampedPercent = Math.max(0, Math.min(100, percent));
      callback?.(message || `Progress: ${clampedPercent}%`, clampedPercent, data);
    },
    step: (current: number, total: number, message = '') => {
      const percent = (current / total) * 100;
      const stepMessage = message || `Step ${current} of ${total}`;
      callback?.(stepMessage, percent, null);
    },
    log: (message: string, data = null) => {
      callback?.(message, undefined, data);
    },
  };
}

/**
 * Create all context providers for Synthase execution
 */
export async function createContextProviders(
  options: ContextProviderOptions = {}
): Promise<ContextProviders> {
  const {
    logCallback,
    progressCallback,
    seed,
    customProviders = {},
  } = options;

  // Initialize schematic provider (async - may load WASM)
  const SchematicClass = await initializeSchematicProvider();

  const nucleation = await import('nucleation');
  
  // Wrap prototype methods for better error messages
  // @ts-ignore
  wrapPrototypeMethods(SchematicClass, 'Schematic');
  // @ts-ignore
  wrapPrototypeMethods(nucleation.SchematicBuilderWrapper, 'Schematic.SchematicBuilder');
  // @ts-ignore
  wrapPrototypeMethods(nucleation.ExecutionModeWrapper, 'Schematic.ExecutionMode');
  // @ts-ignore
  wrapPrototypeMethods(nucleation.BlockPosition, 'Schematic.BlockPosition');
  // @ts-ignore
  wrapPrototypeMethods(nucleation.DefinitionRegionWrapper, 'Schematic.DefinitionRegion');

    // @ts-ignore
  (SchematicClass as any).SchematicBuilder = wrapWasmClass(nucleation.SchematicBuilderWrapper, 'Schematic.SchematicBuilder');
  // @ts-ignore
  (SchematicClass as any).ExecutionMode = wrapWasmClass(nucleation.ExecutionModeWrapper, 'Schematic.ExecutionMode');
    // @ts-ignore
  (SchematicClass as any).BlockPosition = wrapWasmClass(nucleation.BlockPosition, 'Schematic.BlockPosition');
      // @ts-ignore
  (SchematicClass as any).DefinitionRegion = wrapWasmClass(nucleation.DefinitionRegionWrapper, 'Schematic.DefinitionRegion');

  console.log('⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡');
  console.log('Schematic provider initialized with Nucleation WASM.');
  console.log('nucleation available export keys:', Object.keys(nucleation));
  console.log('⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡');
  
  // Create providers
  const Logger = createLogger(logCallback);
  const Noise = createNoiseProvider(seed);
  const Progress = createProgressReporter(progressCallback);

  // Assemble context providers
  const contextProviders: ContextProviders = {
    // Core utilities
    Calculator,
    Easing,
    Logger,
    Noise,
    Progress,
    
    // Vector math
    Vec: VectorUtils,
    Vec2: VectorUtils.Vec2,
    Vec3: VectorUtils.Vec3,
    
    // Schematic operations
    Schematic: SchematicClass,
    SchematicUtils,
    
    // Pathfinding
    Pathfinding,
    
    // Math constants and methods
    Math: Object.assign({}, Math, {
      TAU: Math.PI * 2,
    }),
    
    // Spread custom providers last so they can override defaults
    ...customProviders,
  };

  return contextProviders;
}

/**
 * Create minimal context providers (no async initialization)
 * Useful for validation or quick operations
 */
export function createMinimalContextProviders(
  options: Omit<ContextProviderOptions, 'logCallback' | 'progressCallback'> = {}
): ContextProviders {
  const { seed, customProviders = {} } = options;

  const Noise = createNoiseProvider(seed);

  return {
    Calculator,
    Easing,
    Noise,
    Vec: VectorUtils,
    Vec2: VectorUtils.Vec2,
    Vec3: VectorUtils.Vec3,
    Math: Object.assign({}, Math, {
      TAU: Math.PI * 2,
    }),
    ...customProviders,
  };
}

/**
 * Helper to wrap WASM classes and provide better error messages
 */
function wrapWasmClass(Class: any, name: string) {
  if (!Class) return Class;

  const handler: ProxyHandler<any> = {
    construct(target, args) {
      args.forEach((arg, i) => {
        if (arg === undefined || arg === null) {
          throw new Error(`${name} constructor: Argument ${i} cannot be null or undefined`);
        }
      });
      try {
        return new target(...args);
      } catch (err) {
        const error = err as Error;
        throw new Error(`${name} constructor failed: ${error.message}`);
      }
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      
      // Wrap static methods
      if (typeof value === 'function' && typeof prop === 'string' && !['prototype', 'name', 'length', 'toString'].includes(prop)) {
        return function(this: any, ...args: any[]) {
          args.forEach((arg, i) => {
            if (arg === undefined || arg === null) {
              throw new Error(`${name}.${prop}: Argument ${i} cannot be null or undefined`);
            }
          });
          try {
            return value.apply(this, args);
          } catch (err) {
            const error = err as Error;
            if (error.message?.includes('null pointer')) {
               throw new Error(`${name}.${prop} failed: Null pointer passed to Rust. This usually means an argument was invalid or a WASM object was already freed.`);
            }
            throw new Error(`${name}.${prop} failed: ${error.message}`);
          }
        };
      }
      return value;
    }
  };

  return new Proxy(Class, handler);
}

/**
 * Helper to wrap prototype methods of WASM classes
 */
function wrapPrototypeMethods(Class: any, name: string) {
  if (!Class || !Class.prototype) return;

  const proto = Class.prototype;
  const props = Object.getOwnPropertyNames(proto);
  
  for (const prop of props) {
    // Use getOwnPropertyDescriptor to avoid triggering getters
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (!descriptor || !descriptor.value) continue;

    const value = descriptor.value;
    if (typeof value === 'function' && prop !== 'constructor') {
      proto[prop] = function(this: any, ...args: any[]) {
        args.forEach((arg, i) => {
          if (arg === undefined || arg === null) {
            throw new Error(`${name}.${prop}: Argument ${i} cannot be null or undefined`);
          }
        });
        try {
          return value.apply(this, args);
        } catch (err) {
          const error = err as Error;
          if (error.message?.includes('null pointer')) {
             throw new Error(`${name}.${prop} failed: Null pointer passed to Rust. This usually means an argument was invalid or a WASM object was already freed.`);
          }
          throw new Error(`${name}.${prop} failed: ${error.message}`);
        }
      };
    }
  }
}

