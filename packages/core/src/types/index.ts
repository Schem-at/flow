import { z } from 'zod';

// ============================================================================
// Core Flow Types
// ============================================================================

/**
 * IO Definition for script inputs/outputs
 * Extracted from Synthase validation
 */
export interface IODefinition {
  inputs: Record<string, IOPort>;
  outputs: Record<string, IOPort>;
}

export interface IOPort {
  name?: string;
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: string[];  // For select inputs
  min?: number;        // For number inputs
  max?: number;        // For number inputs
  step?: number;       // For number inputs
}

/**
 * Position in 2D space for node placement
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Node data stored in the flow graph
 */
export interface NodeData {
  id: string;
  type: NodeType;
  position: Position;
  data: {
    label?: string;
    code?: string;           // For code nodes (Synthase scripts)
    value?: unknown;         // For static input nodes
    io?: IODefinition;       // Cached IO from static analysis
    config?: Record<string, unknown>; // Node-specific config
  };
}

/**
 * Edge connecting two nodes
 */
export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;    // Output handle on source node
  targetHandle?: string;    // Input handle on target node
}

/**
 * Complete flow definition stored in SQLite
 */
export interface FlowData {
  id: string;
  name: string;
  version: string;
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: number;
  updatedAt?: number;
  metadata?: FlowMetadata;
}

export interface FlowMetadata {
  description?: string;
  author?: string;
  tags?: string[];
  // Subflow metadata - when this flow is used as a node
  isSubflow?: boolean;
  subflowConfig?: SubflowConfig;
}

/**
 * Configuration for a flow that can be used as a subflow node
 */
export interface SubflowConfig {
  /** Display name when used as a node */
  nodeName: string;
  /** Category for grouping in toolbar */
  category?: string;
  /** Color theme for the node */
  color?: string;
  /** Icon name (from lucide-react) */
  icon?: string;
  /** Version of the subflow definition */
  version?: string;
  /** Input port definitions (derived from input nodes in the flow) */
  inputs: SubflowPort[];
  /** Output port definitions (derived from output nodes in the flow) */
  outputs: SubflowPort[];
}

/**
 * Definition of an input/output port for a subflow
 */
export interface SubflowPort {
  /** Port identifier (used as handle ID) */
  id: string;
  /** Display name */
  name: string;
  /** Expected data type */
  type: string;
  /** Description for tooltip */
  description?: string;
  /** Default value (for inputs) */
  defaultValue?: unknown;
  /** Whether this port is required (for inputs) */
  required?: boolean;
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeType = 
  | 'code'              // Synthase script execution
  | 'file_input'        // Load any supported file type
  | 'file_output'       // Export any supported file type
  | 'output'            // Generic output (subflow return value)
  | 'viewer'            // Preview any data type
  | 'subflow'           // Embedded flow (reusable node)
  // Primitive inputs
  | 'static_input'      // Static value input
  | 'number_input'      // Number slider/input
  | 'text_input'        // Text field
  | 'boolean_input'     // Toggle switch
  | 'select_input'      // Dropdown selection
  | 'input'             // Generic input (with dataType)
  // Legacy schematic nodes (deprecated - use file_input/file_output)
  | 'schematic_input'   // @deprecated - Load schematic file
  | 'schematic_output'  // @deprecated - Export schematic file
  | 'schematic_viewer'  // @deprecated - 3D preview of schematic
  | 'comment';          // Non-functional comment node

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  schematics?: Record<string, SchematicData>;
  /** Handles to schematics stored in worker (when returnHandles is true) */
  schematicHandles?: Record<string, string>;
  hasSchematic?: boolean;
  executionTime?: number;
  error?: ExecutionError;
}

export interface ExecutionError {
  message: string;
  type: string;
  stack?: string;
  nodeId?: string;
}

export interface NodeExecutionState {
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startTime?: number;
  endTime?: number;
  output?: unknown;
  error?: ExecutionError;
}

export interface FlowExecutionState {
  flowId: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  startTime: number;
  endTime?: number;
  nodeStates: Record<string, NodeExecutionState>;
  finalOutput?: Record<string, unknown>;
}

// ============================================================================
// Data Value Types - Generic data that flows between nodes
// ============================================================================

/**
 * All supported data formats for the flow system
 */
