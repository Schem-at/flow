/**
 * MessageHandler - Handles worker-side message processing
 * Used by both browser WebWorkers and Bun Worker Threads
 */

import { MESSAGE_TYPES, type MessageType, type WorkerMessage, type SchematicData, type DataHandle, type DataValue, type DataFormat } from '../types/index.js';
import { SynthaseService } from '../services/SynthaseService.js';
import { createContextProviders } from './contextProviders.js';
import { workerDataStore, type StoreDataOptions, type SerializeOptions } from './WorkerDataStore.js';
import { processInputSchematics } from '../utils/schematic.js';
import type { IODefinition } from '../types/index.js';

export interface MessageHandlerOptions {
  postMessage: (message: WorkerMessage) => void;
  postProgress: (message: string, percent?: number, data?: unknown) => void;
}

/**
 * MessageHandler processes messages from the main thread
 */
export class MessageHandler {
  private synthaseService: SynthaseService | null = null;
  private isInitialized = false;
  private currentExecution: { cancelled: boolean } | null = null;
  private postMessage: (message: WorkerMessage) => void;
  private postProgress: (message: string, percent?: number, data?: unknown) => void;

  constructor(options: MessageHandlerOptions) {
    this.postMessage = options.postMessage;
    this.postProgress = options.postProgress;
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(data: WorkerMessage): Promise<void> {
    const { type, payload, id } = data;

    try {
      let result: unknown;

      switch (type) {
        case MESSAGE_TYPES.INITIALIZE:
          result = await this.handleInitialize(payload as InitializePayload);
          this.sendMessage(MESSAGE_TYPES.INITIALIZE_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.EXECUTE_SCRIPT:
          result = await this.handleExecuteScript(payload as ExecuteScriptPayload);
          this.sendMessage(MESSAGE_TYPES.EXECUTION_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.EXECUTE_FLOW:
          result = await this.handleExecuteSubflow(payload as ExecuteSubflowPayload);
          this.sendMessage(MESSAGE_TYPES.EXECUTION_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.VALIDATE_SCRIPT:
          result = await this.handleValidateScript(payload as ValidateScriptPayload);
          this.sendMessage(MESSAGE_TYPES.VALIDATION_RESULT, result, id);
          break;

        case MESSAGE_TYPES.GET_CONTEXT_PROVIDERS:
          result = this.handleGetContextProviders();
          this.sendMessage(MESSAGE_TYPES.CONTEXT_PROVIDERS_RESULT, result, id);
          break;

        case MESSAGE_TYPES.CANCEL_EXECUTION:
          result = this.handleCancelExecution();
          this.sendMessage(MESSAGE_TYPES.EXECUTION_CANCELLED, result, id);
          break;

        // Data store operations
        case MESSAGE_TYPES.STORE_DATA:
          result = this.handleStoreData(payload as StoreDataPayload);
          this.sendMessage(MESSAGE_TYPES.STORE_DATA_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.GET_DATA:
          result = this.handleGetData(payload as GetDataPayload);
          this.sendMessage(MESSAGE_TYPES.GET_DATA_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.GET_PREVIEW:
          result = this.handleGetPreview(payload as GetDataPayload);
          this.sendMessage(MESSAGE_TYPES.GET_PREVIEW_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.RELEASE_DATA:
          result = this.handleReleaseData(payload as ReleaseDataPayload);
          this.sendMessage(MESSAGE_TYPES.RELEASE_DATA_SUCCESS, result, id);
          break;

        case MESSAGE_TYPES.LIST_HANDLES:
          result = this.handleListHandles();
          this.sendMessage(MESSAGE_TYPES.LIST_HANDLES_SUCCESS, result, id);
          break;

        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      const err = error as Error;
      this.sendMessage(MESSAGE_TYPES.ERROR, err.message, id);
    }
  }

  /**
   * Handle initialization
   */
  private async handleInitialize(payload: InitializePayload): Promise<InitializeResult> {
    if (this.isInitialized) {
      return { status: 'already_initialized' };
    }

    try {
      const contextProviders = await createContextProviders({
        logCallback: (entry) => {
          this.postProgress(`Log: ${entry.message}`, undefined, entry);
        },
        progressCallback: (message, percent, data) => {
          this.sendMessage(MESSAGE_TYPES.EXECUTION_PROGRESS, { message, percent, data });
        },
        customProviders: payload.customContextProviders || {},
      });

      this.synthaseService = new SynthaseService(contextProviders);
      this.isInitialized = true;

      return {
        status: 'initialized',
        contextProviders: Object.keys(contextProviders),
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(`Worker initialization failed: ${err.message}`);
    }
  }

  /**
   * Handle script execution
   * 
   * If options.returnHandles is true, schematic outputs are stored in the
   * WorkerDataStore and handles are returned instead of serialized data.
   * This allows efficient passing of WASM objects between code nodes.
   */
  private async handleExecuteScript(payload: ExecuteScriptPayload): Promise<ExecuteScriptResult> {
    if (!this.isInitialized || !this.synthaseService) {
      throw new Error('Service not initialized');
    }

    const { code, inputs, options } = payload;
    const returnHandles = options?.returnHandles ?? false;

    // Cancel any previous execution
    if (this.currentExecution) {
      this.currentExecution.cancelled = true;
    }

    // Create execution tracker
    this.currentExecution = { cancelled: false };
    const executionId = this.currentExecution;

    this.postProgress('Starting script execution...');

    try {
      const executionOptions = {
        ...options,
        timeout: options?.timeout || 60000,
      };

      if (executionId.cancelled) {
        throw new Error('Execution cancelled');
      }

      // Resolve any handles in inputs to actual WASM objects
      const resolvedInputs = this.resolveHandleInputs(inputs);
      
      // Also convert any serialized SchematicData to WASM objects
      // This handles the case where data was serialized for a viewer but also goes to a code node
      const processedInputs = await processInputSchematics(resolvedInputs);
      
      // Debug: Log what we're passing to the script
      console.log('[Worker] Final inputs for script execution:');
      for (const [key, value] of Object.entries(processedInputs)) {
        const type = value?.constructor?.name || typeof value;
        const hasMethod = value && typeof value === 'object' && typeof (value as any).get_tight_dimensions === 'function';
        console.log(`  ${key}: type=${type}, has_get_tight_dimensions=${hasMethod}`);
      }

      const executionResult = await this.synthaseService.executeScript(
        code,
        processedInputs,
        executionOptions
      );

      if (executionId.cancelled) {
        throw new Error('Execution cancelled');
      }

      if (executionResult.success) {
        this.postProgress('Script executed successfully');

        let processedSchematics = null;
        let schematicHandles: Record<string, string> | undefined = undefined;

        if (executionResult.hasSchematic && executionResult.schematics) {
          // Always store handles - they're useful for downstream code nodes
          schematicHandles = this.storeSchematicsAsHandles(executionResult.schematics);
          
          if (!returnHandles) {
            // Also serialize for transfer (for viewers that need the actual data)
            processedSchematics = await this.processSchematicsForTransfer(
              executionResult.schematics
            );
          }
        }

        this.currentExecution = null;

        return {
          success: true,
          result: executionResult.result,
          schematics: processedSchematics,
          schematicHandles,
          executionTime: executionResult.executionTime,
        };
      } else {
        this.currentExecution = null;
        throw new Error(executionResult.error?.message || 'Unknown execution error');
      }
    } catch (error) {
      this.currentExecution = null;
      const err = error as Error;
      this.postProgress('Execution failed: ' + err.message);
      throw error;
    }
  }

  /**
   * Store schematic WASM objects in the data store and return handle IDs
   */
  private storeSchematicsAsHandles(schematics: Record<string, unknown>): Record<string, string> {
    const handleIds: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(schematics)) {
      if (this.isSchematicWrapper(value)) {
        const handle = workerDataStore.store(value, 'schem', {
          name: key,
          pinned: true, // Keep in memory for subsequent nodes
        });
        handleIds[key] = handle.id;
      }
    }
    
    return handleIds;
  }

  /**
   * Resolve any DataHandle inputs to actual WASM objects from the store
   */
  private resolveHandleInputs(inputs: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    

    
    for (const [key, value] of Object.entries(inputs)) {
      console.log(`[Worker] Resolving input "${key}":`, typeof value, value);
      
      if (this.isDataHandle(value)) {
        // Resolve handle to actual WASM object
        console.log(`[Worker] Found DataHandle, resolving id: ${value.id}`);
        const data = workerDataStore.get(value.id);
        if (data) {
          console.log(`[Worker] Resolved DataHandle to:`, typeof data, data?.constructor?.name);
          resolved[key] = data;
        } else {
          console.warn(`Handle ${value.id} not found in data store`);
          resolved[key] = value;
        }
      } else if (this.isSchematicHandle(value)) {
        // Resolve _schematicHandle format from client
        console.log(`[Worker] Found _schematicHandle, resolving id: ${value._schematicHandle}`);
        const data = workerDataStore.get(value._schematicHandle);
        if (data) {
          console.log(`[Worker] Resolved _schematicHandle to:`, typeof data, data?.constructor?.name);
          resolved[key] = data;
        } else {
          console.warn(`Schematic handle ${value._schematicHandle} not found in data store`);
          resolved[key] = value;
        }
      } else if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        // Don't recurse into typed arrays or ArrayBuffers - preserve them as-is
        resolved[key] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively resolve nested objects (but not typed arrays)
        console.log(`[Worker] Recursively resolving nested object for "${key}"`);
        resolved[key] = this.resolveHandleInputs(value as Record<string, unknown>);
      } else {
        resolved[key] = value;
      }
    }
    
    console.log('[Worker] resolveHandleInputs result:', Object.keys(resolved));
    return resolved;
  }

  /**
   * Check if a value is a DataHandle
   */
  private isDataHandle(value: unknown): value is DataHandle {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.id === 'string' && 
           typeof obj.category === 'string' && 
           typeof obj.format === 'string';
  }

  /**
   * Check if a value is a schematic handle reference (simpler format from client)
   */
  private isSchematicHandle(value: unknown): value is { _schematicHandle: string } {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj._schematicHandle === 'string';
  }

  /**
   * Handle subflow execution - executes multiple nodes within the worker
   * without crossing worker boundaries between nodes. This keeps WASM objects
   * in memory and only serializes at the final output.
   */
  private async handleExecuteSubflow(payload: ExecuteSubflowPayload): Promise<ExecuteSubflowResult> {
    if (!this.isInitialized || !this.synthaseService) {
      throw new Error('Service not initialized');
    }

    const { nodes, edges, inputs, outputNodeIds, options } = payload;
    const startTime = performance.now();

    // Cancel any previous execution
    if (this.currentExecution) {
      this.currentExecution.cancelled = true;
    }
    this.currentExecution = { cancelled: false };
    const executionId = this.currentExecution;

    this.postProgress('Starting subflow execution...');

    try {
      // Store outputs for each node (including WASM objects)
      const nodeOutputs = new Map<string, Record<string, unknown>>();

      // Process initial inputs (convert SchematicData to WASM if needed)
      const processedInputs = await processInputSchematics(inputs);

      // Topological sort to get execution order
      const executionOrder = this.getSubflowExecutionOrder(nodes, edges);

      // Initialize input nodes with their values
      for (const node of nodes) {
        if (node.type?.includes('input') && !node.type?.includes('schematic')) {
          const externalValue = processedInputs[node.id];
          if (externalValue !== undefined) {
            nodeOutputs.set(node.id, { default: externalValue });
          } else if (node.data.value !== undefined) {
            nodeOutputs.set(node.id, { default: node.data.value });
          }
        }
      }

      // Execute code nodes in order
      for (const node of executionOrder) {
        if (executionId.cancelled) {
          throw new Error('Execution cancelled');
        }

        if (node.type === 'code' && node.data.code) {
          this.postProgress(`Executing node: ${node.data.label || node.id}`);

          // Gather inputs from connected nodes
          const codeInputs: Record<string, unknown> = {};
          const incomingEdges = edges.filter(e => e.target === node.id);

          console.log(`[Subflow] Node ${node.id} incoming edges:`, incomingEdges.map(e => ({
            source: e.source,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle
          })));

          for (const edge of incomingEdges) {
            const srcOutput = nodeOutputs.get(edge.source);
            console.log(`[Subflow] Edge ${edge.source} -> ${node.id}: srcOutput =`, 
              srcOutput ? Object.keys(srcOutput) : 'NOT FOUND');
            
            if (srcOutput) {
              const inputName = edge.targetHandle || 'default';
              const outputKey = edge.sourceHandle || inputName;
              let val = srcOutput[outputKey];
              if (val === undefined && Object.keys(srcOutput).length === 1) {
                val = srcOutput[Object.keys(srcOutput)[0]];
              }
              console.log(`[Subflow] Mapping ${outputKey} -> ${inputName}:`, 
                val && typeof val === 'object' ? `[${val.constructor?.name || typeof val}]` : val);
              codeInputs[inputName] = val;
            }
          }

          console.log(`[Subflow] Executing ${node.id} with inputs:`, Object.keys(codeInputs));

          // Execute the script (within the same worker, no serialization)
          const result = await this.synthaseService.executeScript(
            node.data.code,
            codeInputs,
            { timeout: options?.timeout || 60000 }
          );

          console.log(`[Subflow] ${node.id} result:`, {
            success: result.success,
            hasSchematic: result.hasSchematic,
            resultKeys: result.result ? Object.keys(result.result) : [],
            schematicKeys: result.schematics ? Object.keys(result.schematics) : []
          });

          if (!result.success) {
            throw Object.assign(new Error(result.error?.message || 'Script execution failed'), {
              nodeId: node.id
            });
          }

          // Store outputs - keep WASM objects as-is (no serialization!)
          const nodeResult: Record<string, unknown> = {};
          
          // If there are schematics in the result, include them directly
          if (result.hasSchematic && result.schematics) {
            for (const [key, value] of Object.entries(result.schematics)) {
              if (value) nodeResult[key] = value;
            }
          }
          
          // Also include any other result values
          if (result.result) {
            for (const [key, value] of Object.entries(result.result)) {
              if (!(key in nodeResult)) {
                nodeResult[key] = value;
              }
            }
          }

          // Ensure there's a default output
          if (Object.keys(nodeResult).length === 1 && !('default' in nodeResult)) {
            nodeResult['default'] = nodeResult[Object.keys(nodeResult)[0]];
          }

          nodeOutputs.set(node.id, nodeResult);
        }
      }

      // Collect final outputs from output nodes
      const finalOutputs: Record<string, unknown> = {};
      const finalSchematics: Record<string, unknown> = {};

      for (const outputId of outputNodeIds) {
        // Find edges leading to this output node
        const outputEdge = edges.find(e => e.target === outputId);
        if (outputEdge) {
          const srcOutput = nodeOutputs.get(outputEdge.source);
          if (srcOutput) {
            // Try to get a single value - prefer 'default', then single key, then sourceHandle
            let value: unknown;
            const sourceKey = outputEdge.sourceHandle || 'default';
            
            if (sourceKey in srcOutput) {
              value = srcOutput[sourceKey];
            } else if ('default' in srcOutput) {
              value = srcOutput['default'];
            } else {
              const keys = Object.keys(srcOutput);
              value = keys.length === 1 ? srcOutput[keys[0]] : srcOutput;
            }
            
            finalOutputs[outputId] = value;

            // Check if it's a schematic (could be direct or nested)
            if (this.isSchematicWrapper(value)) {
              finalSchematics[outputId] = value;
            } else if (value && typeof value === 'object') {
              // Check for schematics in nested object
              for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                if (this.isSchematicWrapper(v)) {
                  finalSchematics[`${outputId}_${k}`] = v;
                  // Also use this as the main output if it's the only schematic
                  if (!finalSchematics[outputId]) {
                    finalSchematics[outputId] = v;
                    finalOutputs[outputId] = v;
                  }
                }
              }
            }
          }
        }
      }

      // Add default output if there's only one
      if (Object.keys(finalOutputs).length === 1 && !('default' in finalOutputs)) {
        const key = Object.keys(finalOutputs)[0];
        finalOutputs['default'] = finalOutputs[key];
        if (finalSchematics[key]) {
          finalSchematics['default'] = finalSchematics[key];
        }
      }

      // Only serialize schematics at the final output boundary
      let processedSchematics = null;
      if (Object.keys(finalSchematics).length > 0) {
        processedSchematics = await this.processSchematicsForTransfer(finalSchematics);
      }

      const executionTime = Math.round(performance.now() - startTime);
      this.currentExecution = null;
      this.postProgress(`Subflow completed in ${executionTime}ms`);

      return {
        success: true,
        outputs: finalOutputs,
        schematics: processedSchematics,
        executionTime,
      };
    } catch (error) {
      this.currentExecution = null;
      const err = error as Error & { nodeId?: string };
      this.postProgress('Subflow execution failed: ' + err.message);
      return {
        success: false,
        outputs: {},
        error: { message: err.message, nodeId: err.nodeId },
      };
    }
  }

  /**
   * Check if value is a SchematicWrapper (nucleation WASM object)
   */
  private isSchematicWrapper(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.to_schematic === 'function' || 
           typeof obj.set_block === 'function' ||
           '__wbg_ptr' in obj;
  }

  /**
   * Topological sort for subflow execution order
   */
  private getSubflowExecutionOrder(nodes: SubflowNode[], edges: SubflowEdge[]): SubflowNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    // Build graph
    for (const edge of edges) {
      const targets = adjacency.get(edge.source) || [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: SubflowNode[] = [];

    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = nodeMap.get(id);
      if (node) result.push(node);

      for (const target of adjacency.get(id) || []) {
        const newDegree = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, newDegree);
        if (newDegree === 0) queue.push(target);
      }
    }

    return result;
  }

  /**
   * Handle script validation
   */
  private async handleValidateScript(payload: ValidateScriptPayload): Promise<IODefinition | null> {
    if (!this.isInitialized || !this.synthaseService) {
      return null;
    }

    try {
      const validation = await this.synthaseService.validateScript(payload.code);
      return validation.valid ? (validation.io ?? null) : null;
    } catch (error) {
      console.warn('Validation failed:', error);
      return null;
    }
  }

  /**
   * Handle getting context providers
   */
  private handleGetContextProviders(): Record<string, unknown> {
    if (!this.isInitialized || !this.synthaseService) {
      return {};
    }
    return this.synthaseService.getContextProviders() || {};
  }

  /**
   * Handle execution cancellation
   */
  private handleCancelExecution(): { cancelled: boolean; message?: string } {
    if (this.currentExecution) {
      this.currentExecution.cancelled = true;
      this.postProgress('Execution cancelled by user');
      return { cancelled: true };
    }
    return { cancelled: false, message: 'No execution in progress' };
  }

  // ==========================================================================
  // Data Store Operations
  // ==========================================================================

  /**
   * Store data in the worker and return a handle
   */
  private handleStoreData(payload: StoreDataPayload): DataHandle {
    const { value, format, options } = payload;
    return workerDataStore.store(value, format, options);
  }

  /**
   * Get serialized data from a handle
   */
  private handleGetData(payload: GetDataPayload): DataValue | null {
    const { handleId, options } = payload;
    return workerDataStore.serialize(handleId, { fullData: true, ...options });
  }

  /**
   * Get a preview of data from a handle (may be lower quality/smaller)
   */
  private handleGetPreview(payload: GetDataPayload): DataValue | null {
    const { handleId, options } = payload;
    return workerDataStore.serialize(handleId, { fullData: false, ...options });
  }

  /**
   * Release a data handle
   */
  private handleReleaseData(payload: ReleaseDataPayload): { released: boolean } {
    const released = workerDataStore.release(payload.handleId);
    return { released };
  }

  /**
   * List all data handles
   */
  private handleListHandles(): { handles: DataHandle[]; stats: ReturnType<typeof workerDataStore.stats> } {
    return {
      handles: workerDataStore.list(),
      stats: workerDataStore.stats(),
    };
  }

  /**
   * Send a message to the main thread
   */
  private sendMessage(type: MessageType, payload: unknown, id?: number): void {
    this.postMessage({ type, payload, id });
  }

  /**
   * Process schematics for transfer to main thread.
   * Serializes SchematicWrapper WASM objects to SchematicData objects
   * since WASM objects cannot be transferred across worker boundaries.
   */
  private async processSchematicsForTransfer(
    schematics: Record<string, unknown>
  ): Promise<Record<string, SchematicData>> {
    const processed: Record<string, SchematicData> = {};

    for (const [key, schematic] of Object.entries(schematics)) {
      try {
        const schem = schematic as { to_schematic?: () => Uint8Array; name?: () => string };
        
        if (!schem) continue;

        // Serialize to binary using to_schematic()
        if (typeof schem.to_schematic === 'function') {
          const binaryData = schem.to_schematic();
          
          // Wrap in SchematicData for proper typing
          // to_schematic() outputs .schem format (Sponge schematic)
          processed[key] = {
            format: 'schem',
            data: binaryData,
            metadata: {
              name: typeof schem.name === 'function' ? schem.name() : key,
            }
          };
          
          this.postProgress(`Serialized schematic: ${key} (${binaryData.byteLength} bytes)`);
        }
      } catch (error) {
        console.error(`Failed to serialize schematic ${key}:`, error);
      }
    }

    return processed;
  }
}

// Payload types
interface InitializePayload {
  customContextProviders?: Record<string, unknown>;
}

interface InitializeResult {
  status: string;
  contextProviders?: string[];
}

interface ExecuteScriptPayload {
  code: string;
  inputs: Record<string, unknown>;
  options?: {
    timeout?: number;
    /** When true, returns handles for schematics instead of serialized data */
    returnHandles?: boolean;
  };
}

interface ExecuteScriptResult {
  success: boolean;
  result?: Record<string, unknown>;
  schematics?: Record<string, SchematicData> | null;
  /** Handles to schematics stored in worker (when returnHandles is true) */
  schematicHandles?: Record<string, string>;
  executionTime?: number;
}

interface ValidateScriptPayload {
  code: string;
}

// Data store payload types
interface StoreDataPayload {
  value: unknown;
  format: DataFormat;
  options?: StoreDataOptions;
}

interface GetDataPayload {
  handleId: string;
  options?: SerializeOptions;
}

interface ReleaseDataPayload {
  handleId: string;
}

// Subflow execution types
interface SubflowNode {
  id: string;
  type: string;
  data: {
    code?: string;
    value?: unknown;
    label?: string;
  };
}

interface SubflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ExecuteSubflowPayload {
  nodes: SubflowNode[];
  edges: SubflowEdge[];
  inputs: Record<string, unknown>;
  outputNodeIds: string[];
  options?: {
    timeout?: number;
  };
}

interface ExecuteSubflowResult {
  success: boolean;
  outputs: Record<string, unknown>;
  schematics?: Record<string, SchematicData> | null;
  executionTime?: number;
  error?: { message: string; nodeId?: string };
}

