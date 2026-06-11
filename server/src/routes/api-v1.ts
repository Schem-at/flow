/**
 * API v1 Routes
 * Flow execution API with OpenAPI support
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db, flows, flowApis, type NewFlowApi } from '../db/index.js';
import { executionService } from '../services/execution.js';
import { generateOpenApiSpec, generateSlug, extractFlowInputs, extractFlowOutputs } from '../services/openapi.js';
import {
  authMiddleware,
  requireAuth,
  requireScopes,
  canAccessFlow,
  getEffectiveTtl,
  rateLimit,
  generateApiKey,
  createJwt,
  type AuthContext,
} from '../middleware/auth.js';
import type { FlowData } from '@flow/core';
import type {
  FlowApi,
  ExecuteFlowRequest,
  ExecuteFlowResponse,
  AsyncExecuteResponse,
  RunStatusResponse,
  ListRunsResponse,
  FlowSchemaResponse,
  ApiScope,
} from 'shared';

const apiV1Router = new Hono<{
  Variables: {
    auth: AuthContext;
  };
}>();

// Apply auth middleware to all routes
apiV1Router.use('*', authMiddleware);

// Default rate limit
apiV1Router.use('*', rateLimit(100, 60000)); // 100 req/min

// ============================================================================
// Flow API Management
// ============================================================================

/**
 * GET /api/v1/flows - List available flow APIs
 */
apiV1Router.get('/flows', requireScopes('flow:read'), async (c) => {
  const auth = c.get('auth');
  
  let results = await db.select({
    id: flowApis.id,
    flowId: flowApis.flowId,
    slug: flowApis.slug,
    title: flowApis.title,
    description: flowApis.description,
    version: flowApis.apiVersion,
    enabled: flowApis.enabled,
    tags: flowApis.tags,
  }).from(flowApis)
    .where(eq(flowApis.enabled, true));

  // Filter by allowed flows
  if (auth.flowIds) {
    results = results.filter(r => auth.flowIds!.includes(r.flowId));
  }

  return c.json({
    success: true,
    flows: results.map(r => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : [],
    })),
  });
});

/**
 * POST /api/v1/flows/:flowId/publish - Publish a flow as an API
 */
apiV1Router.post('/flows/:flowId/publish', requireScopes('flow:read'), async (c) => {
  const flowId = c.req.param('flowId');
  const auth = c.get('auth');

  if (!canAccessFlow(auth, flowId)) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  // Get the flow
  const flow = await db.select().from(flows).where(eq(flows.id, flowId)).get();
  if (!flow) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  const flowData: FlowData = JSON.parse(flow.jsonContent);
  const body = await c.req.json().catch(() => ({}));
  
  // Check if already published
  const existing = await db.select().from(flowApis).where(eq(flowApis.flowId, flowId)).get();
  
  const slug = body.slug || existing?.slug || generateSlug(flow.name);
  const title = body.title || existing?.title || flow.name;
  const description = body.description || existing?.description;
  const tags = body.tags || (existing?.tags ? JSON.parse(existing.tags) : []);
  const defaultTtl = body.defaultTtl || existing?.defaultTtl || 3600;
  const maxTtl = body.maxTtl || existing?.maxTtl || 86400;
  const timeout = body.timeout || existing?.timeout || 60000;

  const flowApi: FlowApi = {
    id: existing?.id || crypto.randomUUID(),
    flowId,
    flowVersion: flow.version,
    slug,
    enabled: true,
    defaultTtl,
    maxTtl,
    timeout,
    title,
    description,
    version: body.version || existing?.apiVersion || '1.0.0',
    tags,
    createdAt: existing?.createdAt?.getTime() || Date.now(),
    updatedAt: Date.now(),
  };

  // Generate OpenAPI spec
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  flowApi.openApiSpec = generateOpenApiSpec(flowData, flowApi, baseUrl);

  if (existing) {
    // Update
    await db.update(flowApis)
      .set({
        slug,
        flowVersion: flow.version,
        title,
        description,
        apiVersion: flowApi.version,
        tags: JSON.stringify(tags),
        defaultTtl,
        maxTtl,
        timeout,
        openApiSpec: JSON.stringify(flowApi.openApiSpec),
        updatedAt: new Date(),
      })
      .where(eq(flowApis.id, existing.id));
  } else {
    // Insert
    const newFlowApi: NewFlowApi = {
      id: flowApi.id,
      flowId,
      flowVersion: flow.version,
      slug,
      enabled: true,
      defaultTtl,
      maxTtl,
      timeout,
      title,
      description,
      apiVersion: flowApi.version,
      tags: JSON.stringify(tags),
      openApiSpec: JSON.stringify(flowApi.openApiSpec),
      createdAt: new Date(),
    };
    await db.insert(flowApis).values(newFlowApi);
  }

  return c.json({
    success: true,
    flowApi,
  });
});