export type DataFormat = 
  // Schematic formats
  | 'litematic' | 'schematic' | 'schem' | 'nbt' | 'mock'
  // Image formats
  | 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp' | 'svg'
  // Data formats
  | 'csv' | 'json' | 'xml' | 'yaml'
  // Text formats
  | 'text' | 'markdown'
  // Binary/other
  | 'binary' | 'unknown';

/**
 * Data category for grouping related formats
 */
export type DataCategory = 'schematic' | 'image' | 'data' | 'text' | 'binary';

/**
 * Map format to category
 */
export function getDataCategory(format: DataFormat): DataCategory {
  switch (format) {
    case 'litematic':
    case 'schematic':
    case 'schem':
    case 'nbt':
    case 'mock':
      return 'schematic';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return 'image';
    case 'csv':
    case 'json':
    case 'xml':
    case 'yaml':
      return 'data';
    case 'text':
    case 'markdown':
      return 'text';
    default:
      return 'binary';
  }
}

/**
 * Base interface for all data values
 */
export interface BaseDataValue {
  /** The format of the data */
  format: DataFormat;
  /** The actual data - can be binary or string */
  data: Uint8Array | string;
  /** Optional metadata about the data */
  metadata?: DataMetadata;
  /** Handle ID for worker-stored data (optional - if present, data might be a preview) */
  handleId?: string;
}

/**
 * Common metadata for all data types
 */
export interface DataMetadata {
  name?: string;
  author?: string;
  description?: string;
  createdAt?: number;
  fileSize?: number;
  mimeType?: string;
  // Extended metadata (type-specific)
  [key: string]: unknown;
}

// ============================================================================
// Schematic Types
// ============================================================================

export type SchematicFormat = 'litematic' | 'schematic' | 'schem' | 'nbt' | 'mock';

export interface SchematicMetadata extends DataMetadata {
  dimensions?: { x: number; y: number; z: number };
  blockCount?: number;
}

export interface SchematicData extends BaseDataValue {
  format: SchematicFormat;
  metadata?: SchematicMetadata;
}

/**
 * Helper to check if a value looks like binary data (Uint8Array or similar).
 * This handles cross-realm issues where instanceof Uint8Array fails for data
 * that comes from a worker.
 */
function isBinaryData(data: unknown): boolean {
  if (!data) return false;
  if (data instanceof Uint8Array) return true;
  if (ArrayBuffer.isView(data)) return true;
  if (data instanceof ArrayBuffer) return true;
  // Fallback check for cross-realm objects that look like typed arrays
  if (typeof data === 'object' && 'byteLength' in data && typeof (data as { byteLength: unknown }).byteLength === 'number') {
    return true;
  }
  return false;
}

/**
 * Type guard to check if a value is a SchematicData object
 */
export function isSchematicData(value: unknown): value is SchematicData {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  // Check for required SchematicData properties
  const validFormats: SchematicFormat[] = ['litematic', 'schematic', 'schem', 'nbt', 'mock'];
  const hasValidFormat = typeof obj.format === 'string' && validFormats.includes(obj.format as SchematicFormat);
  const hasData = isBinaryData(obj.data) || typeof obj.data === 'string';
  
  return hasValidFormat && hasData;
}

// ============================================================================
// Image Types
// ============================================================================

export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp' | 'svg';

export interface ImageMetadata extends DataMetadata {
  width?: number;
  height?: number;
  channels?: number;
}

export interface ImageData extends BaseDataValue {
  format: ImageFormat;
  metadata?: ImageMetadata;
}

export function isImageData(value: unknown): value is ImageData {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  const validFormats: ImageFormat[] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  const hasValidFormat = typeof obj.format === 'string' && validFormats.includes(obj.format as ImageFormat);
  const hasData = isBinaryData(obj.data) || typeof obj.data === 'string';
  
  return hasValidFormat && hasData;
}

// ============================================================================
// Tabular Data Types (CSV, etc.)
// ============================================================================

export type TabularFormat = 'csv' | 'json' | 'xml' | 'yaml';

export interface TabularMetadata extends DataMetadata {
  rowCount?: number;
  columnCount?: number;
  columns?: string[];
  hasHeader?: boolean;
}

export interface TabularData extends BaseDataValue {
  format: TabularFormat;
  metadata?: TabularMetadata;
}

