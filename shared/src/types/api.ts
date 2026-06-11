/**
 * API Execution Types
 * Types for flow API execution, authentication, and run management
 */

// ============================================================================
// Authentication & Authorization
// ============================================================================

/**
 * API key for authenticating flow API requests
 */
export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;         // SHA-256 hash of the API key
  keyPrefix: string;       // First 8 chars for identification (pk_xxxx...)
  userId?: string;         // Optional user association
  scopes: ApiScope[];      // Permissions granted
  flowIds?: string[];      // Restrict to specific flows (null = all)
  rateLimit?: RateLimit;
  maxTtl?: number;         // Maximum TTL for runs (seconds)
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  isActive: boolean;
}

export interface RateLimit {
  requests: number;        // Number of requests
  windowMs: number;        // Time window in ms
}

/**
 * Scopes for API access control
 */
export type ApiScope = 
  | 'flow:read'           // Read flow definitions
  | 'flow:execute'        // Execute flows synchronously
  | 'flow:execute:async'  // Execute flows asynchronously
  | 'run:read'            // Read run status/results
  | 'run:cancel'          // Cancel running executions
  | 'schema:read';        // Read OpenAPI schemas

/**
 * JWT payload for authenticated requests
 */
export interface JwtPayload {
  sub: string;            // API key ID or user ID
  iss: string;            // Issuer (polymerase)
  aud: string;            // Audience (api)
  exp: number;            // Expiration timestamp
  iat: number;            // Issued at timestamp
  scopes: ApiScope[];
  flowIds?: string[];     // Restricted flow IDs
  maxTtl?: number;        // Max TTL from API key
}

// ============================================================================
// Flow API Definition
// ============================================================================

/**
 * API configuration for a flow
 */
export interface FlowApi {
  id: string;
  flowId: string;
  flowVersion: string;
  slug: string;           // URL-friendly identifier (e.g., "my-flow")
  enabled: boolean;
  
  // Execution settings
  defaultTtl: number;     // Default TTL for results (seconds)
  maxTtl: number;         // Maximum allowed TTL
  timeout: number;        // Execution timeout (ms)
  
  // Rate limiting
  rateLimit?: RateLimit;
  
  // Metadata
  title: string;
  description?: string;
  version: string;        // API version (semver)
  tags?: string[];
  
  // OpenAPI spec (generated)
  openApiSpec?: OpenApiSpec;
  
  createdAt: number;
  updatedAt?: number;
}

// ============================================================================
// OpenAPI Schema Types
// ============================================================================

/**
 * OpenAPI 3.0 specification (simplified)
 */
export interface OpenApiSpec {
  openapi: '3.0.3';
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
}

export interface OpenApiInfo {
  title: string;
  description?: string;
  version: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export interface OpenApiPathItem {
  summary?: string;
  description?: string;
  get?: OpenApiOperation;
  post?: OpenApiOperation;
}

export interface OpenApiOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenApiSchema;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: OpenApiSchema }>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: OpenApiSchema }>;
}

export interface OpenApiSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  format?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  $ref?: string;
}

export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

export interface OpenApiSecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

// ============================================================================
// Run Management
// ============================================================================

/**
 * Run status for tracking execution
 */
export type RunStatus = 
  | 'pending'     // Queued, waiting to start
  | 'running'     // Currently executing
  | 'completed'   // Finished successfully
  | 'failed'      // Finished with error
  | 'cancelled'   // Cancelled by user
  | 'timeout'     // Exceeded timeout
  | 'expired';    // TTL expired, results cleaned up

/**
 * Execution run record
 */
export interface Run {
  id: string;
  flowId: string;
  flowApiId?: string;
  
  // Request info
  apiKeyId?: string;
  clientIp?: string;
  userAgent?: string;
  
  // Execution state
  status: RunStatus;
  progress?: number;      // 0-100 percentage
  currentNode?: string;   // Currently executing node ID
  
  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  ttl: number;            // Result TTL in seconds
  expiresAt?: number;     // When results will be cleaned up
  
  // Input/Output
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  
  // Artifacts (base64 encoded schematics, files, etc.)
  artifacts?: RunArtifact[];
  
  // Error info
  error?: RunError;
  
  // Execution metadata
  nodeResults?: Record<string, NodeRunResult>;
  logs?: RunLog[];
  executionTimeMs?: number;
}

export interface RunArtifact {
  id: string;
  name: string;
  type: 'schematic' | 'image' | 'data' | 'file';
  format: string;         // 'litematic', 'png', 'json', etc.
  size: number;           // Size in bytes
  data?: string;          // Base64 encoded (only for small artifacts)
  url?: string;           // URL for large artifacts
}

export interface RunError {
  code: string;
  message: string;
  details?: unknown;
  nodeId?: string;
  stack?: string;
}

export interface NodeRunResult {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  executionTimeMs?: number;
  output?: unknown;
  error?: RunError;
}

export interface RunLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  nodeId?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request to execute a flow synchronously
 */
export interface ExecuteFlowRequest {
  inputs: Record<string, unknown>;
  options?: ExecuteOptions;
}

export interface ExecuteOptions {
  timeout?: number;       // Override default timeout (ms)
  ttl?: number;          // Result TTL (seconds)
  async?: boolean;       // Return immediately with run ID
  webhook?: string;      // URL to POST result when complete
  tags?: string[];       // Custom tags for the run
}

/**
 * Synchronous execution response
 */
export interface ExecuteFlowResponse {
  success: boolean;
  runId: string;
  status: RunStatus;
  outputs?: Record<string, unknown>;
  artifacts?: RunArtifact[];
  executionTimeMs?: number;
  error?: RunError;
}

/**
 * Async execution response (immediate)
 */
export interface AsyncExecuteResponse {
  success: true;
  runId: string;
  status: 'pending' | 'running';
  statusUrl: string;     // URL to poll for status
  resultUrl: string;     // URL to get result when complete
}

/**
 * Run status response
 */
export interface RunStatusResponse {
  success: boolean;
  run: Run;
}

/**
 * List runs response
 */
export interface ListRunsResponse {
  success: boolean;
  runs: Run[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Flow API schema response
 */
export interface FlowSchemaResponse {
  success: boolean;
  flowId: string;
  flowName: string;
  schema: OpenApiSpec;
}

// ============================================================================
// Error Codes
// ============================================================================

export const ApiErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  EXPIRED_API_KEY: 'EXPIRED_API_KEY',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  
  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  
  // Flow errors
  FLOW_NOT_FOUND: 'FLOW_NOT_FOUND',
  FLOW_NOT_ENABLED: 'FLOW_NOT_ENABLED',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Execution errors
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',
  
  // Run errors
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  RUN_EXPIRED: 'RUN_EXPIRED',
  
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ApiErrorCode = typeof ApiErrorCodes[keyof typeof ApiErrorCodes];

/**
 * Standard API error response
 */
export interface ApiError {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}
