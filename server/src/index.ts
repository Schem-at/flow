/**
 * Polymerase Server
 * Hono + Bun + SQLite backend for the Polymerase execution engine
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ApiResponse } from 'shared/dist';
import { initializeDatabase } from './db/index.js';
import flowsRouter from './routes/flows.js';
import executeRouter from './routes/execute.js';
import apiV1Router from './routes/api-v1.js';
import { executionService } from './services/execution.js';

// Initialize database
initializeDatabase();

// Start cleanup scheduler for expired runs
executionService.startCleanupScheduler(60000); // Run every minute

export const app = new Hono()
	// Middleware
	.use(cors())
	.use(logger())

	// Health check
	.get('/', (c) => {
		return c.json({
			name: 'Polymerase Server',
			version: '0.5.0',
			status: 'running',
			features: {
				flowExecution: true,
				apiV1: true,
				openApi: true,
				asyncExecution: true,
			},
		});
	})

	// Legacy hello endpoint for BHVR compatibility
	.get('/hello', async (c) => {
		const data: ApiResponse = {
			message: 'Hello from Polymerase!',
			success: true,
		};
		return c.json(data, { status: 200 });
	})

	// API Routes
	.route('/api/flows', flowsRouter)
	.route('/api/execute', executeRouter)
	
	// API v1 Routes (with auth, OpenAPI, run tracking)
	.route('/api/v1', apiV1Router);

// Export for Hono client type inference
export type AppType = typeof app;

// Bun server configuration
const port = Number(process.env.PORT) || 3001;

console.log(`Polymerase Server starting on http://localhost:${port}`);
console.log(`API v1 available at http://localhost:${port}/api/v1`);

export default {
  port,
  fetch: app.fetch,
};
