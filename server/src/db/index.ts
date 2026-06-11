/**
 * Database connection and setup
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.js';

// Database file path
const DB_PATH = process.env.DATABASE_PATH || './data/polymerase.db';

// Ensure data directory exists
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create SQLite connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.exec('PRAGMA journal_mode = WAL;');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use elsewhere
export * from './schema.js';

/**
 * Initialize database tables
 */
export function initializeDatabase() {
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      json_content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES flows(id),
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      result TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS schematics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      flow_id TEXT REFERENCES flows(id),
      execution_id TEXT REFERENCES executions(id),
      format TEXT NOT NULL,
      data TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    -- API Keys table
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      user_id TEXT,
      scopes TEXT NOT NULL,
      flow_ids TEXT,
      rate_limit TEXT,
      max_ttl INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      last_used_at INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Flow APIs table
    CREATE TABLE IF NOT EXISTS flow_apis (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES flows(id),
      flow_version TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      default_ttl INTEGER NOT NULL DEFAULT 3600,
      max_ttl INTEGER NOT NULL DEFAULT 86400,
      timeout INTEGER NOT NULL DEFAULT 60000,
      rate_limit TEXT,
      title TEXT NOT NULL,
      description TEXT,
      api_version TEXT NOT NULL DEFAULT '1.0.0',
      tags TEXT,
      openapi_spec TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    -- Runs table
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL REFERENCES flows(id),
      flow_api_id TEXT REFERENCES flow_apis(id),
      api_key_id TEXT REFERENCES api_keys(id),
      client_ip TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      progress INTEGER,
      current_node TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      ttl INTEGER NOT NULL DEFAULT 3600,
      expires_at INTEGER,
      inputs TEXT NOT NULL,
      outputs TEXT,
      error TEXT,
      node_results TEXT,
      logs TEXT,
      execution_time_ms INTEGER
    );

    -- Run Artifacts table
    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      format TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_executions_flow_id ON executions(flow_id);
    CREATE INDEX IF NOT EXISTS idx_schematics_flow_id ON schematics(flow_id);
    CREATE INDEX IF NOT EXISTS idx_schematics_execution_id ON schematics(execution_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
    CREATE INDEX IF NOT EXISTS idx_flow_apis_flow_id ON flow_apis(flow_id);
    CREATE INDEX IF NOT EXISTS idx_flow_apis_slug ON flow_apis(slug);
    CREATE INDEX IF NOT EXISTS idx_runs_flow_id ON runs(flow_id);
    CREATE INDEX IF NOT EXISTS idx_runs_flow_api_id ON runs(flow_api_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_expires_at ON runs(expires_at);
    CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
  `);

  // Database initialized
}

/**
 * Close database connection
 */
export function closeDatabase() {
  sqlite.close();
}