export function isTabularData(value: unknown): value is TabularData {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  
  const validFormats: TabularFormat[] = ['csv', 'json', 'xml', 'yaml'];
  const hasValidFormat = typeof obj.format === 'string' && validFormats.includes(obj.format as TabularFormat);
  const hasData = isBinaryData(obj.data) || typeof obj.data === 'string';
  
  return hasValidFormat && hasData;
}

// ============================================================================
// Union type for any data value
// ============================================================================

export type DataValue = SchematicData | ImageData | TabularData | BaseDataValue;

export function isDataValue(value: unknown): value is DataValue {
  return isSchematicData(value) || isImageData(value) || isTabularData(value) || (
    value !== null &&
    typeof value === 'object' &&
    'format' in value &&
    'data' in value
  );
}

/**
 * Get file extension for a data format
 */
export function getExtensionForFormat(format: DataFormat): string {
  const extensions: Record<DataFormat, string> = {
    litematic: '.litematic',
    schematic: '.schematic',
    schem: '.schem',
    nbt: '.nbt',
    mock: '.json',
    png: '.png',
    jpg: '.jpg',
    jpeg: '.jpeg',
    gif: '.gif',
    webp: '.webp',
    svg: '.svg',
    csv: '.csv',
    json: '.json',
    xml: '.xml',
    yaml: '.yaml',
    text: '.txt',
    markdown: '.md',
    binary: '.bin',
    unknown: '',
  };
  return extensions[format] || '';
}

/**
 * Detect format from file extension
 */
export function detectFormatFromExtension(filename: string): DataFormat {
  const ext = filename.toLowerCase().split('.').pop() || '';
  const formatMap: Record<string, DataFormat> = {
    litematic: 'litematic',
    schematic: 'schematic',
    schem: 'schem',
    nbt: 'nbt',
    png: 'png',
    jpg: 'jpg',
    jpeg: 'jpeg',
    gif: 'gif',
    webp: 'webp',
    svg: 'svg',
    csv: 'csv',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    txt: 'text',
    md: 'markdown',
  };
  return formatMap[ext] || 'unknown';
}

// ============================================================================
// Worker Communication Types
// ============================================================================

export const MESSAGE_TYPES = {
  // Initialization
  INITIALIZE: 'INITIALIZE',
  INITIALIZE_SUCCESS: 'INITIALIZE_SUCCESS',
  INITIALIZE_ERROR: 'INITIALIZE_ERROR',
  
  // Execution
  EXECUTE_SCRIPT: 'EXECUTE_SCRIPT',
  EXECUTE_FLOW: 'EXECUTE_FLOW',
  EXECUTION_SUCCESS: 'EXECUTION_SUCCESS',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  EXECUTION_PROGRESS: 'EXECUTION_PROGRESS',
  
  // Validation
  VALIDATE_SCRIPT: 'VALIDATE_SCRIPT',
  VALIDATION_RESULT: 'VALIDATION_RESULT',
  
  // Node events
  NODE_START: 'NODE_START',
  NODE_FINISH: 'NODE_FINISH',
  NODE_ERROR: 'NODE_ERROR',
  
  // Utilities
  GET_CONTEXT_PROVIDERS: 'GET_CONTEXT_PROVIDERS',
  CONTEXT_PROVIDERS_RESULT: 'CONTEXT_PROVIDERS_RESULT',
  
  // Cancellation
  CANCEL_EXECUTION: 'CANCEL_EXECUTION',
  EXECUTION_CANCELLED: 'EXECUTION_CANCELLED',
  
  // Data store operations
  STORE_DATA: 'STORE_DATA',
  STORE_DATA_SUCCESS: 'STORE_DATA_SUCCESS',
  GET_DATA: 'GET_DATA',
  GET_DATA_SUCCESS: 'GET_DATA_SUCCESS',
  GET_PREVIEW: 'GET_PREVIEW',
  GET_PREVIEW_SUCCESS: 'GET_PREVIEW_SUCCESS',
  RELEASE_DATA: 'RELEASE_DATA',
  RELEASE_DATA_SUCCESS: 'RELEASE_DATA_SUCCESS',
  LIST_HANDLES: 'LIST_HANDLES',
  LIST_HANDLES_SUCCESS: 'LIST_HANDLES_SUCCESS',
  
  // General
  ERROR: 'ERROR',
  READY: 'READY',
} as const;

