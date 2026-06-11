/**
 * SynthaseService - Core execution service for Synthase scripts
 * Works in both browser and Node/Bun environments
 */

import type { ExecutionResult, IODefinition } from '../types/index.js';
import { EXECUTION_LIMITS } from '../utils/constants.js';
import { processInputSchematics } from '../utils/schematic.js';

export interface SynthaseOptions {
  timeout?: number;
  maxRecursionDepth?: number;
  maxImportedScripts?: number;
}

export interface ValidationResult {
  valid: boolean;
  io?: IODefinition;
  dependencies?: string[];
  error?: string;
}

export interface ReusableExecutor {
  execute: (inputs?: Record<string, unknown>) => Promise<ExecutionResult>;
  io: IODefinition;
}

/**
 * Context providers available to scripts
 */
export type ContextProviders = Record<string, unknown>;

/**
 * SynthaseService handles script execution and validation
 * using the Synthase sandboxed JavaScript engine
 */
export class SynthaseService {
  private contextProviders: ContextProviders;
  private synthaseModule: SynthaseModule | null = null;
  private initialized = false;

  /**
   * Create a new SynthaseService
   * @param contextProviders - Pre-assembled object of tools to provide to scripts
   */
  constructor(contextProviders: ContextProviders = {}) {
    this.contextProviders = contextProviders;
  }

  /**
   * Lazily load the synthase module
   */
  private async getSynthase(): Promise<SynthaseModule> {
    if (this.synthaseModule) {
      return this.synthaseModule;
    }

    try {
      const synthase = await import('@flow/synthase');
      this.synthaseModule = synthase as SynthaseModule;
      this.initialized = true;
      return this.synthaseModule;
    } catch (error) {
      throw new Error(`Failed to load synthase module: ${(error as Error).message}`);
    }
  }

  /**
   * Check if value is a SchematicWrapper (nucleation WASM object)
   */
  private isSchematicWrapper(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    
    const obj = value as Record<string, unknown>;
    
    // Check for SchematicWrapper methods or WASM pointer
    return typeof obj.to_schematic === 'function' || 
           typeof obj.set_block === 'function' ||
           '__wbg_ptr' in obj;
  }

  /**
   * Execute a synthase script with given inputs
   * @param scriptContent - The script code
   * @param inputs - Input parameters
   * @param options - Execution options
   */
  async executeScript(
    scriptContent: string,
    inputs: Record<string, unknown> = {},
    options: SynthaseOptions = {}
  ): Promise<ExecutionResult> {
    const {
      timeout = EXECUTION_LIMITS.DEFAULT_TIMEOUT,
      maxRecursionDepth = EXECUTION_LIMITS.MAX_RECURSION_DEPTH,
      maxImportedScripts = EXECUTION_LIMITS.MAX_IMPORTED_SCRIPTS,
    } = options;

    try {
      const startTime = performance.now();
      
      // Process inputs to convert SchematicData back to SchematicWrapper
      // This allows scripts to receive WASM objects even when data was serialized for transfer
      const processedInputs = await processInputSchematics(inputs);

      const synthase = await this.getSynthase();

      const result = await synthase.execute(scriptContent, processedInputs, {
        contextProviders: this.contextProviders,
        limits: {
          timeout,
          maxRecursionDepth,
          maxImportedScripts,
        },
      });

      const executionTime = Math.round(performance.now() - startTime);

      // Find any returned values that are schematics
      const schematics: Record<string, unknown> = {};
      
      // Check if the result itself is a schematic (direct return)
      if (this.isSchematicWrapper(result)) {
        schematics['default'] = result;
      } else {
        // Check each property of the result object
        for (const [key, value] of Object.entries(result)) {
          if (this.isSchematicWrapper(value)) {
            schematics[key] = value;
          }
        }
      }

      return {
        success: true,
        result,
        schematics: schematics as ExecutionResult['schematics'],
        hasSchematic: Object.keys(schematics).length > 0,
        executionTime,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: {
          message: err.message,
          type: err.name || 'SynthaseExecutionError',
          stack: err.stack,
        },
      };
    }
  }

  /**
   * Validate a script without executing it
   * @param scriptContent - The script code to validate
   */
  async validateScript(scriptContent: string): Promise<ValidationResult> {
    try {
      const synthase = await this.getSynthase();
      
      const validation = await synthase.validate(scriptContent, {
        contextProviders: this.contextProviders,
      });
      
      return {
        valid: true,
        io: validation.io as IODefinition,
        dependencies: validation.dependencies || [],
      };
    } catch (error) {
      const err = error as Error;
      return {
        valid: false,
        error: err.message,
      };
    }
  }

  /**
   * Create a reusable script executor for performance
   * @param scriptContent - The script code
   */
  async createReusableExecutor(scriptContent: string): Promise<{ success: boolean; executor?: ReusableExecutor; error?: string }> {
    try {
      const synthase = await this.getSynthase();
      
      const reusable = await synthase.createReusable(scriptContent, {
        contextProviders: this.contextProviders,
      });
      
      return {
        success: true,
        executor: reusable as unknown as ReusableExecutor,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get the current context providers
   */
  getContextProviders(): ContextProviders {
    return { ...this.contextProviders };
  }

  /**
   * Add or update context providers
   */
  setContextProviders(providers: ContextProviders): void {
    this.contextProviders = { ...this.contextProviders, ...providers };
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Type definitions for synthase module (since it may not have types)
interface SynthaseModule {
  execute: (
    code: string,
    inputs: Record<string, unknown>,
    options: {
      contextProviders: ContextProviders;
      limits?: {
        timeout?: number;
        maxRecursionDepth?: number;
        maxImportedScripts?: number;
      };
    }
  ) => Promise<Record<string, unknown>>;
  
  validate: (
    code: string,
    options: { contextProviders: ContextProviders }
  ) => Promise<{ io: unknown; dependencies?: string[] }>;
  
  createReusable: (
    code: string,
    options: { contextProviders: ContextProviders }
  ) => Promise<unknown>;
}

export default SynthaseService;

