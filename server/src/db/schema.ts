/**
 * SQLite database schema using Drizzle ORM
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Flows table - stores Polymerase flow graphs
 */
export const flows = sqliteTable('flows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull().default('1.0.0'),
  jsonContent: text('json_content').notNull(), // Stores the full JSON graph
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  metadata: text('metadata'), // Optional JSON metadata
});

/**
 * Executions table - stores execution history
 */
export const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull().references(() => flows.id),
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'error' | 'cancelled'
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  result: text('result'), // JSON result
  error: text('error'), // Error message if failed
});

/**
 * Schematics table - stores generated schematics
 */
export const schematics = sqliteTable('schematics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  flowId: text('flow_id').references(() => flows.id),
  executionId: text('execution_id').references(() => executions.id),
  format: text('format').notNull(), // 'litematic' | 'schematic' | 'schem' | 'nbt'
  data: text('data').notNull(), // Base64 encoded schematic data
  metadata: text('metadata'), // JSON metadata (dimensions, block count, etc.)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// API Execution Tables
// ============================================================================

/**
 * API Keys table - stores API keys for authentication
 */
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(), // SHA-256 hash of the API key
  keyPrefix: text('key_prefix').notNull(), // First 8 chars (pk_xxxx...)
  userId: text('user_id'), // Optional user association
  scopes: text('scopes').notNull(), // JSON array of ApiScope
  flowIds: text('flow_ids'), // JSON array of flow IDs (null = all)
  rateLimit: text('rate_limit'), // JSON RateLimit object
  maxTtl: integer('max_ttl'), // Maximum TTL for runs (seconds)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

/**
 * Flow APIs table - API configuration for flows
 */
export const flowApis = sqliteTable('flow_apis', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull().references(() => flows.id),
  flowVersion: text('flow_version').notNull(),
  slug: text('slug').notNull().unique(), // URL-friendly identifier
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  
  // Execution settings
  defaultTtl: integer('default_ttl').notNull().default(3600), // 1 hour
  maxTtl: integer('max_ttl').notNull().default(86400), // 24 hours
  timeout: integer('timeout').notNull().default(60000), // 60 seconds
  
  // Rate limiting
  rateLimit: text('rate_limit'), // JSON RateLimit object
  
  // Metadata
  title: text('title').notNull(),
  description: text('description'),
  apiVersion: text('api_version').notNull().default('1.0.0'),
  tags: text('tags'), // JSON array
  
  // OpenAPI spec cache
  openApiSpec: text('openapi_spec'), // JSON OpenApiSpec
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

/**
 * Runs table - execution runs with TTL and tracking
 */
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull().references(() => flows.id),
  flowApiId: text('flow_api_id').references(() => flowApis.id),
  
  // Request info
  apiKeyId: text('api_key_id').references(() => apiKeys.id),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
  
  // Execution state
  status: text('status').notNull(), // RunStatus
  progress: integer('progress'), // 0-100
  currentNode: text('current_node'),
  
  // Timing
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  ttl: integer('ttl').notNull().default(3600), // Result TTL in seconds
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  
  // Input/Output (JSON)
  inputs: text('inputs').notNull(), // JSON
  outputs: text('outputs'), // JSON
  
  // Error info (JSON)
  error: text('error'), // JSON RunError
  
  // Execution metadata
  nodeResults: text('node_results'), // JSON Record<string, NodeRunResult>
  logs: text('logs'), // JSON RunLog[]
  executionTimeMs: integer('execution_time_ms'),
});

/**
 * Run Artifacts table - stores large artifacts separately
 */
export const runArtifacts = sqliteTable('run_artifacts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'schematic' | 'image' | 'data' | 'file'
  format: text('format').notNull(), // 'litematic', 'png', 'json', etc.
  size: integer('size').notNull(), // Size in bytes
  data: text('data'), // Base64 encoded (for small artifacts)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Type exports for use in the application
export type Flow = typeof flows.$inferSelect;
export type NewFlow = typeof flows.$inferInsert;
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
export type Schematic = typeof schematics.$inferSelect;
export type NewSchematic = typeof schematics.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type FlowApiRecord = typeof flowApis.$inferSelect;
export type NewFlowApi = typeof flowApis.$inferInsert;
export type RunRecord = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunArtifactRecord = typeof runArtifacts.$inferSelect;
export type NewRunArtifact = typeof runArtifacts.$inferInsert;