export type MessageType = typeof MESSAGE_TYPES[keyof typeof MESSAGE_TYPES];

// Alias for backward compatibility
export const DATA_STORE_MESSAGES = {
  STORE_DATA: MESSAGE_TYPES.STORE_DATA,
  STORE_DATA_SUCCESS: MESSAGE_TYPES.STORE_DATA_SUCCESS,
  GET_DATA: MESSAGE_TYPES.GET_DATA,
  GET_DATA_SUCCESS: MESSAGE_TYPES.GET_DATA_SUCCESS,
  GET_PREVIEW: MESSAGE_TYPES.GET_PREVIEW,
  GET_PREVIEW_SUCCESS: MESSAGE_TYPES.GET_PREVIEW_SUCCESS,
  RELEASE_DATA: MESSAGE_TYPES.RELEASE_DATA,
  RELEASE_DATA_SUCCESS: MESSAGE_TYPES.RELEASE_DATA_SUCCESS,
  LIST_HANDLES: MESSAGE_TYPES.LIST_HANDLES,
  LIST_HANDLES_SUCCESS: MESSAGE_TYPES.LIST_HANDLES_SUCCESS,
} as const;

export const WORKER_STATES = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  EXECUTING: 'executing',
  ERROR: 'error',
} as const;

export type WorkerState = typeof WORKER_STATES[keyof typeof WORKER_STATES];

export interface WorkerMessage<T = unknown> {
  type: MessageType;
  payload: T;
  id?: number;
  error?: string;
}

export interface WorkerConfig {
  timeout?: number;
  maxSchematicSize?: number;
  progressUpdateInterval?: number;
  customContextProviders?: Record<string, unknown>;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  timeout: 120000, // 2 minutes
  maxSchematicSize: 50 * 1024 * 1024, // 50MB
  progressUpdateInterval: 100,
};

// ============================================================================
// Engine Events
// ============================================================================

export type EngineEvents = {
  'flow:start': { flowId: string };
  'flow:finish': { flowId: string; result: FlowExecutionState };
  'flow:error': { flowId: string; error: ExecutionError };
  'flow:cancelled': { flowId: string };
  
  'node:start': { nodeId: string; flowId: string };
  'node:finish': { nodeId: string; flowId: string; output: unknown };
  'node:error': { nodeId: string; flowId: string; error: ExecutionError };
  
  'progress': { message: string; percent?: number; data?: unknown };
  'log': { level: 'info' | 'warn' | 'error' | 'debug'; message: string };
  
  'worker:ready': Record<string, never>;
  'worker:error': { error: Error };
};

// ============================================================================
// Validation Schemas (Zod)
// ============================================================================

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const IOPortSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
});

export const IODefinitionSchema = z.object({
  inputs: z.record(IOPortSchema),
  outputs: z.record(IOPortSchema),
});

export const NodeDataSchema = z.object({
  id: z.string(),
  type: z.enum([
    'code', 'file_input', 'file_output', 'viewer', 'input',
    'schematic_input', 'schematic_output', 'schematic_viewer',
    'static_input', 'number_input', 'text_input', 'boolean_input',
    'select_input', 'comment'
  ]),
  position: PositionSchema,
  data: z.object({
    label: z.string().optional(),
    code: z.string().optional(),
    value: z.unknown().optional(),
    io: IODefinitionSchema.optional(),
    config: z.record(z.unknown()).optional(),
  }),
});

export const EdgeDataSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

export const FlowMetadataSchema = z.object({
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const FlowDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  nodes: z.array(NodeDataSchema),
  edges: z.array(EdgeDataSchema),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  metadata: FlowMetadataSchema.optional(),
});

// Type guard utilities
export function isCodeNode(node: NodeData): boolean {
  return node.type === 'code';
}

export function isInputNode(node: NodeData): boolean {
  return node.type.endsWith('_input') || node.type === 'input' || node.type === 'file_input';
}

export function isSchematicNode(node: NodeData): boolean {
  return node.type.startsWith('schematic_');
}

export function isFileNode(node: NodeData): boolean {
  return node.type === 'file_input' || node.type === 'file_output';
}

export function isSubflowNode(node: NodeData): boolean {
  return node.type === 'subflow';
}

// ============================================================================
// Subflow Types
// ============================================================================

/**
 * Data stored in a subflow node
 */