/**
 * GET /api/v1/flows/:slug/schema - Get OpenAPI schema for a flow
 */
apiV1Router.get('/flows/:slug/schema', async (c) => {
  const slug = c.req.param('slug');
  
  const flowApi = await db.select().from(flowApis)
    .where(and(eq(flowApis.slug, slug), eq(flowApis.enabled, true)))
    .get();

  if (!flowApi) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow API not found' } }, 404);
  }

  const flow = await db.select().from(flows).where(eq(flows.id, flowApi.flowId)).get();
  if (!flow) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  const flowData: FlowData = JSON.parse(flow.jsonContent);
  const inputs = extractFlowInputs(flowData);
  const outputs = extractFlowOutputs(flowData);

  const response: FlowSchemaResponse = {
    success: true,
    flowId: flowApi.flowId,
    flowName: flow.name,
    schema: flowApi.openApiSpec ? JSON.parse(flowApi.openApiSpec) : generateOpenApiSpec(
      flowData,
      {
        id: flowApi.id,
        flowId: flowApi.flowId,
        flowVersion: flowApi.flowVersion,
        slug: flowApi.slug,
        enabled: flowApi.enabled,
        defaultTtl: flowApi.defaultTtl,
        maxTtl: flowApi.maxTtl,
        timeout: flowApi.timeout,
        title: flowApi.title,
        description: flowApi.description || undefined,
        version: flowApi.apiVersion,
        createdAt: flowApi.createdAt?.getTime() || Date.now(),
      },
      process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`
    ),
  };

  return c.json(response);
});

/**
 * GET /api/v1/flows/:slug/openapi.json - Get raw OpenAPI spec
 */
apiV1Router.get('/flows/:slug/openapi.json', async (c) => {
  const slug = c.req.param('slug');
  
  const flowApi = await db.select().from(flowApis)
    .where(and(eq(flowApis.slug, slug), eq(flowApis.enabled, true)))
    .get();

  if (!flowApi) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow API not found' } }, 404);
  }

  if (flowApi.openApiSpec) {
    return c.json(JSON.parse(flowApi.openApiSpec));
  }

  // Generate on the fly
  const flow = await db.select().from(flows).where(eq(flows.id, flowApi.flowId)).get();
  if (!flow) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  const flowData: FlowData = JSON.parse(flow.jsonContent);
  const spec = generateOpenApiSpec(
    flowData,
    {
      id: flowApi.id,
      flowId: flowApi.flowId,
      flowVersion: flowApi.flowVersion,
      slug: flowApi.slug,
      enabled: flowApi.enabled,
      defaultTtl: flowApi.defaultTtl,
      maxTtl: flowApi.maxTtl,
      timeout: flowApi.timeout,
      title: flowApi.title,
      description: flowApi.description || undefined,
      version: flowApi.apiVersion,
      createdAt: flowApi.createdAt?.getTime() || Date.now(),
    },
    process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`
  );

  return c.json(spec);
});

// ============================================================================
// Flow Execution
// ============================================================================

/**
 * POST /api/v1/flows/:idOrSlug/run - Execute a flow by ID or slug
 * This is the main execution endpoint - works with any saved flow
 */
