/**
 * Execution API routes
 *
 * User code (scripts and flows) is NEVER executed on the main server thread:
 * every execution runs in a one-shot Bun worker via runInExecutionWorker,
 * which hard-kills the worker on timeout or failure.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, flows, executions, schematics, type NewExecution, type NewSchematic } from '../db/index.js';
import type { FlowData } from '@flow/core';
import { getFoldedFlow } from '../services/flowFolding.js';
import {
  runInExecutionWorker,
  EXECUTION_WORKER_GRACE_MS,
  type FlowWorkerResult,
  type ScriptWorkerResult,
} from '../services/workerExecutor.js';

const executeRouter = new Hono();

/**
 * POST /api/execute - Execute a flow (JSON body)
 */
executeRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { flowData, flowId } = body;

    let flow: FlowData;

    // Either use provided flowData or load from database
    if (flowData) {
      flow = flowData;
    } else if (flowId) {
      const storedFlow = await db.select().from(flows).where(eq(flows.id, flowId)).get();
      if (!storedFlow) {
        return c.json({ success: false, error: 'Flow not found' }, 404);
      }
      flow = JSON.parse(storedFlow.jsonContent);
    } else {
      return c.json({ success: false, error: 'Either flowData or flowId is required' }, 400);
    }

    // Create execution record
    const executionId = crypto.randomUUID();
    const now = new Date();

    const newExecution: NewExecution = {
      id: executionId,
      flowId: flow.id,
      status: 'running',
      startedAt: now,
    };

    await db.insert(executions).values(newExecution);

    // Track logs streamed from the worker
    const timeout = 60000;
    const logs: string[] = [];

    // Fold the graph into a single script (cached by content hash) — the
    // worker falls back to the per-node engine if folding was skipped/fails.
    const fold = getFoldedFlow(flow);
    if (fold.folded) {
      logs.push(
        `⚡ Folded flow ${fold.folded.hash} (${fold.cached ? 'cache hit' : 'compiled'}, ${fold.folded.nodeOrder.length} blocks)`
      );
    } else if (fold.reason) {
      logs.push(`ℹ Folding skipped: ${fold.reason} — using per-node engine`);
    }

    let result: FlowWorkerResult;
    try {
      result = await runInExecutionWorker<FlowWorkerResult>(
        {
          kind: 'flow',
          flow,
          timeout,
          folded: fold.folded
            ? {
                source: fold.folded.source,
                hash: fold.folded.hash,
                nodeOrder: fold.folded.nodeOrder,
              }
            : undefined,
          inputs: (body as { inputs?: Record<string, unknown> }).inputs,
        },
        {
          timeoutMs: timeout + EXECUTION_WORKER_GRACE_MS,
          onEvent: (event) => {
            const payload = event.payload as Record<string, any>;
            switch (event.event) {
              case 'node:start':
                logs.push(`▶ Node ${payload.nodeId} started`);
                break;
              case 'node:finish':
                logs.push(`✓ Node ${payload.nodeId} finished`);
                break;
              case 'node:error':
                logs.push(`✗ Node ${payload.nodeId} error: ${payload.error?.message}`);
                break;
              case 'progress':
                logs.push(`📊 ${payload.message}`);
                break;
              // 'log' entries are already echoed to the server console by the worker
            }
          },
        }
      );
    } catch (error) {
      // Worker crash, hard timeout, or kill — record the failure and rethrow
      // to preserve the route's 500 error contract.
      const err = error as Error;
      await db.update(executions)
        .set({
          status: 'error',
          completedAt: new Date(),
          error: err.message,
        })
        .where(eq(executions.id, executionId));
      throw err;
    }

    // Update execution record
    await db.update(executions)
      .set({
        status: result.status,
        completedAt: new Date(),
        result: JSON.stringify(result.resultSnapshot),
        error: result.status === 'error' ? result.errorNode?.message ?? null : null,
      })
      .where(eq(executions.id, executionId));

    // Save any generated schematics and build serializable outputs
    // (binary conversion already happened inside the worker)
    const processedOutputs: Record<string, unknown> = {};
    for (const output of result.outputs) {
      if ((output.kind === 'schem' || output.kind === 'binary') && output.base64) {
        const schematicId = crypto.randomUUID();
        const newSchematic: NewSchematic = {
          id: schematicId,
          name: output.key,
          flowId: flow.id,
          executionId,
          format: 'schem',
          data: output.base64,
          createdAt: new Date(),
        };
        await db.insert(schematics).values(newSchematic);
        processedOutputs[output.key] = {
          format: output.kind === 'schem' ? 'schem' : 'binary',
          data: output.base64,
          metadata: {
            name: output.key,
            fileSize: output.size,
          },
        };
      } else {
        processedOutputs[output.key] = output.value;
      }
    }

    return c.json({
      success: result.status === 'completed',
      executionId,
      status: result.status,
      logs,
      result: processedOutputs,
      executionTime: result.endTime ? result.endTime - result.startTime : null,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Execution error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/execute/script - Execute a single script (not a full flow)
 */
executeRouter.post('/script', async (c) => {
  try {
    const body = await c.req.json();
    const { code, inputs = {}, timeout = 60000 } = body;

    if (!code) {
      return c.json({ success: false, error: 'Code is required' }, 400);
    }

    console.log('[Execute] Running script with inputs:', inputs);

    // Execute in a killable one-shot worker. Schematic outputs are already
    // converted to base64 inside the worker.
    const result = await runInExecutionWorker<ScriptWorkerResult>(
      { kind: 'script', code, inputs, timeout },
      { timeoutMs: timeout + EXECUTION_WORKER_GRACE_MS }
    );

    console.log('[Execute] Result:', {
      success: result.success,
      hasSchematic: result.hasSchematic,
      resultKeys: result.result ? Object.keys(result.result) : [],
      schematicKeys: result.schematics ? Object.keys(result.schematics) : [],
    });

    return c.json({
      success: result.success,
      result: result.result,
      schematics: result.schematics,
      hasSchematic: result.hasSchematic,
      executionTime: result.executionTime,
      error: result.error,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Script execution error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/execute/validate - Validate a script
 */
executeRouter.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { code } = body;

    if (!code) {
      return c.json({ success: false, error: 'Code is required' }, 400);
    }

    // Validation may evaluate user code (module import for IO schema), so it
    // also runs in a killable worker, never on the main thread.
    const validation = await runInExecutionWorker<{
      valid: boolean;
      io?: unknown;
      dependencies?: string[];
      error?: string;
    }>({ kind: 'validate', code }, { timeoutMs: 30000 + EXECUTION_WORKER_GRACE_MS });

    return c.json({
      success: true,
      valid: validation.valid,
      io: validation.io,
      dependencies: validation.dependencies,
      error: validation.error,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Validation error:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/executions - List executions (optionally filtered by flowId)
 */
executeRouter.get('/executions', async (c) => {
  try {
    const flowId = c.req.query('flowId');

    let query = db.select().from(executions);

    if (flowId) {
      query = query.where(eq(executions.flowId, flowId)) as typeof query;
    }

    const results = await query;

    return c.json({
      success: true,
      executions: results.map(e => ({
        ...e,
        result: e.result ? JSON.parse(e.result) : null,
      })),
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/executions/:id - Get a single execution
 */
executeRouter.get('/executions/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const execution = await db.select().from(executions).where(eq(executions.id, id)).get();

    if (!execution) {
      return c.json({ success: false, error: 'Execution not found' }, 404);
    }

    // Also get any associated schematics
    const schematicResults = await db.select()
      .from(schematics)
      .where(eq(schematics.executionId, id));

    return c.json({
      success: true,
      execution: {
        ...execution,
        result: execution.result ? JSON.parse(execution.result) : null,
      },
      schematics: schematicResults,
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default executeRouter;