export interface SubflowNodeData {
  /** Display label */
  label?: string;
  /** Reference to the source flow ID */
  flowId: string;
  /** Cached subflow configuration (from the source flow's metadata) */
  config: SubflowConfig;
  /** The complete flow definition (embedded for execution) */
  flowDefinition?: FlowData;
  /** Whether the subflow is expanded (shows internal flow) */
  expanded?: boolean;
}

/**
 * Result of extracting subflow configuration from a flow
 */
export interface ExtractedSubflowConfig {
  /** Whether extraction was successful */
  valid: boolean;
  /** Error message if not valid */
  error?: string;
  /** The extracted configuration */
  config?: SubflowConfig;
  /** Input nodes found in the flow */
  inputNodes?: NodeData[];
  /** Output/viewer nodes found in the flow */
  outputNodes?: NodeData[];
}

/**
 * Extract subflow configuration from a flow definition
 * Analyzes input and output nodes to determine the interface
 */
export function extractSubflowConfig(flow: FlowData): ExtractedSubflowConfig {
  const inputNodes = flow.nodes.filter(n => 
    n.type?.endsWith('_input') || n.type === 'input' || n.type === 'file_input'
  );
  
  // Look for output nodes, viewer nodes with passthrough, OR file_output nodes (legacy)
  const outputNodes = flow.nodes.filter(n => {
    if (n.type === 'output') return true;
    if (n.type === 'file_output') return true;
    if (n.type === 'viewer') {
      // Check multiple possible locations for passthrough flag
      const nodeData = n.data as any;
      return nodeData?.passthrough === true || 
             nodeData?.config?.passthrough === true;
    }
    return false;
  });
  
  if (inputNodes.length === 0) {
    return {
      valid: false,
      error: 'Flow must have at least one input node to be used as a subflow'
    };
  }
  
  if (outputNodes.length === 0) {
    return {
      valid: false,
      error: 'Flow must have at least one output node (viewer with passthrough or file output) to be used as a subflow'
    };
  }
  
  // Build input ports
  const inputs: SubflowPort[] = inputNodes.map(node => ({
    id: node.id,
    name: node.data.label || node.id,
    type: inferPortType(node),
    description: node.data.config?.description as string | undefined,
    defaultValue: node.data.value,
    required: !(node.data.config?.optional === true)
  }));
  
  // Build output ports
  const outputs: SubflowPort[] = outputNodes.map(node => ({
    id: node.id,
    name: node.data.label || node.id,
    type: inferPortType(node),
    description: node.data.config?.description as string | undefined
  }));
  
  return {
    valid: true,
    config: {
      nodeName: flow.name,
      category: flow.metadata?.tags?.[0] || 'Custom',
      version: flow.version,
      inputs,
      outputs
    },
    inputNodes,
    outputNodes
  };
}

/**
 * Infer the data type for a port based on node configuration
 */
function inferPortType(node: NodeData): string {
  const nodeData = node.data as any;
  
  // Check for explicit dataType first
  if (nodeData?.dataType) return nodeData.dataType;
  if (nodeData?.config?.dataType) return nodeData.config.dataType;
  
  switch (node.type) {
    case 'number_input': return 'number';
    case 'text_input': return 'string';
    case 'boolean_input': return 'boolean';
    case 'file_input': return 'file';
    case 'file_output': return 'file';
    case 'input': return (nodeData?.config?.dataType as string) || (nodeData?.dataType as string) || 'any';
    case 'viewer': return 'any';
    default: return 'any';
  }
}

// ============================================================================
// Worker Data Store Types
// ============================================================================

/**
 * A handle to data stored in the worker
 * The main thread gets this lightweight reference instead of the full data
 */
export interface DataHandle {
  /** Unique identifier for this data in the worker store */
  id: string;
  /** The category of data (for display purposes) */
  category: DataCategory;
  /** The specific format */
  format: DataFormat;
  /** Approximate size in bytes (for memory management) */
  byteSize: number;
  /** Metadata preview (doesn't include the actual data) */
  metadata?: DataMetadata;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Request to serialize data for preview/export
 */
export interface SerializeDataRequest {
  /** The handle ID to serialize */
  handleId: string;
  /** Quality/compression settings for preview */
  preview?: {
    /** Max dimension for images */
    maxDimension?: number;
    /** Whether to include full data or just preview */
    fullData?: boolean;
  };
}

