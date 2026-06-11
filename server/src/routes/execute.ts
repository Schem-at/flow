/**
 * Execution API routes
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, flows, executions, schematics, type NewExecution, type NewSchematic } from '../db/index.js';
import type { FlowData } from '@flow/core';

// Lazy import for the engine to allow optional dependency
let PolymeraseEngine: typeof import('@flow/core').PolymeraseEngine;
let createContextProviders: typeof import('@flow/core').createContextProviders;

async function loadEngine() {
  if (!PolymeraseEngine) {
    const core = await import('@flow/core');
    PolymeraseEngine = core.PolymeraseEngine;
    createContextProviders = core.createContextProviders;
  }
}

const executeRouter = new Hono();

/**
 * POST /api/execute - Execute a flow (JSON body)
 */
executeRouter.post('/', async (c) => {
  try {
    await loadEngine();
    
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

    // Set up the engine with context providers
    const contextProviders = await createContextProviders({
      logCallback: (entry) => {
        console.log(`[${entry.level}] ${entry.message}`);
      },
    });

    const engine = new PolymeraseEngine({
      contextProviders,
      timeout: 60000,
    });

    // Track logs
    const logs: string[] = [];
    engine.events.on('node:start', (e) => logs.push(`▶ Node ${e.nodeId} started`));
    engine.events.on('node:finish', (e) => logs.push(`✓ Node ${e.nodeId} finished`));
    engine.events.on('node:error', (e) => logs.push(`✗ Node ${e.nodeId} error: ${e.error.message}`));
    engine.events.on('progress', (e) => logs.push(`📊 ${e.message}`));

    // Execute the flow
    const result = await engine.executeFlow(flow);

    // Update execution record
    await db.update(executions)
      .set({
        status: result.status,
        completedAt: new Date(),
        result: JSON.stringify(result),
        error: result.status === 'error' 
          ? Object.values(result.nodeStates).find(s => s.error)?.error?.message 
          : null,
      })
      .where(eq(executions.id, executionId));

    // Save any generated schematics and build serializable outputs
    const processedOutputs: Record<string, unknown> = {};
    if (result.finalOutput) {
      for (const [key, value] of Object.entries(result.finalOutput)) {
        // Check for schematic wrapper objects (WASM)
        if (value && typeof value === 'object' && 'to_schematic' in value) {
          const wrapper = value as { to_schematic: () => Uint8Array };
          try {
            const bytes = wrapper.to_schematic();
            const schematicId = crypto.randomUUID();
            const newSchematic: NewSchematic = {
              id: schematicId,
              name: key,
              flowId: flow.id,
              executionId,
              format: 'schem',
              data: Buffer.from(bytes).toString('base64'),
              createdAt: new Date(),
            };
            await db.insert(schematics).values(newSchematic);
            // Convert to SchematicData format for the response
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
          const schematicId = crypto.randomUUID();
          const newSchematic: NewSchematic = {
            id: schematicId,
            name: key,
            flowId: flow.id,
            executionId,
            format: 'schem',
            data: Buffer.from(value as Uint8Array).toString('base64'),
            createdAt: new Date(),
          };
          await db.insert(schematics).values(newSchematic);
          processedOutputs[key] = {
            format: 'binary',
            data: Buffer.from(value as Uint8Array).toString('base64'),
            metadata: {
              name: key,
              fileSize: (value as Uint8Array).length,
            },
          };
        } else {
          processedOutputs[key] = value;
        }
      }
    }

    // Clean up
    engine.destroy();

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
    await loadEngine();
    
    const body = await c.req.json();
    const { code, inputs = {}, timeout = 60000 } = body;

    if (!code) {
      return c.json({ success: false, error: 'Code is required' }, 400);
    }

    console.log('[Execute] Running script with inputs:', inputs);

    // Set up the engine
    const contextProviders = await createContextProviders({
      logCallback: (entry) => {
        console.log(`[Script] [${entry.level}] ${entry.message}`);
      },
    });

    const engine = new PolymeraseEngine({
      contextProviders,
      timeout,
    });

    // Execute the script
    const result = await engine.executeScript(code, inputs);

    // Clean up
    engine.destroy();

    console.log('[Execute] Result:', {
      success: result.success,
      hasSchematic: result.hasSchematic,
      resultKeys: result.result ? Object.keys(result.result) : [],
      schematicKeys: result.schematics ? Object.keys(result.schematics) : [],
    });

    // Process result - convert schematic objects to base64
    const schematicData: Record<string, string> = {};

    // Check the result object for schematic wrapper instances
    if (result.result) {
      for (const [key, value] of Object.entries(result.result)) {
        // Check if the value is a schematic wrapper (has to_schematic method)
        if (value && typeof value === 'object' && 'to_schematic' in value) {
          const wrapper = value as { to_schematic: () => Uint8Array };
          try {
            const bytes = wrapper.to_schematic();
            schematicData[key] = Buffer.from(bytes).toString('base64');
            console.log(`[Execute] Converted schematic "${key}" to base64 (${bytes.length} bytes)`);
          } catch (err) {
            console.error(`[Execute] Failed to convert schematic "${key}":`, err);
          }
        }
      }
    }

    // Also check the schematics field if it exists
    if (result.schematics) {
      for (const [key, schem] of Object.entries(result.schematics)) {
        if (schem && typeof schem === 'object' && 'to_schematic' in schem) {
          const wrapper = schem as { to_schematic: () => Uint8Array };
          try {
            const bytes = wrapper.to_schematic();
            schematicData[key] = Buffer.from(bytes).toString('base64');
            console.log(`[Execute] Converted schematic "${key}" from schematics field to base64 (${bytes.length} bytes)`);
          } catch (err) {
            console.error(`[Execute] Failed to convert schematic from schematics field "${key}":`, err);
          }
        } else if (schem instanceof Uint8Array || ArrayBuffer.isView(schem)) {
          const bytes = schem instanceof Uint8Array ? schem : new Uint8Array((schem as ArrayBufferView).buffer);
          schematicData[key] = Buffer.from(bytes).toString('base64');
        }
      }
    }

    // Build response result without schematic wrapper objects
    const processedResult: Record<string, unknown> = {};
    if (result.result) {
      for (const [key, value] of Object.entries(result.result)) {
        if (value && typeof value === 'object' && 'to_schematic' in value) {
          // Skip schematic wrappers in result (they're in schematics field)
          processedResult[key] = '[Schematic Object]';
        } else {
          processedResult[key] = value;
        }
      }
    }

    const hasSchematic = Object.keys(schematicData).length > 0;

    return c.json({
      success: result.success,
      result: processedResult,
      schematics: hasSchematic ? schematicData : null,
      hasSchematic,
      executionTime: result.executionTime,
      error: result.error?.message,
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
    await loadEngine();
    
    const body = await c.req.json();
    const { code } = body;

    if (!code) {
      return c.json({ success: false, error: 'Code is required' }, 400);
    }

    const contextProviders = await createContextProviders();
    const engine = new PolymeraseEngine({ contextProviders });

    const validation = await engine.validateScript(code);
    engine.destroy();

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

