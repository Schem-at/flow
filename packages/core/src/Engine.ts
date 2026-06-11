/**
 * PolymeraseEngine - The main orchestrator for flow execution
 * Manages the graph, events, and dependencies
 */

import mitt, { type Emitter } from 'mitt';
import type {
  FlowData,
  NodeData,
  EdgeData,
  EngineEvents,
  FlowExecutionState,
  NodeExecutionState,
  ExecutionResult,
  ExecutionError,
} from './types/index.js';
import { SynthaseService, type ContextProviders } from './services/SynthaseService.js';

export interface EngineOptions {
  contextProviders?: ContextProviders;
  timeout?: number;
}

/**
 * Topologically sort nodes based on edge dependencies
 */
function topologicalSort(nodes: NodeData[], edges: EdgeData[]): NodeData[] {
  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const nodeMap = new Map<string, NodeData>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const deps = adjacency.get(edge.source);
    if (deps) {
      deps.push(edge.target);
    }
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: NodeData[] = [];

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      result.push(node);
    }

    const deps = adjacency.get(nodeId) || [];
    for (const depId of deps) {
      const newDegree = (inDegree.get(depId) || 1) - 1;
      inDegree.set(depId, newDegree);
      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  // Check for cycles
  if (result.length !== nodes.length) {
    throw new Error('Flow contains a cycle - cannot execute');
  }

  return result;
}

/**
 * Get input connections for a node
 */
function getNodeInputs(nodeId: string, edges: EdgeData[]): Map<string, { sourceId: string; sourceHandle?: string }> {
  const inputs = new Map<string, { sourceId: string; sourceHandle?: string }>();
  
  for (const edge of edges) {
    if (edge.target === nodeId) {
      const inputHandle = edge.targetHandle || 'default';
      inputs.set(inputHandle, {
        sourceId: edge.source,
        sourceHandle: edge.sourceHandle,
      });
    }
  }
  
  return inputs;
}

/**
 * PolymeraseEngine - Main execution engine
 */
export class PolymeraseEngine {
  public events: Emitter<EngineEvents>;
  private service: SynthaseService;
  private currentExecution: FlowExecutionState | null = null;
  private cancelled = false;
  private options: EngineOptions;

  constructor(options: EngineOptions = {}) {
    this.events = mitt<EngineEvents>();
    this.options = options;
    this.service = new SynthaseService(options.contextProviders || {});
  }

  /**
   * Initialize the engine with context providers
   */
  async initialize(contextProviders: ContextProviders): Promise<void> {
    this.service.setContextProviders(contextProviders);
    this.events.emit('worker:ready', {});
  }

  /**
   * Get the SynthaseService instance
   */
  getService(): SynthaseService {
    return this.service;
  }

