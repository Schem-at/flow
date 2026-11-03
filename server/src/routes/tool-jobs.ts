/**
 * Laravel <-> executor protocol (remote-tools design §9). Internal only:
 * every call carries X-Tools-Service-Token (executionGate) and X-Tools-Owner
 * (the quota subject, e.g. user:12 / community:3); jobs are private to it.
 *
 *   POST   /api/tool-jobs      {graph, inputs, timeout (s), run_id} -> 202 {id, status:"queued", queued_position}
 *   GET    /api/tool-jobs/:id  -> job view (outputs only when done)
 *   DELETE /api/tool-jobs/:id  -> cancels (terminates the Worker), returns the job
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { toolRuntime } from '@flow/core';
import { executionGate } from '../services/executionGate.js';
import { parseToolTimeoutMs, QueueFullError, toolJobStore, type ToolJobStore } from '../services/toolJobs.js';

/** 16 MB decoded per file arrives as ~21.4 MB of base64, plus the graph. */
export const TOOL_REQUEST_BODY_LIMIT = 32 * 1024 * 1024;

const fail = (code: string, message: string) => ({ error: { code, message } });

export function createToolJobsRouter(store: () => ToolJobStore = toolJobStore) {
  const router = new Hono<{ Variables: { owner: string } }>();
  router.use('*', executionGate, bodyLimit({
    maxSize: TOOL_REQUEST_BODY_LIMIT,
    onError: (c) => c.json(fail('validation', 'The request exceeds 32 MB.'), 413),
  }));
  router.use('*', async (c, next) => {
    const owner = c.req.header('X-Tools-Owner');
    if (!owner) return c.json(fail('validation', 'X-Tools-Owner is required.'), 422);
    c.set('owner', owner);
    await next();
  });

  router.post('/', async (c) => {
    let body: any;
    try { body = await c.req.json(); } catch { return c.json(fail('validation', 'The body must be JSON.'), 422); }
    if (!Array.isArray(body?.graph?.nodes) || !Array.isArray(body?.graph?.edges))
      return c.json(fail('validation', 'A tool graph is required.'), 422);
    if (body.inputs != null && (typeof body.inputs !== 'object' || Array.isArray(body.inputs)))
      return c.json(fail('validation', 'inputs must be an object.'), 422);
    if (toolRuntime(body.graph) === 'browser')
      return c.json(fail('validation', 'This tool only runs in the browser.'), 422);
    try {
      const job = store().submit(c.get('owner'), {
        graph: body.graph,
        inputs: body.inputs ?? {},
        timeoutMs: parseToolTimeoutMs(body.timeout ?? body.graph?.metadata?.tool?.timeout),
        runId: body.run_id != null ? String(body.run_id) : null,
      });
      return c.json(job, 202);
    } catch (error) {
      if (error instanceof QueueFullError) {
        c.header('Retry-After', '5');
        return c.json(fail('backend_unavailable', error.message), 429);
      }
      throw error;
    }
  });

  router.get('/:id', (c) => {
    const job = store().get(c.req.param('id'), c.get('owner'));
    return job ? c.json(job) : c.json(fail('not_found', 'Job not found.'), 404);
  });

  router.delete('/:id', (c) => {
    const job = store().cancel(c.req.param('id'), c.get('owner'));
    return job ? c.json(job) : c.json(fail('not_found', 'Job not found.'), 404);
  });

  return router;
}

export default createToolJobsRouter();