apiV1Router.post('/flows/:idOrSlug/run', requireScopes('flow:execute'), async (c) => {
  const idOrSlug = c.req.param('idOrSlug');
  const auth = c.get('auth');

  // Try to find flow by ID first, then by slug
  let flow = await db.select().from(flows).where(eq(flows.id, idOrSlug)).get();
  let flowApi = null;
  
  if (!flow) {
    // Try finding by slug in flowApis
    flowApi = await db.select().from(flowApis)
      .where(and(eq(flowApis.slug, idOrSlug), eq(flowApis.enabled, true)))
      .get();
    
    if (flowApi) {
      flow = await db.select().from(flows).where(eq(flows.id, flowApi.flowId)).get();
    }
  }

  if (!flow) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  if (!canAccessFlow(auth, flow.id)) {
    return c.json({ success: false, error: { code: 'FLOW_NOT_FOUND', message: 'Flow not found' } }, 404);
  }

  const flowData: FlowData = JSON.parse(flow.jsonContent);
  const body: ExecuteFlowRequest = await c.req.json().catch(() => ({ inputs: {} }));
  
  const inputs = body.inputs || {};
  const options = body.options || {};
  
  // Calculate effective TTL
  const defaultTtl = flowApi?.defaultTtl || 3600;
  const ttl = getEffectiveTtl(options.ttl, defaultTtl, auth);
  const timeout = Math.min(options.timeout || flowApi?.timeout || 60000, flowApi?.timeout || 60000);

  // Check if async execution
  if (options.async) {
    const result = await executionService.executeFlowAsync(flowData, inputs, {
      flowApiId: flowApi?.id,
      apiKeyId: auth.apiKey?.id,
      clientIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      userAgent: c.req.header('user-agent'),
      ttl,
      timeout,
      webhook: options.webhook,
    });

    const response: AsyncExecuteResponse = {
      success: true,
      runId: result.runId,
      status: 'pending',
      statusUrl: result.statusUrl,
      resultUrl: result.resultUrl,
    };

    return c.json(response, 202);
  }

  // Synchronous execution
  const run = await executionService.executeFlowSync(flowData, inputs, {
    flowApiId: flowApi?.id,
    apiKeyId: auth.apiKey?.id,
    clientIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
    ttl,
    timeout,
  });

  // If there's exactly one artifact, return the file directly (unless client wants JSON)
  const acceptHeader = c.req.header('accept') || '';
  const wantsJson = acceptHeader.includes('application/json');
  
  if (!wantsJson && run.status === 'completed' && run.artifacts && run.artifacts.length === 1) {
    const artifact = run.artifacts[0]!;
    if (artifact.data) {
      const contentTypes: Record<string, string> = {
        'nbt': 'application/octet-stream',
        'schem': 'application/octet-stream',
        'schematic': 'application/octet-stream',
        'litematic': 'application/octet-stream',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'txt': 'text/plain',
        'csv': 'text/csv',
      };
      const contentType = contentTypes[artifact.format] || 'application/octet-stream';
      const filename = `${artifact.name}.${artifact.format}`;
      
      // Decode base64 data
      const data = Buffer.from(artifact.data, 'base64');
      
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(data.byteLength),
          'X-Run-Id': run.id,
          'X-Execution-Time-Ms': String(run.executionTimeMs || 0),
        },
      });
    }
  }

  const response: ExecuteFlowResponse = {
    success: run.status === 'completed',
    runId: run.id,
    status: run.status,
    outputs: run.outputs,
    artifacts: run.artifacts,
    executionTimeMs: run.executionTimeMs,
    error: run.error,
  };

  const statusCode = run.status === 'completed' ? 200 
    : run.status === 'failed' ? 500 
    : run.status === 'timeout' ? 408 
    : 200;

  return c.json(response, statusCode);
});

// ============================================================================
// Run Management
// ============================================================================

/**
 * GET /api/v1/runs - List runs
 */
apiV1Router.get('/runs', requireScopes('run:read'), async (c) => {
  const auth = c.get('auth');
  const flowId = c.req.query('flowId');
  const status = c.req.query('status')?.split(',') as any[];
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);

  // Filter by allowed flows
  let effectiveFlowId = flowId;
  if (auth.flowIds && flowId && !auth.flowIds.includes(flowId)) {
    return c.json({ success: true, runs: [], total: 0, page, pageSize, hasMore: false });
  }

  const result = await executionService.listRuns({
    flowId: effectiveFlowId,
    status,
    page,
    pageSize,
  });

  // Filter by allowed flows
  let filteredRuns = result.runs;
  if (auth.flowIds) {
    filteredRuns = filteredRuns.filter(r => auth.flowIds!.includes(r.flowId));
  }

  const response: ListRunsResponse = {
    success: true,
    runs: filteredRuns,
    total: result.total,
    page,
    pageSize,
    hasMore: page * pageSize < result.total,
  };

  return c.json(response);
});

/**
 * GET /api/v1/runs/:runId - Get run status
 */
apiV1Router.get('/runs/:runId', requireScopes('run:read'), async (c) => {
  const runId = c.req.param('runId');
  const auth = c.get('auth');

  const run = await executionService.getRun(runId);
  
  if (!run) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (!canAccessFlow(auth, run.flowId)) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const response: RunStatusResponse = {
    success: true,
    run,
  };

  return c.json(response);
});

/**
 * GET /api/v1/runs/:runId/result - Get run result (shortcut to outputs)
 */
apiV1Router.get('/runs/:runId/result', requireScopes('run:read'), async (c) => {
  const runId = c.req.param('runId');
  const auth = c.get('auth');

  const run = await executionService.getRun(runId);
  
  if (!run) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (!canAccessFlow(auth, run.flowId)) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (run.status === 'pending' || run.status === 'running') {
    return c.json({ 
      success: false, 
      status: run.status,
      progress: run.progress,
      error: { code: 'RUN_IN_PROGRESS', message: 'Run is still in progress' } 
    }, 202);
  }

  return c.json({
    success: run.status === 'completed',
    status: run.status,
    outputs: run.outputs,
    artifacts: run.artifacts?.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      format: a.format,
      size: a.size,
      downloadUrl: `/api/v1/runs/${runId}/artifacts/${a.id}`,
    })),
    executionTimeMs: run.executionTimeMs,
    error: run.error,
  });
});

