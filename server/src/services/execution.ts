/**
 * API Execution Service
 * Handles flow execution with run tracking, TTL, and cleanup
 */

import { eq, and, lt, inArray } from 'drizzle-orm';
import { 
  db, 
  flows, 
  flowApis, 
  runs, 
  runArtifacts,
  type NewRun,
  type NewRunArtifact,
  type RunRecord,
} from '../db/index.js';
import type { FlowData } from '@flow/core';
import type {
  Run,
  RunStatus,
  RunError,
  RunArtifact,
  NodeRunResult,
  RunLog,
  ExecuteOptions,
} from 'shared';

// Lazy import for the engine
let PolymeraseEngine: typeof import('@flow/core').PolymeraseEngine;
let createContextProviders: typeof import('@flow/core').createContextProviders;

async function loadEngine() {
  if (!PolymeraseEngine) {
    const core = await import('@flow/core');
    PolymeraseEngine = core.PolymeraseEngine;
    createContextProviders = core.createContextProviders;
  }
}

/**
 * Service for executing flows and managing runs
 */
export class ExecutionService {
  private static instance: ExecutionService;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): ExecutionService {
    if (!ExecutionService.instance) {
      ExecutionService.instance = new ExecutionService();
    }
    return ExecutionService.instance;
  }

  /**
   * Start the cleanup scheduler for expired runs
   */
  startCleanupScheduler(intervalMs: number = 60000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRuns().catch(console.error);
    }, intervalMs);

    // Run once immediately
    this.cleanupExpiredRuns().catch(console.error);
  }

  /**
   * Stop the cleanup scheduler
   */
  stopCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up expired runs and their artifacts
   */
  async cleanupExpiredRuns(): Promise<number> {
    const now = new Date();
    
    // Find expired runs
    const expiredRuns = await db.select({ id: runs.id })
      .from(runs)
      .where(
        and(
          lt(runs.expiresAt, now),
          inArray(runs.status, ['completed', 'failed', 'cancelled', 'timeout'])
        )
      );

    if (expiredRuns.length === 0) return 0;

    const expiredIds = expiredRuns.map(r => r.id);

    // Delete artifacts first (foreign key)
    await db.delete(runArtifacts)
      .where(inArray(runArtifacts.runId, expiredIds));

    // Update runs to expired status and clear data
    await db.update(runs)
      .set({
        status: 'expired',
        outputs: null,
        nodeResults: null,
        logs: null,
      })
      .where(inArray(runs.id, expiredIds));

    console.log(`[Cleanup] Expired ${expiredRuns.length} runs`);
    return expiredRuns.length;
  }

  /**
   * Create a new run record
   */
  async createRun(
    flowId: string,
    inputs: Record<string, unknown>,
    options: {
      flowApiId?: string;
      apiKeyId?: string;
      clientIp?: string;
      userAgent?: string;
      ttl?: number;
    } = {}
  ): Promise<string> {
    const runId = crypto.randomUUID();
    const now = new Date();
    const ttl = options.ttl || 3600;
    const expiresAt = new Date(now.getTime() + ttl * 1000);

    const newRun: NewRun = {
      id: runId,
      flowId,
      flowApiId: options.flowApiId,
      apiKeyId: options.apiKeyId,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      status: 'pending',
      createdAt: now,
      ttl,
      expiresAt,
      inputs: JSON.stringify(inputs),
    };

    await db.insert(runs).values(newRun);
    return runId;
  }

  /**
   * Update run status
   */
  async updateRunStatus(
    runId: string,
    status: RunStatus,
    updates: {
      progress?: number;
      currentNode?: string;
      outputs?: Record<string, unknown>;
      error?: RunError;
      nodeResults?: Record<string, NodeRunResult>;
      logs?: RunLog[];
      executionTimeMs?: number;
    } = {}
  ): Promise<void> {
    const updateData: Partial<RunRecord> = {
      status,
    };

    if (status === 'running' && !updates.progress) {
      updateData.startedAt = new Date();
    }

    if (['completed', 'failed', 'cancelled', 'timeout'].includes(status)) {
      updateData.completedAt = new Date();
    }

    if (updates.progress !== undefined) updateData.progress = updates.progress;
    if (updates.currentNode !== undefined) updateData.currentNode = updates.currentNode;
    if (updates.outputs !== undefined) updateData.outputs = JSON.stringify(updates.outputs);
    if (updates.error !== undefined) updateData.error = JSON.stringify(updates.error);
    if (updates.nodeResults !== undefined) updateData.nodeResults = JSON.stringify(updates.nodeResults);
    if (updates.logs !== undefined) updateData.logs = JSON.stringify(updates.logs);
    if (updates.executionTimeMs !== undefined) updateData.executionTimeMs = updates.executionTimeMs;

    await db.update(runs)
      .set(updateData)
      .where(eq(runs.id, runId));
  }

  /**
   * Add artifacts to a run
   */
  async addArtifacts(runId: string, artifacts: Omit<RunArtifact, 'id'>[]): Promise<void> {
    const now = new Date();
    
    const newArtifacts: NewRunArtifact[] = artifacts.map(a => ({
      id: crypto.randomUUID(),
      runId,
      name: a.name,
      type: a.type,
      format: a.format,
      size: a.size,
      data: a.data,
      createdAt: now,
    }));

    if (newArtifacts.length > 0) {
      await db.insert(runArtifacts).values(newArtifacts);
    }
  }

  /**
   * Get a run by ID
   */
  async getRun(runId: string): Promise<Run | null> {
    const record = await db.select().from(runs).where(eq(runs.id, runId)).get();
    
    if (!record) return null;

    // Get artifacts
    const artifacts = await db.select()
      .from(runArtifacts)
      .where(eq(runArtifacts.runId, runId));

    return this.recordToRun(record, artifacts);
  }

  /**
   * List runs with pagination
   */
  async listRuns(options: {
    flowId?: string;
    flowApiId?: string;
    status?: RunStatus[];
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ runs: Run[]; total: number }> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let query = db.select().from(runs);

    // Apply filters
    const conditions = [];
    if (options.flowId) conditions.push(eq(runs.flowId, options.flowId));
    if (options.flowApiId) conditions.push(eq(runs.flowApiId, options.flowApiId));
    if (options.status && options.status.length > 0) {
      conditions.push(inArray(runs.status, options.status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Get total count (simplified - in production use COUNT query)
    const allResults = await query;
    const total = allResults.length;

    // Get paginated results
    const results = allResults.slice(offset, offset + pageSize);

    // Convert to Run objects (without artifacts for list view)
    const runsList = results.map(r => this.recordToRun(r, []));

    return { runs: runsList, total };
  }

  /**
   * Execute a flow synchronously
   */
  async executeFlowSync(
    flow: FlowData,
    inputs: Record<string, unknown>,
    options: ExecuteOptions & {
      runId?: string;
      apiKeyId?: string;
      clientIp?: string;
      userAgent?: string;
      flowApiId?: string;
    } = {}
  ): Promise<Run> {
    await loadEngine();

    // Create or use existing run
    const runId = options.runId || await this.createRun(flow.id, inputs, {
      flowApiId: options.flowApiId,
      apiKeyId: options.apiKeyId,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      ttl: options.ttl,
    });

    const logs: RunLog[] = [];
    const nodeResults: Record<string, NodeRunResult> = {};

    try {
      // Update status to running
      await this.updateRunStatus(runId, 'running');

      // Map input node values to the flow
      const flowWithInputs = this.mapInputsToFlow(flow, inputs);

      // Set up the engine
      const contextProviders = await createContextProviders({
        logCallback: (entry) => {
          logs.push({
            timestamp: Date.now(),
            level: entry.level as 'debug' | 'info' | 'warn' | 'error',
            message: entry.message,
          });
        },
      });

      const engine = new PolymeraseEngine({
        contextProviders,
        timeout: options.timeout || 60000,
      });

      // Track node progress
      const totalNodes = flow.nodes.filter(n => n.type !== 'comment').length;
      let completedNodes = 0;

      engine.events.on('node:start', async (e) => {
        nodeResults[e.nodeId] = {
          nodeId: e.nodeId,
          status: 'running',
          startedAt: Date.now(),
        };
        
        await this.updateRunStatus(runId, 'running', {
          currentNode: e.nodeId,
          progress: Math.round((completedNodes / totalNodes) * 100),
        });
      });

      engine.events.on('node:finish', (e) => {
        completedNodes++;
        const nodeResult = nodeResults[e.nodeId];
        if (nodeResult) {
          nodeResult.status = 'completed';
          nodeResult.completedAt = Date.now();
          nodeResult.output = e.output;
          nodeResult.executionTimeMs = 
            (nodeResult.completedAt || 0) - (nodeResult.startedAt || 0);
        }
      });

      engine.events.on('node:error', (e) => {
        const nodeResult = nodeResults[e.nodeId];
        if (nodeResult) {
          nodeResult.status = 'failed';
          nodeResult.completedAt = Date.now();
          nodeResult.error = {
            code: e.error.type || 'EXECUTION_ERROR',
            message: e.error.message,
            nodeId: e.nodeId,
            stack: e.error.stack,
          };
        }
      });

      // Execute the flow
      const startTime = Date.now();
      const result = await engine.executeFlow(flowWithInputs);
      const executionTimeMs = Date.now() - startTime;

      // Clean up
      engine.destroy();

      // Process artifacts (schematics, files, etc.) and build serializable outputs
      const artifacts: Omit<RunArtifact, 'id'>[] = [];
      const processedOutputs: Record<string, unknown> = {};
      
      if (result.finalOutput) {
        for (const [key, value] of Object.entries(result.finalOutput)) {
          // Check for schematic wrapper objects
          if (value && typeof value === 'object' && 'to_schematic' in value) {
            const wrapper = value as { to_schematic: () => Uint8Array };
            try {
              const bytes = wrapper.to_schematic();
              artifacts.push({
                name: key,
                type: 'schematic',
                format: 'schem',
                size: bytes.length,
                data: Buffer.from(bytes).toString('base64'),
              });
              // Convert to SchematicData format for the outputs
              processedOutputs[key] = {
                format: 'schem',
                data: Buffer.from(bytes).toString('base64'),
                metadata: {
                  name: key,
                  fileSize: bytes.length,
                },
              };
            } catch (err) {
              console.error(`Failed to convert schematic "${key}":`, err);
              processedOutputs[key] = value;
            }
          } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
            const bytes = value instanceof Uint8Array ? value : new Uint8Array((value as ArrayBufferView).buffer);
            artifacts.push({
              name: key,
              type: 'data',
              format: 'binary',
              size: bytes.length,
              data: Buffer.from(bytes).toString('base64'),
            });
            // Store as base64 in outputs
            processedOutputs[key] = {
              format: 'binary',
              data: Buffer.from(bytes).toString('base64'),
              metadata: {
                name: key,
                fileSize: bytes.length,
              },
            };
          } else {
            // Pass through other values unchanged
            processedOutputs[key] = value;
          }
        }
      }

      // Add artifacts
      if (artifacts.length > 0) {
        await this.addArtifacts(runId, artifacts);
      }

      // Update run with results
      if (result.status === 'completed') {
        await this.updateRunStatus(runId, 'completed', {
          progress: 100,
          outputs: processedOutputs,
          nodeResults,
          logs,
          executionTimeMs,
        });
      } else if (result.status === 'error') {
        const errorNode = Object.entries(result.nodeStates).find(([, s]) => s.error);
        await this.updateRunStatus(runId, 'failed', {
          error: errorNode?.[1].error ? {
            code: 'EXECUTION_FAILED',
            message: errorNode[1].error.message,
            nodeId: errorNode[0],
            stack: errorNode[1].error.stack,
          } : {
            code: 'EXECUTION_FAILED',
            message: 'Flow execution failed',
          },
          nodeResults,
          logs,
          executionTimeMs,
        });
      } else if (result.status === 'cancelled') {
        await this.updateRunStatus(runId, 'cancelled', {
          nodeResults,
          logs,
          executionTimeMs,
        });
      }

      // Return the updated run
      return (await this.getRun(runId))!;

    } catch (error) {
      const err = error as Error;
      
      // Check if it's a timeout
      const isTimeout = err.message.includes('timeout') || err.message.includes('timed out');
      
      await this.updateRunStatus(runId, isTimeout ? 'timeout' : 'failed', {
        error: {
          code: isTimeout ? 'EXECUTION_TIMEOUT' : 'EXECUTION_FAILED',
          message: err.message,
          stack: err.stack,
        },
        logs,
        nodeResults,
      });

      return (await this.getRun(runId))!;
    }
  }

  /**
   * Execute a flow asynchronously (returns immediately)
   */
  async executeFlowAsync(
    flow: FlowData,
    inputs: Record<string, unknown>,
    options: ExecuteOptions & {
      apiKeyId?: string;
      clientIp?: string;
      userAgent?: string;
      flowApiId?: string;
    } = {}
  ): Promise<{ runId: string; statusUrl: string; resultUrl: string }> {
    // Create the run
    const runId = await this.createRun(flow.id, inputs, {
      flowApiId: options.flowApiId,
      apiKeyId: options.apiKeyId,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      ttl: options.ttl,
    });

    // Start execution in background
    // Note: In a production system, this would be a job queue
    this.executeFlowSync(flow, inputs, { ...options, runId }).then(async (run) => {
      // Call webhook if specified
      if (options.webhook && ['completed', 'failed', 'timeout'].includes(run.status)) {
        try {
          await fetch(options.webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run }),
          });
        } catch (err) {
          console.error(`Webhook call failed for run ${runId}:`, err);
        }
      }
    }).catch(console.error);

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    
    return {
      runId,
      statusUrl: `${baseUrl}/api/v1/runs/${runId}`,
      resultUrl: `${baseUrl}/api/v1/runs/${runId}/result`,
    };
  }

  /**
   * Cancel a running execution
   */
  async cancelRun(runId: string): Promise<boolean> {
    const run = await db.select().from(runs).where(eq(runs.id, runId)).get();
    
    if (!run) return false;
    if (!['pending', 'running'].includes(run.status)) return false;

    await this.updateRunStatus(runId, 'cancelled');
    return true;
  }

  /**
   * Map API inputs to flow input nodes
   */
  private mapInputsToFlow(flow: FlowData, inputs: Record<string, unknown>): FlowData {
    const mappedNodes = flow.nodes.map(node => {
      // Check if this is an input node
      if (!['input', 'static_input', 'number_input', 'text_input', 'boolean_input', 'select_input'].includes(node.type)) {
        return node;
      }

      // Skip constant inputs
      if (node.data.config?.isConstant) {
        return node;
      }

      const label = node.data.label || node.id;
      
      // Check if we have an input value for this node
      if (label in inputs) {
        return {
          ...node,
          data: {
            ...node.data,
            value: inputs[label],
          },
        };
      }

      return node;
    });

    return {
      ...flow,
      nodes: mappedNodes,
    };
  }

  /**
   * Convert database record to Run object
   */
  private recordToRun(record: RunRecord, artifactRecords: typeof runArtifacts.$inferSelect[]): Run {
    return {
      id: record.id,
      flowId: record.flowId,
      flowApiId: record.flowApiId || undefined,
      apiKeyId: record.apiKeyId || undefined,
      clientIp: record.clientIp || undefined,
      userAgent: record.userAgent || undefined,
      status: record.status as RunStatus,
      progress: record.progress || undefined,
      currentNode: record.currentNode || undefined,
      createdAt: record.createdAt?.getTime() || Date.now(),
      startedAt: record.startedAt?.getTime(),
      completedAt: record.completedAt?.getTime(),
      ttl: record.ttl,
      expiresAt: record.expiresAt?.getTime(),
      inputs: record.inputs ? JSON.parse(record.inputs) : {},
      outputs: record.outputs ? JSON.parse(record.outputs) : undefined,
      error: record.error ? JSON.parse(record.error) : undefined,
      nodeResults: record.nodeResults ? JSON.parse(record.nodeResults) : undefined,
      logs: record.logs ? JSON.parse(record.logs) : undefined,
      executionTimeMs: record.executionTimeMs || undefined,
      artifacts: artifactRecords.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type as 'schematic' | 'image' | 'data' | 'file',
        format: a.format,
        size: a.size,
        data: a.data || undefined,
      })),
    };
  }
}

// Export singleton instance
export const executionService = ExecutionService.getInstance();