  /**
   * Execute a complete flow
   */
  async executeFlow(flow: FlowData): Promise<FlowExecutionState> {
    this.cancelled = false;
    
    // Initialize execution state
    const executionState: FlowExecutionState = {
      flowId: flow.id,
      status: 'running',
      startTime: Date.now(),
      nodeStates: {},
    };

    // Initialize all node states
    for (const node of flow.nodes) {
      executionState.nodeStates[node.id] = {
        status: 'pending',
      };
    }

    this.currentExecution = executionState;
    this.events.emit('flow:start', { flowId: flow.id });

    try {
      // Sort nodes topologically
      const sortedNodes = topologicalSort(flow.nodes, flow.edges);
      
      // Store outputs from each node
      const nodeOutputs = new Map<string, Record<string, unknown>>();

      // Execute each node in order
      for (const node of sortedNodes) {
        if (this.cancelled) {
          executionState.status = 'cancelled';
          this.events.emit('flow:cancelled', { flowId: flow.id });
          return executionState;
        }

        const nodeState = await this.executeNode(node, flow.edges, nodeOutputs);
        executionState.nodeStates[node.id] = nodeState;

        if (nodeState.status === 'error') {
          executionState.status = 'error';
          this.events.emit('flow:error', {
            flowId: flow.id,
            error: nodeState.error!,
          });
          return executionState;
        }

        // Store output for downstream nodes
        if (nodeState.output) {
          nodeOutputs.set(node.id, nodeState.output as Record<string, unknown>);
        }
      }

      // Collect final outputs only from explicit output nodes (not viewers or other terminal nodes)
      const outputNodes = flow.nodes.filter(n => 
        n.type === 'output' || n.type === 'file_output' || n.type === 'schematic_output'
      );

      const finalOutput: Record<string, unknown> = {};
      for (const node of outputNodes) {
        const output = nodeOutputs.get(node.id);
        if (output) {
          // Use the node's label as the key, skip 'default' to avoid duplication
          const label = node.data.label || 'output';
          const value = output[label] ?? output['default'] ?? output[Object.keys(output)[0]];
          if (value !== undefined && value !== null) {
            finalOutput[label] = value;
          }
        }
      }

      executionState.status = 'completed';
      executionState.endTime = Date.now();
      executionState.finalOutput = finalOutput;

      this.events.emit('flow:finish', {
        flowId: flow.id,
        result: executionState,
      });

      return executionState;

    } catch (error) {
      const err = error as Error;
      const executionError: ExecutionError = {
        message: err.message,
        type: err.name,
        stack: err.stack,
      };

      executionState.status = 'error';
      executionState.endTime = Date.now();

      this.events.emit('flow:error', {
        flowId: flow.id,
        error: executionError,
      });

      return executionState;
    } finally {
      this.currentExecution = null;
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: NodeData,
    edges: EdgeData[],
    nodeOutputs: Map<string, Record<string, unknown>>
  ): Promise<NodeExecutionState> {
    const nodeState: NodeExecutionState = {
      status: 'running',
      startTime: Date.now(),
    };

    this.events.emit('node:start', {
      nodeId: node.id,
      flowId: this.currentExecution?.flowId || '',
    });

    try {
      let result: ExecutionResult;

      switch (node.type) {
        case 'code': {
          // Get inputs from connected nodes
          const inputConnections = getNodeInputs(node.id, edges);
          const inputs: Record<string, unknown> = {};

          for (const [handleId, connection] of inputConnections) {
            const sourceOutput = nodeOutputs.get(connection.sourceId);
            if (sourceOutput) {
              const outputKey = connection.sourceHandle || 'default';
              inputs[handleId] = sourceOutput[outputKey] ?? sourceOutput;
            }
          }

          // Execute the script
          const code = node.data.code || '';
          result = await this.service.executeScript(code, inputs, {
            timeout: this.options.timeout,
          });
          break;
        }

        case 'input':
        case 'static_input':
        case 'number_input':
        case 'text_input':
        case 'boolean_input': {
          // Input nodes just pass through their value
          // Use 'output' as handle name to match the UI edge connections
          result = {
            success: true,
            result: { output: node.data.value, default: node.data.value },
          };
          break;
        }

        case 'schematic_input': {
          // Schematic input nodes provide schematic data
          result = {
            success: true,
            result: { schematic: node.data.value, output: node.data.value },
          };
          break;
        }

        case 'comment': {
          // Comment nodes are skipped
          nodeState.status = 'skipped';
          nodeState.endTime = Date.now();
          return nodeState;
        }

        case 'output': {
          // Output nodes pass through their input data for final output collection
          const inputConnections = getNodeInputs(node.id, edges);
          const inputs: Record<string, unknown> = {};

          for (const [handleId, connection] of inputConnections) {
            const sourceOutput = nodeOutputs.get(connection.sourceId);
            if (sourceOutput) {
              const outputKey = connection.sourceHandle || 'default';
              inputs[handleId] = sourceOutput[outputKey] ?? sourceOutput;
            }
          }

          // Use the label as the output key
          const outputKey = node.data.label || 'output';
          const inputValue = inputs['default'] ?? inputs[Object.keys(inputs)[0]] ?? null;

          result = {
            success: true,
            result: inputValue !== null ? { [outputKey]: inputValue } : {},
          };
          break;
        }

        case 'viewer': {
          // Viewer nodes just pass through for display, not included in final output
          const inputConnections = getNodeInputs(node.id, edges);
          const inputs: Record<string, unknown> = {};

          for (const [handleId, connection] of inputConnections) {
            const sourceOutput = nodeOutputs.get(connection.sourceId);
            if (sourceOutput) {
              const outputKey = connection.sourceHandle || 'default';
              inputs[handleId] = sourceOutput[outputKey] ?? sourceOutput;
            }
          }

          const inputValue = inputs['default'] ?? inputs[Object.keys(inputs)[0]] ?? null;
          result = {
            success: true,
            result: inputValue !== null ? { default: inputValue } : {},
          };
          break;
        }

        case 'file_output':
        case 'schematic_output': {
          // File/schematic output nodes pass through their input
          const inputConnections = getNodeInputs(node.id, edges);
          const inputs: Record<string, unknown> = {};

          for (const [handleId, connection] of inputConnections) {
            const sourceOutput = nodeOutputs.get(connection.sourceId);
            if (sourceOutput) {
              const outputKey = connection.sourceHandle || 'default';
              inputs[handleId] = sourceOutput[outputKey] ?? sourceOutput;
            }
          }

          const outputKey = node.data.label || (node.data as Record<string, unknown>).filename as string || 'output';
          const inputValue = inputs['default'] ?? inputs['schematic'] ?? inputs[Object.keys(inputs)[0]] ?? null;

          result = {
            success: true,
            result: inputValue !== null ? { [outputKey]: inputValue } : {},
          };
          break;
        }

        default: {
          // Unknown node type - pass through
          result = {
            success: true,
            result: node.data.value ? { default: node.data.value } : {},
          };
        }
      }

      if (result.success) {
        nodeState.status = 'completed';
        nodeState.output = result.result;
        nodeState.endTime = Date.now();

        this.events.emit('node:finish', {
          nodeId: node.id,
          flowId: this.currentExecution?.flowId || '',
          output: result.result,
        });
      } else {
        nodeState.status = 'error';
        nodeState.error = result.error;
        nodeState.endTime = Date.now();

        this.events.emit('node:error', {
          nodeId: node.id,
          flowId: this.currentExecution?.flowId || '',
          error: result.error!,
        });
      }

      return nodeState;

    } catch (error) {
      const err = error as Error;
      nodeState.status = 'error';
      nodeState.error = {
        message: err.message,
        type: err.name,
        stack: err.stack,
        nodeId: node.id,
      };
      nodeState.endTime = Date.now();

      this.events.emit('node:error', {
        nodeId: node.id,
        flowId: this.currentExecution?.flowId || '',
        error: nodeState.error,
      });

      return nodeState;
    }
  }

  /**
   * Execute a single script directly (without flow context)
   */
  async executeScript(
    code: string,
    inputs: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    return this.service.executeScript(code, inputs, {
      timeout: this.options.timeout,
    });
  }

  /**
   * Validate a script
   */
  async validateScript(code: string) {
    return this.service.validateScript(code);
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.cancelled = true;
    if (this.currentExecution) {
      this.events.emit('flow:cancelled', { flowId: this.currentExecution.flowId });
    }
  }

  /**
   * Check if execution is in progress
   */
  isExecuting(): boolean {
    return this.currentExecution !== null;
  }

  /**
   * Get current execution state
   */
  getCurrentExecution(): FlowExecutionState | null {
    return this.currentExecution;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.cancel();
    this.events.all.clear();
  }
}

export default PolymeraseEngine;