/**
 * GET /api/v1/runs/:runId/artifacts/:artifactId - Download an artifact
 */
apiV1Router.get('/runs/:runId/artifacts/:artifactId', requireScopes('run:read'), async (c) => {
  const runId = c.req.param('runId');
  const artifactId = c.req.param('artifactId');
  const auth = c.get('auth');

  const run = await executionService.getRun(runId);
  
  if (!run) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (!canAccessFlow(auth, run.flowId)) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const artifact = run.artifacts?.find(a => a.id === artifactId);
  
  if (!artifact) {
    return c.json({ success: false, error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } }, 404);
  }

  if (!artifact.data) {
    return c.json({ success: false, error: { code: 'ARTIFACT_NO_DATA', message: 'Artifact has no data' } }, 404);
  }

  // Determine content type based on format
  const contentTypes: Record<string, string> = {
    'nbt': 'application/octet-stream',
    'schem': 'application/octet-stream',
    'schematic': 'application/octet-stream',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'txt': 'text/plain',
    'csv': 'text/csv',
  };

  const contentType = contentTypes[artifact.format] || 'application/octet-stream';
  const filename = `${artifact.name}.${artifact.format}`;

  // Handle base64 encoded data or raw string
  let data: Buffer | string = artifact.data;
  if (typeof artifact.data === 'string' && artifact.type !== 'data') {
    // Assume base64 encoded for binary types
    try {
      data = Buffer.from(artifact.data, 'base64');
    } catch {
      data = artifact.data;
    }
  }

  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(artifact.size || (typeof data === 'string' ? data.length : data.byteLength)),
    },
  });
});

/**
 * DELETE /api/v1/runs/:runId - Cancel a run
 */
apiV1Router.delete('/runs/:runId', requireScopes('run:cancel'), async (c) => {
  const runId = c.req.param('runId');
  const auth = c.get('auth');

  const run = await executionService.getRun(runId);
  
  if (!run) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  if (!canAccessFlow(auth, run.flowId)) {
    return c.json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } }, 404);
  }

  const cancelled = await executionService.cancelRun(runId);
  
  if (!cancelled) {
    return c.json({ 
      success: false, 
      error: { code: 'EXECUTION_CANCELLED', message: 'Run cannot be cancelled (already completed or not running)' } 
    }, 400);
  }

  return c.json({ success: true, message: 'Run cancelled' });
});

// ============================================================================
// API Key Management (admin endpoints)
// ============================================================================

/**
 * POST /api/v1/auth/keys - Create a new API key
 */
apiV1Router.post('/auth/keys', async (c) => {
  const body = await c.req.json();
  const { name, scopes, flowIds, maxTtl, expiresIn } = body;

  if (!name || !scopes || !Array.isArray(scopes)) {
    return c.json({ 
      success: false, 
      error: { code: 'INVALID_INPUT', message: 'Name and scopes are required' } 
    }, 400);
  }

  const { key, prefix, hash } = await generateApiKey();
  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : undefined;

  const apiKeyId = crypto.randomUUID();

  await db.insert(require('../db/index.js').apiKeys).values({
    id: apiKeyId,
    name,
    keyHash: hash,
    keyPrefix: prefix,
    scopes: JSON.stringify(scopes),
    flowIds: flowIds ? JSON.stringify(flowIds) : null,
    maxTtl: maxTtl || null,
    createdAt: now,
    expiresAt: expiresAt || null,
    isActive: true,
  });

  return c.json({
    success: true,
    apiKey: {
      id: apiKeyId,
      key, // Only returned on creation!
      prefix,
      name,
      scopes,
      flowIds,
      maxTtl,
      expiresAt: expiresAt?.toISOString(),
    },
  }, 201);
});

/**
 * POST /api/v1/auth/token - Exchange API key for JWT
 */
apiV1Router.post('/auth/token', requireAuth, async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json().catch(() => ({}));
  const { expiresIn = 3600 } = body; // Default 1 hour

  if (!auth.apiKey) {
    return c.json({ 
      success: false, 
      error: { code: 'INVALID_INPUT', message: 'API key authentication required to get JWT' } 
    }, 400);
  }

  // Calculate expiration (respect maxTtl)
  let exp = Math.floor(Date.now() / 1000) + expiresIn;
  if (auth.maxTtl && expiresIn > auth.maxTtl) {
    exp = Math.floor(Date.now() / 1000) + auth.maxTtl;
  }

  const token = await createJwt({
    sub: auth.apiKey.id,
    exp,
    scopes: auth.scopes,
    flowIds: auth.flowIds,
    maxTtl: auth.maxTtl,
  });

  return c.json({
    success: true,
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
});

export default apiV1Router;
