/**
 * OpenAPI Schema Generator
 * Generates OpenAPI 3.0 specs from Polymerase flow definitions
 */

import type { FlowData, NodeData, IODefinition, IOPort } from '@flow/core';
import type {
  OpenApiSpec,
  OpenApiSchema,
  OpenApiOperation,
  OpenApiParameter,
  FlowApi,
} from 'shared';

/**
 * Input parameter extracted from flow
 */
interface FlowInput {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  nodeId: string;
}

/**
 * Output field extracted from flow
 */
interface FlowOutput {
  name: string;
  type: string;
  description?: string;
  nodeId: string;
}

/**
 * Extract inputs from a flow definition
 * Looks at input nodes (number_input, text_input, etc.) that are not marked as constant
 */
export function extractFlowInputs(flow: FlowData): FlowInput[] {
  const inputs: FlowInput[] = [];

  for (const node of flow.nodes) {
    // Skip nodes that aren't input types
    if (!isInputNode(node)) continue;

    // Skip constant inputs (not exposed in API)
    if (node.data.config?.isConstant) continue;

    const input = extractInputFromNode(node);
    if (input) {
      inputs.push(input);
    }
  }

  return inputs;
}

/**
 * Extract outputs from a flow definition
 * Looks at output nodes and viewer nodes with passthrough
 */
export function extractFlowOutputs(flow: FlowData): FlowOutput[] {
  const outputs: FlowOutput[] = [];

  for (const node of flow.nodes) {
    if (node.type === 'output' || node.type === 'schematic_output' || node.type === 'file_output') {
      outputs.push({
        name: node.data.label || node.id,
        type: inferOutputType(node),
        description: node.data.config?.description as string | undefined,
        nodeId: node.id,
      });
    }
    
    // Viewer nodes with passthrough also count as outputs
    if (node.type === 'viewer' && node.data.config?.passthrough) {
      outputs.push({
        name: node.data.label || node.id,
        type: 'any',
        description: 'Viewer passthrough output',
        nodeId: node.id,
      });
    }
  }

  // If no explicit outputs, the flow outputs whatever the final nodes produce
  if (outputs.length === 0) {
    outputs.push({
      name: 'result',
      type: 'object',
      description: 'Flow execution result',
      nodeId: 'default',
    });
  }

  return outputs;
}

/**
 * Check if a node is an input node type
 */
function isInputNode(node: NodeData): boolean {
  return [
    'input',
    'static_input',
    'number_input',
    'text_input',
    'boolean_input',
    'select_input',
    'schematic_input',
    'file_input',
  ].includes(node.type);
}

/**
 * Extract input definition from a node
 */
function extractInputFromNode(node: NodeData): FlowInput | null {
  const config = node.data.config || {};
  const label = node.data.label || node.id;

  switch (node.type) {
    case 'number_input':
      return {
        name: label,
        type: 'number',
        required: !config.hasOwnProperty('default'),
        default: node.data.value,
        description: config.description as string | undefined,
        min: config.min as number | undefined,
        max: config.max as number | undefined,
        step: config.step as number | undefined,
        nodeId: node.id,
      };

    case 'text_input':
      return {
        name: label,
        type: 'string',
        required: !config.hasOwnProperty('default'),
        default: node.data.value,
        description: config.description as string | undefined,
        nodeId: node.id,
      };

    case 'boolean_input':
      return {
        name: label,
        type: 'boolean',
        required: false,
        default: node.data.value ?? false,
        description: config.description as string | undefined,
        nodeId: node.id,
      };

    case 'select_input':
      return {
        name: label,
        type: 'string',
        required: !config.hasOwnProperty('default'),
        default: node.data.value,
        description: config.description as string | undefined,
        options: config.options as string[] | undefined,
        nodeId: node.id,
      };

    case 'input':
    case 'static_input':
      return {
        name: label,
        type: inferInputType(node),
        required: !config.hasOwnProperty('default') && node.data.value === undefined,
        default: node.data.value,
        description: config.description as string | undefined,
        nodeId: node.id,
      };

    case 'schematic_input':
    case 'file_input':
      return {
        name: label,
        type: 'string',
        required: true,
        description: config.description as string || 'Base64 encoded file data',
        nodeId: node.id,
      };

    default:
      return null;
  }
}

/**
 * Infer input type from node configuration
 */
function inferInputType(node: NodeData): string {
  const config = node.data.config || {};
  
  if (config.dataType) return config.dataType as string;
  if (config.inputType) return config.inputType as string;
  
  const value = node.data.value;
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  
  return 'any';
}

/**
 * Infer output type from node
 */
function inferOutputType(node: NodeData): string {
  if (node.type === 'schematic_output') return 'schematic';
  if (node.type === 'file_output') return 'file';
  
  const io = node.data.io;
  if (io?.outputs) {
    const firstOutput = Object.values(io.outputs)[0];
    if (firstOutput) return firstOutput.type;
  }
  
  return 'any';
}

/**
 * Convert flow type to OpenAPI schema type
 */
function toOpenApiSchema(type: string, input?: FlowInput): OpenApiSchema {
  switch (type) {
    case 'number':
    case 'float':
    case 'double':
      return {
        type: 'number',
        description: input?.description,
        default: input?.default as number,
        minimum: input?.min,
        maximum: input?.max,
      };

    case 'integer':
    case 'int':
      return {
        type: 'integer',
        description: input?.description,
        default: input?.default as number,
        minimum: input?.min,
        maximum: input?.max,
      };

    case 'boolean':
    case 'bool':
      return {
        type: 'boolean',
        description: input?.description,
        default: input?.default as boolean,
      };

    case 'string':
    case 'text':
      const schema: OpenApiSchema = {
        type: 'string',
        description: input?.description,
        default: input?.default as string,
      };
      if (input?.options) {
        schema.enum = input.options;
      }
      return schema;

    case 'schematic':
      return {
        type: 'string',
        format: 'byte',
        description: input?.description || 'Base64 encoded schematic data',
      };

    case 'file':
      return {
        type: 'string',
        format: 'byte',
        description: input?.description || 'Base64 encoded file data',
      };

    case 'array':
      return {
        type: 'array',
        items: { type: 'string' },
        description: input?.description,
      };

    case 'object':
      return {
        type: 'object',
        description: input?.description,
      };

    default:
      return {
        description: input?.description,
      };
  }
}

