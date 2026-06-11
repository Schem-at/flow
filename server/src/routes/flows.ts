/**
 * Flow API routes
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, flows, type NewFlow } from '../db/index.js';

const flowsRouter = new Hono();

/**
 * GET /api/flows - List all flows
 */
flowsRouter.get('/', async (c) => {
  try {
    const allFlows = await db.select({
      id: flows.id,
      name: flows.name,
      version: flows.version,
      createdAt: flows.createdAt,
      updatedAt: flows.updatedAt,
      metadata: flows.metadata,
    }).from(flows);

    return c.json({
      success: true,
      flows: allFlows.map(f => ({
        ...f,
        metadata: f.metadata ? JSON.parse(f.metadata) : null,
      })),
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/flows/:id - Get a single flow
 */
flowsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const flow = await db.select().from(flows).where(eq(flows.id, id)).get();

    if (!flow) {
      return c.json({ success: false, error: 'Flow not found' }, 404);
    }

    return c.json({
      success: true,
      flow: {
        ...flow,
        jsonContent: JSON.parse(flow.jsonContent),
        metadata: flow.metadata ? JSON.parse(flow.metadata) : null,
      },
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/flows - Create a new flow
 */
flowsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { name, version = '1.0.0', nodes = [], edges = [], metadata } = body;

    if (!name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const flowData = {
      id,
      name,
      version,
      nodes,
      edges,
      createdAt: now.getTime(),
      metadata,
    };

    const newFlow: NewFlow = {
      id,
      name,
      version,
      jsonContent: JSON.stringify(flowData),
      createdAt: now,
      metadata: metadata ? JSON.stringify(metadata) : null,
    };

    await db.insert(flows).values(newFlow);

    return c.json({
      success: true,
      flow: flowData,
    }, 201);
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * PUT /api/flows/:id - Update a flow
 */
flowsRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, version, nodes, edges, metadata } = body;

    const existing = await db.select().from(flows).where(eq(flows.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: 'Flow not found' }, 404);
    }

    const existingData = JSON.parse(existing.jsonContent);
    const now = new Date();

    const updatedData = {
      ...existingData,
      name: name ?? existingData.name,
      version: version ?? existingData.version,
      nodes: nodes ?? existingData.nodes,
      edges: edges ?? existingData.edges,
      updatedAt: now.getTime(),
      metadata: metadata ?? existingData.metadata,
    };

    await db.update(flows)
      .set({
        name: updatedData.name,
        version: updatedData.version,
        jsonContent: JSON.stringify(updatedData),
        updatedAt: now,
        metadata: updatedData.metadata ? JSON.stringify(updatedData.metadata) : null,
      })
      .where(eq(flows.id, id));

    return c.json({
      success: true,
      flow: updatedData,
    });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * DELETE /api/flows/:id - Delete a flow
 */
flowsRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    const existing = await db.select().from(flows).where(eq(flows.id, id)).get();
    if (!existing) {
      return c.json({ success: false, error: 'Flow not found' }, 404);
    }

    await db.delete(flows).where(eq(flows.id, id));

    return c.json({ success: true, message: 'Flow deleted' });
  } catch (error) {
    const err = error as Error;
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default flowsRouter;