/**
 * Generate OpenAPI spec for a flow
 */
export function generateOpenApiSpec(
  flow: FlowData,
  flowApi: FlowApi,
  baseUrl: string = ''
): OpenApiSpec {
  const inputs = extractFlowInputs(flow);
  const outputs = extractFlowOutputs(flow);

  // Build request body schema
  const inputProperties: Record<string, OpenApiSchema> = {};
  const requiredInputs: string[] = [];

  for (const input of inputs) {
    inputProperties[input.name] = toOpenApiSchema(input.type, input);
    if (input.required) {
      requiredInputs.push(input.name);
    }
  }

  // Build response schema
  const outputProperties: Record<string, OpenApiSchema> = {};
  
  for (const output of outputs) {
    outputProperties[output.name] = toOpenApiSchema(output.type);
  }

  // Build the spec
  const spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: {
      title: flowApi.title || flow.name,
      description: flowApi.description || flow.metadata?.description || `API for ${flow.name} flow`,
      version: flowApi.version,
    },
    servers: baseUrl ? [{ url: baseUrl, description: 'Polymerase API Server' }] : undefined,
    paths: {
      [`/api/v1/flows/${flowApi.slug}/run`]: {
        post: {
          operationId: `run_${flowApi.slug.replace(/-/g, '_')}`,
          summary: `Execute ${flow.name}`,
          description: flowApi.description || `Synchronously execute the ${flow.name} flow`,
          tags: flowApi.tags || ['flows'],
          requestBody: {
            required: requiredInputs.length > 0,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    inputs: {
                      type: 'object',
                      properties: inputProperties,
                      required: requiredInputs.length > 0 ? requiredInputs : undefined,
                    },
                    options: {
                      type: 'object',
                      properties: {
                        timeout: {
                          type: 'integer',
                          description: 'Execution timeout in milliseconds',
                          default: flowApi.timeout,
                        },
                        ttl: {
                          type: 'integer',
                          description: 'Result TTL in seconds',
                          default: flowApi.defaultTtl,
                          maximum: flowApi.maxTtl,
                        },
                        async: {
                          type: 'boolean',
                          description: 'If true, returns immediately with a run ID',
                          default: false,
                        },
                        webhook: {
                          type: 'string',
                          format: 'uri',
                          description: 'URL to POST result when complete (async only)',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful execution',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      runId: { type: 'string', format: 'uuid' },
                      status: { 
                        type: 'string',
                        enum: ['completed', 'pending', 'running'],
                      },
                      outputs: {
                        type: 'object',
                        properties: outputProperties,
                      },
                      artifacts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            type: { type: 'string' },
                            format: { type: 'string' },
                            size: { type: 'integer' },
                            data: { type: 'string', format: 'byte' },
                          },
                        },
                      },
                      executionTimeMs: { type: 'integer' },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          message: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid input',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Flow not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '429': {
              description: 'Rate limited',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '500': {
              description: 'Execution error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
          security: [{ apiKey: [] }, { bearerAuth: [] }],
        },
      },
      [`/api/v1/flows/${flowApi.slug}/runs/{runId}`]: {
        get: {
          operationId: `get_run_${flowApi.slug.replace(/-/g, '_')}`,
          summary: 'Get run status',
          description: 'Get the status and result of an async run',
          tags: flowApi.tags || ['flows'],
          parameters: [
            {
              name: 'runId',
              in: 'path',
              required: true,
              description: 'Run ID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Run status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Run' },
                },
              },
            },
            '404': {
              description: 'Run not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
          security: [{ apiKey: [] }, { bearerAuth: [] }],
        },
      },
      [`/api/v1/flows/${flowApi.slug}/schema`]: {
        get: {
          operationId: `get_schema_${flowApi.slug.replace(/-/g, '_')}`,
          summary: 'Get flow schema',
          description: 'Get the input/output schema for this flow',
          tags: ['schema'],
          responses: {
            '200': {
              description: 'Flow schema',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      inputs: {
                        type: 'object',
                        properties: inputProperties,
                      },
                      outputs: {
                        type: 'object',
                        properties: outputProperties,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
              },
              required: ['code', 'message'],
            },
          },
          required: ['success', 'error'],
        },
        Run: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            flowId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout', 'expired'],
            },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
            currentNode: { type: 'string' },
            createdAt: { type: 'integer' },
            startedAt: { type: 'integer' },
            completedAt: { type: 'integer' },
            inputs: { type: 'object' },
            outputs: { type: 'object' },
            artifacts: {
              type: 'array',
              items: { $ref: '#/components/schemas/Artifact' },
            },
            error: { $ref: '#/components/schemas/RunError' },
            executionTimeMs: { type: 'integer' },
          },
        },
        Artifact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['schematic', 'image', 'data', 'file'] },
            format: { type: 'string' },
            size: { type: 'integer' },
            data: { type: 'string', format: 'byte' },
            url: { type: 'string', format: 'uri' },
          },
        },
        RunError: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: {},
            nodeId: { type: 'string' },
            stack: { type: 'string' },
          },
        },
      },
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication',
        },
      },
    },
  };

  return spec;
}

/**
 * Generate a URL-friendly slug from a flow name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}
