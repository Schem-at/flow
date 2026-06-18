import { uuid } from '../lib/uuid';
/**
 * Zustand store for managing flow state with execution cache
 */

import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type {
  FlowData,
  IODefinition,
  NodeData,
  BlockContract,
  FlowType,
  GroupNodeData,
  MapNodeData,
  GroupNodeLike,
  GroupEdge,
} from '@flow/core';
import {
  extractSubflowConfig,
  isTypeCompatible,
  groupNodes as deriveGroup,
  ungroup as inlineGroup,
  nextGroupId,
} from '@flow/core';

// ============================================================================
// Types
// ============================================================================

export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'stale' | 'cached';

export type InputWidgetType = 
  | 'number'        // Standard number input
  | 'slider'        // Range slider
  | 'text'          // Single line text
  | 'textarea'      // Multi-line text
  | 'boolean'       // Toggle switch
  | 'select'        // Dropdown
  | 'color';        // Color picker

export interface ExecutionError {
  message: string;
  type?: string;
  stack?: string;
  lineNumber?: number;
  columnNumber?: number;
  codeSnippet?: string;
}

export interface NodeExecutionCache {
  status: NodeExecutionStatus;
  output?: unknown;
  error?: ExecutionError;
  lastExecutedAt?: number;
  executionTime?: number;  // Duration in milliseconds
  inputHash?: string;  // Hash of inputs to detect changes
  fromCache?: boolean;  // Whether this result was reused from cache
}

export type ExecutionMode = 'manual' | 'live';

export interface ExecutionSettings {
  mode: ExecutionMode;  // 'manual' = wait for explicit run, 'live' = auto-run on input change
  runStaleOnly: boolean;  // When running, only execute stale nodes
}

export interface FlowNode extends Node {
  data: {
    label?: string;
    code?: string;
    value?: unknown;
    width?: number;
    height?: number;
    io?: IODefinition;
    contract?: BlockContract;  // v2 blocks: FlowType contract (drives ports)
    moduleRef?: {              // Shared-module reference for code nodes
      id: string;
      slug: string;
      version: string;
      pinned?: boolean;
    };
    config?: Record<string, unknown>;
    // Input node specific
    dataType?: 'number' | 'string' | 'boolean';  // The actual data type
    inputType?: 'number' | 'text' | 'boolean';   // Legacy support
    widgetType?: InputWidgetType;                 // How to display/input
    isConstant?: boolean;      // If true, not exposed in API
    min?: number;              // For number/slider
    max?: number;              // For number/slider
    step?: number;             // For number/slider
    options?: string[];        // For select
    placeholder?: string;      // For text inputs
    description?: string;      // Input description
    // Bundle / unbundle (object meta-nodes): named field list. For a bundle
    // each field is an INPUT port (packed into one object); for an unbundle
    // each field is an OUTPUT port (plucked off the incoming object).
    bundleFields?: Array<{ name: string }>;
    // Group / subflow meta-node: embedded subgraph + derived boundary contract.
    subgraph?: GroupNodeData['subgraph'];
    groupInputs?: GroupNodeData['groupInputs'];
    groupOutputs?: GroupNodeData['groupOutputs'];
    // Switch / select meta-node: number of `case` input ports (default 2).
    caseCount?: number;
    // Map / iterate meta-node: body boundary contract (reuses the subgraph shape
    // above). `item`/`index` are body INPUTS; `result` (resultPort) is collected.
    bodyInputs?: MapNodeData['bodyInputs'];
    bodyOutputs?: MapNodeData['bodyOutputs'];
    resultPort?: string;
    // Viewer node specific
    passthrough?: boolean;     // If true, viewer passes value to output
    // File input/output node specific
    fileData?: unknown;        // Loaded file data (DataValue)
    fileName?: string;         // Original filename
    customFileName?: string;   // Custom output filename
    acceptedTypes?: string[];  // Accepted data categories for file input
    outputFormat?: string;     // Override output format
    // Subflow node specific
    flowId?: string;           // Reference to source flow
    flowDefinition?: FlowData; // Embedded flow definition
    expanded?: boolean;        // Whether subflow internals are shown
    isResizable?: boolean;    // Whether viewer node is resizable
    subflowConfig?: {          // Subflow port configuration
      nodeName: string;
      category?: string;
      color?: string;
      icon?: string;
      version?: string;
      inputs: Array<{
        id: string;
        name: string;
        type: string;
        description?: string;
        defaultValue?: unknown;
        required?: boolean;
      }>;
      outputs: Array<{
        id: string;
        name: string;
        type: string;
        description?: string;
      }>;
    };
  };
}

// History entry for undo/redo
interface HistoryEntry {
  nodes: FlowNode[];
  edges: Edge[];
  timestamp: number;
}

const MAX_HISTORY_SIZE = 50;

interface FlowState {
  // Flow data
  flowId: string | null;
  flowName: string;
  nodes: FlowNode[];
  edges: Edge[];
  
  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;  // Current position in history (-1 means at present)
  isUndoRedoing: boolean;  // Flag to prevent recording during undo/redo
  
  // Execution state
  nodeCache: Record<string, NodeExecutionCache>;
  executingNodeId: string | null;
  isExecuting: boolean;
  executionLogs: string[];
  liveExecutionTimer: ReturnType<typeof setTimeout> | null;
  /** Live progress for the currently executing node (from Progress.report). */
  nodeProgress: Record<string, { percent?: number; message?: string } | undefined>;
  /** A type-mismatched connection awaiting the user's decision. */
  pendingConnection: {
    source: string;
    sourceHandle?: string | null;
    target: string;
    targetHandle?: string | null;
    sourceType: FlowType;
    targetType: FlowType;
  } | null;
  
  // UI state
  selectedNodeId: string | null;
  debugMode: boolean;  // Show data flow debug info on edges
  
  // Actions
  setFlowId: (id: string | null) => void;
  setFlowName: (name: string) => void;
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  
  // Node operations
  addNode: (node: FlowNode) => void;
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  // Group / subflow meta-node
  /** Collapse the given (or currently-selected) nodes into one group node. */
  groupSelected: (nodeIds?: string[]) => string | null;
  /** Inline a group node's subgraph back into the parent flow. */
  ungroupNode: (groupId: string) => void;
  
  // Execution cache
  setNodeExecutionStatus: (nodeId: string, status: NodeExecutionStatus, output?: unknown, error?: ExecutionError, executionTime?: number) => void;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  invalidateNode: (nodeId: string) => void;
  invalidateDownstream: (nodeId: string) => void;
  clearAllCache: () => void;
  getNodeCache: (nodeId: string) => NodeExecutionCache | undefined;
  isEdgeReady: (edgeId: string) => boolean;
  
  // Execution
  setIsExecuting: (isExecuting: boolean) => void;
  setExecutingNodeId: (nodeId: string | null) => void;
  addExecutionLog: (log: string) => void;
  clearExecutionLogs: () => void;
  setNodeProgress: (nodeId: string, progress: { percent?: number; message?: string } | undefined) => void;
  setPendingConnection: (pending: FlowState['pendingConnection']) => void;
  
  // Debug
  setDebugMode: (enabled: boolean) => void;
  toggleDebugMode: () => void;
  
  // Execution settings
  executionSettings: ExecutionSettings;
  setExecutionMode: (mode: ExecutionMode) => void;
  setRunStaleOnly: (runStaleOnly: boolean) => void;
  
  // Smart execution helpers
  getStaleNodes: () => FlowNode[];
  getNodesToExecute: (onlyStale?: boolean) => FlowNode[];
  markNodeCached: (nodeId: string) => void;
  
  // Flow operations
  loadFlow: (flow: FlowData) => void;
  exportFlow: () => FlowData;
  clearFlow: () => void;
  
  // Input node helpers
  getExposedInputs: () => FlowNode[];
  
  // History operations
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: () => void;  // Manually push current state to history
  
  // Subflow operations
  savedSubflows: SavedSubflow[];
  saveAsSubflow: (name: string, category?: string) => SavedSubflow | null;
  loadSubflows: () => void;
  deleteSubflow: (id: string) => void;
  addSubflowNode: (subflow: SavedSubflow, position: { x: number; y: number }) => void;
}

/**
 * A saved subflow that can be used as a node
 */
export interface SavedSubflow {
  id: string;
  name: string;
  category: string;
  version: string;
  flowDefinition: FlowData;
  config: import('@flow/core').SubflowConfig;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all downstream nodes from a given node
 */
function getDownstreamNodes(nodeId: string, edges: Edge[]): Set<string> {
  const downstream = new Set<string>();
  const queue = [nodeId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoingEdges = edges.filter(e => e.source === current);
    
    for (const edge of outgoingEdges) {
      if (!downstream.has(edge.target)) {
        downstream.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  
  return downstream;
}

/**
 * Deep clone nodes and edges for history
 */
function cloneFlowState(nodes: FlowNode[], edges: Edge[]): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(edges)),
  };
}

// ============================================================================
// Store
// ============================================================================

const initialNodes: FlowNode[] = [];
const initialEdges: Edge[] = [];

export const useFlowStore = create<FlowState>((set, get) => ({
  // Initial state
  flowId: null,
  flowName: 'Untitled Flow',
  nodes: initialNodes,
  edges: initialEdges,
  
  // History state
  history: [],
  historyIndex: -1,
  isUndoRedoing: false,
  
  nodeCache: {},
  executingNodeId: null,
  nodeProgress: {},
  pendingConnection: null,
  selectedNodeId: null,
  isExecuting: false,
  executionLogs: [],
  liveExecutionTimer: null,
  debugMode: false,
  
  // Execution settings
  executionSettings: {
    mode: 'manual',
    runStaleOnly: false,
  },

  // Setters
  setFlowId: (id) => set({ flowId: id }),
  setFlowName: (name) => set({ flowName: name }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  // Debug mode
  setDebugMode: (enabled) => set({ debugMode: enabled }),
  toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
  
  // Execution settings
  setExecutionMode: (mode) => set((state) => ({
    executionSettings: { ...state.executionSettings, mode },
  })),
  setRunStaleOnly: (runStaleOnly) => set((state) => ({
    executionSettings: { ...state.executionSettings, runStaleOnly },
  })),
  
  // Smart execution helpers
  getStaleNodes: () => {
    const state = get();
    return state.nodes.filter(n => {
      const cache = state.nodeCache[n.id];
      return cache?.status === 'stale' || cache?.status === 'idle' || !cache;
    });
  },
  
  getNodesToExecute: (onlyStale = false) => {
    const state = get();
    if (!onlyStale) {
      return state.nodes;
    }
    
    // For stale-only execution, we need to include:
    // 1. All stale nodes
    // 2. All nodes that depend on stale nodes (they need inputs)
    const staleIds = new Set<string>();
    
    // First pass: find all stale/idle nodes
    for (const node of state.nodes) {
      const cache = state.nodeCache[node.id];
      if (cache?.status === 'stale' || cache?.status === 'idle' || !cache) {
        staleIds.add(node.id);
      }
    }
    
    // Second pass: Add all downstream nodes from stale nodes
    for (const nodeId of Array.from(staleIds)) {
      const downstream = getDownstreamNodes(nodeId, state.edges);
      for (const downId of downstream) {
        staleIds.add(downId);
      }
    }
    
    return state.nodes.filter(n => staleIds.has(n.id));
  },
  
  markNodeCached: (nodeId) => {
    const state = get();
    const currentCache = state.nodeCache[nodeId];
    // Preserve all metadata (executionTime, lastExecutedAt, etc.) when marking as cached
    if (currentCache?.status === 'completed' || currentCache?.status === 'cached') {
      set({
        nodeCache: {
          ...state.nodeCache,
          [nodeId]: {
            ...currentCache,
            status: 'cached',
            fromCache: true,
            // Keep all existing metadata
          },
        },
      });
    }
  },

  // React Flow handlers
  onNodesChange: (changes) => {
    const state = get();
    
    // Check if this is a structural change that should be recorded
    const hasStructuralChange = changes.some(
      c => c.type === 'remove' || c.type === 'add'
    );
    
    // For position changes, we debounce by not recording every move
    // Instead we'll record on mouseup (handled separately)
    
    if (hasStructuralChange && !state.isUndoRedoing) {
      get().pushHistory();
    }
    
    set({
      nodes: applyNodeChanges(changes, state.nodes),
    });
  },
  
  onEdgesChange: (changes) => {
    const state = get();
    
    // Record history for edge removals
    const hasRemoval = changes.some(c => c.type === 'remove');
    if (hasRemoval && !state.isUndoRedoing) {
      get().pushHistory();
    }
    
    set({
      edges: applyEdgeChanges(changes, state.edges),
    });
  },
  
  onConnect: (connection) => {
    const state = get();

    // Type compatibility: when both port FlowTypes are known, refuse
    // incompatible edges (the registry of kinds knows what flows into what).
    const portType = (
      nodeId: string | null,
      handle: string | null | undefined,
      direction: 'source' | 'target'
    ): FlowType | null => {
      if (!nodeId) return null;
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return null;
      const data = node.data as Record<string, unknown>;
      const contract = data.contract as BlockContract | undefined;
      if (contract && handle) {
        return (direction === 'source' ? contract.outputs : contract.inputs)[handle] ?? null;
      }
      if (node.type === 'input') {
        const dataType = data.dataType as string | undefined;
        if (dataType === 'number') return { kind: 'number' };
        if (dataType === 'boolean') return { kind: 'boolean' };
        if (dataType === 'string') return { kind: 'string' };
      }
      if (node.type === 'asset' && direction === 'source') {
        const assetKind = data.assetKind as string | undefined;
        if (assetKind === 'image') return { kind: 'image' };
        if (assetKind === 'schematic') return { kind: 'schematic' };
        // unknown/binary payload — let it connect anywhere
      }
      return null;
    };

    const sourceType = portType(connection.source, connection.sourceHandle, 'source');
    const targetType = portType(connection.target, connection.targetHandle, 'target');
    if (sourceType && targetType && !isTypeCompatible(sourceType, targetType)) {
      // Hand the decision to the user: adapt the target block's contract,
      // force the connection, or cancel. The editor renders the prompt.
      set({
        pendingConnection: {
          source: connection.source!,
          sourceHandle: connection.sourceHandle,
          target: connection.target!,
          targetHandle: connection.targetHandle,
          sourceType,
          targetType,
        },
      });
      get().addExecutionLog(
        `⚠ Type mismatch: ${sourceType.kind} → ${targetType.kind} (${connection.sourceHandle} → ${connection.targetHandle})`
      );
      return;
    }

    // Record history before adding edge
    if (!state.isUndoRedoing) {
      get().pushHistory();
    }

    // When a new connection is made, invalidate the target node
    const targetId = connection.target;
    if (targetId) {
      get().invalidateNode(targetId);
    }

    set({
      edges: addEdge(connection, state.edges),
    });
  },

  // Node operations
  addNode: (node) => {
    const state = get();
    
    // Record history before adding node
    if (!state.isUndoRedoing) {
      get().pushHistory();
    }
    
    set({
      nodes: [...state.nodes, node],
      nodeCache: {
        ...state.nodeCache,
        [node.id]: { status: 'idle' },
      },
    });
  },

  updateNodeData: (nodeId, data) => {
    const state = get();
    const node = state.nodes.find(n => n.id === nodeId);
    const isInputNode = node?.type === 'input' || node?.type?.includes('_input');
    
    // For input nodes, update the cache with the new value immediately
    // For code nodes, invalidate on code changes
    const shouldInvalidate = 'code' in data && !isInputNode;
    
    set({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    });
    
    // For input nodes with value changes, update cache and invalidate downstream
    // Also check if we should trigger live execution
    if (isInputNode && 'value' in data) {
      get().setNodeOutput(nodeId, { output: data.value });
      get().invalidateDownstream(nodeId);
      
      // Emit event for live execution if in live mode (debounced)
      const currentTimer = get().liveExecutionTimer;
      if (currentTimer) {
        clearTimeout(currentTimer);
      }

      const timer = setTimeout(() => {
        const currentSettings = get().executionSettings;
        if (currentSettings.mode === 'live') {
          window.dispatchEvent(new CustomEvent('polymerase:liveExecutionTrigger', {
            detail: { sourceNodeId: nodeId, type: 'input-change' }
          }));
        }
        set({ liveExecutionTimer: null });
      }, 300);
      
      set({ liveExecutionTimer: timer });
    } else if (shouldInvalidate) {
      get().invalidateNode(nodeId);

      // Emit event for live execution if in live mode (debounced)
      const currentTimer = get().liveExecutionTimer;
      if (currentTimer) {
        clearTimeout(currentTimer);
      }

      const timer = setTimeout(() => {
        const currentSettings = get().executionSettings;
        if (currentSettings.mode === 'live') {
          window.dispatchEvent(new CustomEvent('polymerase:liveExecutionTrigger', {
            detail: { sourceNodeId: nodeId, type: 'code-change' }
          }));
        }
        set({ liveExecutionTimer: null });
      }, 300);
      
      set({ liveExecutionTimer: timer });
    }
  },

  deleteNode: (nodeId) => {
    const state = get();
    
    // Record history before deleting
    if (!state.isUndoRedoing) {
      get().pushHistory();
    }
    
    const newCache = { ...state.nodeCache };
    delete newCache[nodeId];
    
    set({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      nodeCache: newCache,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  // ── Group / subflow meta-node ───────────────────────────────────────────
  groupSelected: (nodeIds) => {
    const state = get();
    // Resolve the selection: explicit ids → React Flow `selected` → single sel.
    let ids = nodeIds && nodeIds.length ? nodeIds : state.nodes.filter((n) => n.selected).map((n) => n.id);
    if (ids.length === 0 && state.selectedNodeId) ids = [state.selectedNodeId];
    // Need at least 2 nodes to be a meaningful group (1 is allowed but odd).
    if (ids.length === 0) return null;

    const byId = new Map(state.nodes.map((n) => [n.id, n]));
    // Producing-port FlowType resolver, so boundary ports carry real types.
    const typeOf = (sourceId: string, handle: string | null | undefined): FlowType => {
      const node = byId.get(sourceId);
      if (!node) return { kind: 'unknown' };
      const contract = node.data.contract;
      if (contract) {
        const keys = Object.keys(contract.outputs);
        const key = handle && keys.includes(handle) ? handle : keys.length === 1 ? keys[0] : handle ?? '';
        if (key && contract.outputs[key]) return contract.outputs[key];
      }
      if (node.type === 'input' || node.type === 'constant') {
        const dt = node.data.dataType;
        if (dt === 'number') return { kind: 'number' };
        if (dt === 'boolean') return { kind: 'boolean' };
        return { kind: 'string' };
      }
      return { kind: 'unknown' };
    };

    if (!state.isUndoRedoing) get().pushHistory();

    const groupId = nextGroupId();
    const result = deriveGroup(
      state.nodes as unknown as GroupNodeLike[],
      state.edges as unknown as GroupEdge[],
      ids,
      { groupId, label: 'Group', typeOf }
    );

    // Centroid of the selection for the group node's position.
    const sel = ids.map((id) => byId.get(id)).filter(Boolean) as FlowNode[];
    const cx = sel.reduce((s, n) => s + (n.position?.x ?? 0), 0) / sel.length;
    const cy = sel.reduce((s, n) => s + (n.position?.y ?? 0), 0) / sel.length;

    // The transform returns plain GroupNodeLike objects (no React Flow props);
    // re-attach position/selected for nodes that survive, and build the group.
    const surviving = result.nodes
      .filter((n) => n.id !== groupId)
      .map((n) => byId.get(n.id))
      .filter(Boolean) as FlowNode[];
    const groupNode = result.nodes.find((n) => n.id === groupId)!;
    const newGroup: FlowNode = {
      id: groupId,
      type: 'group',
      position: { x: cx, y: cy },
      data: groupNode.data as FlowNode['data'],
      selected: true,
    };

    const newCache = { ...state.nodeCache };
    for (const id of ids) delete newCache[id];
    newCache[groupId] = { status: 'idle' };

    set({
      nodes: [...surviving.map((n) => ({ ...n, selected: false })), newGroup],
      edges: result.edges as unknown as Edge[],
      selectedNodeId: groupId,
      nodeCache: newCache,
    });
    return groupId;
  },

  ungroupNode: (groupId) => {
    const state = get();
    const group = state.nodes.find((n) => n.id === groupId);
    if (!group || group.type !== 'group') return;
    const data = group.data as unknown as GroupNodeData;
    if (!data.subgraph) return;

    if (!state.isUndoRedoing) get().pushHistory();

    const result = inlineGroup(
      state.nodes as unknown as GroupNodeLike[],
      state.edges as unknown as GroupEdge[],
      groupId
    );

    // Restore React Flow node props: subgraph nodes carry their own
    // position/data already (captured at group time); offset them around the
    // group's current position so they don't all stack at the origin.
    const gx = group.position?.x ?? 0;
    const gy = group.position?.y ?? 0;
    const subIds = new Set(data.subgraph.nodes.map((n) => n.id));
    const survivors = new Map(state.nodes.filter((n) => n.id !== groupId).map((n) => [n.id, n]));

    let i = 0;
    const restored: FlowNode[] = result.nodes.map((n) => {
      const prev = survivors.get(n.id);
      if (prev) return prev;
      // Reconstructed subgraph node.
      const sub = n as unknown as FlowNode;
      const pos = sub.position ?? { x: gx + (i % 3) * 220, y: gy + Math.floor(i / 3) * 140 };
      i++;
      return { ...sub, position: pos, selected: subIds.has(n.id) };
    });

    const newCache = { ...state.nodeCache };
    delete newCache[groupId];
    for (const id of subIds) if (!newCache[id]) newCache[id] = { status: 'idle' };

    set({
      nodes: restored,
      edges: result.edges as unknown as Edge[],
      selectedNodeId: null,
      nodeCache: newCache,
    });
  },

  // Execution cache
  setNodeExecutionStatus: (nodeId, status, output, error, executionTime) => {
    set({
      nodeCache: {
        ...get().nodeCache,
        [nodeId]: {
          ...get().nodeCache[nodeId],
          status,
          output: output !== undefined ? output : get().nodeCache[nodeId]?.output,
          error,  // Store full structured ExecutionError
          lastExecutedAt: status === 'completed' ? Date.now() : get().nodeCache[nodeId]?.lastExecutedAt,
          executionTime: executionTime !== undefined ? executionTime : get().nodeCache[nodeId]?.executionTime,
        },
      },
    });
  },
  
  setNodeOutput: (nodeId, output) => {
    set({
      nodeCache: {
        ...get().nodeCache,
        [nodeId]: {
          ...get().nodeCache[nodeId],
          status: 'completed',
          output,
          lastExecutedAt: Date.now(),
        },
      },
    });
  },
  
  invalidateNode: (nodeId) => {
    const state = get();
    const downstream = getDownstreamNodes(nodeId, state.edges);
    
    const newCache = { ...state.nodeCache };
    
    // Mark this node as stale
    newCache[nodeId] = {
      ...newCache[nodeId],
      status: 'stale',
    };
    
    // Mark all downstream nodes as stale
    for (const downstreamId of downstream) {
      newCache[downstreamId] = {
        ...newCache[downstreamId],
        status: 'stale',
      };
    }
    
    set({ nodeCache: newCache });
  },
  
  invalidateDownstream: (nodeId) => {
    const state = get();
    const downstream = getDownstreamNodes(nodeId, state.edges);
    
    const newCache = { ...state.nodeCache };
    
    for (const downstreamId of downstream) {
      newCache[downstreamId] = {
        ...newCache[downstreamId],
        status: 'stale',
      };
    }
    
    set({ nodeCache: newCache });
  },
  
  clearAllCache: () => {
    const newCache: Record<string, NodeExecutionCache> = {};
    for (const node of get().nodes) {
      newCache[node.id] = { status: 'idle' };
    }
    set({ nodeCache: newCache });
  },
  
  getNodeCache: (nodeId) => {
    return get().nodeCache[nodeId];
  },
  
  isEdgeReady: (edgeId) => {
    const state = get();
    const edge = state.edges.find(e => e.id === edgeId);
    if (!edge) return false;
    
    const sourceCache = state.nodeCache[edge.source];
    return sourceCache?.status === 'completed';
  },

  // Execution
  setIsExecuting: (isExecuting) => set({ isExecuting }),

  setNodeProgress: (nodeId, progress) =>
    set((state) => ({ nodeProgress: { ...state.nodeProgress, [nodeId]: progress } })),

  setPendingConnection: (pending) => set({ pendingConnection: pending }),
  setExecutingNodeId: (nodeId) => set({ executingNodeId: nodeId }),
  
  addExecutionLog: (log) => {
    set({
      executionLogs: [...get().executionLogs, `[${new Date().toLocaleTimeString()}] ${log}`],
    });
  },
  
  clearExecutionLogs: () => set({ executionLogs: [] }),

  // Flow operations
  loadFlow: (flow) => {
    const newCache: Record<string, NodeExecutionCache> = {};
    for (const node of flow.nodes) {
      newCache[node.id] = { status: 'idle' };
    }
    
    set({
      flowId: flow.id,
      flowName: flow.name,
      nodes: flow.nodes.map((node: NodeData) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: flow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      nodeCache: newCache,
      executionLogs: [],
      // Clear history when loading a new flow
      history: [],
      historyIndex: -1,
    });
  },

  exportFlow: () => {
    const state = get();
    return {
      id: state.flowId || uuid(),
      name: state.flowName,
      version: '1.0.0',
      nodes: state.nodes.map((node) => ({
        id: node.id,
        type: node.type as NodeData['type'],
        position: node.position,
        data: node.data,
      })),
      edges: state.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      })),
      createdAt: Date.now(),
    };
  },

  clearFlow: () => {
    set({
      flowId: null,
      flowName: 'Untitled Flow',
      nodes: [],
      edges: [],
      nodeCache: {},
      selectedNodeId: null,
      executionLogs: [],
      // Clear history when clearing flow
      history: [],
      historyIndex: -1,
    });
  },
  
  // Input node helpers
  getExposedInputs: () => {
    const state = get();
    return state.nodes.filter(
      node => node.type?.includes('input') && !node.data.isConstant
    );
  },
  
  // History operations
  pushHistory: () => {
    const state = get();
    if (state.isUndoRedoing) return;  // Don't record during undo/redo
    
    const entry: HistoryEntry = {
      ...cloneFlowState(state.nodes, state.edges),
      timestamp: Date.now(),
    };
    
    // If we're not at the end of history, truncate future entries
    let newHistory = state.historyIndex >= 0 
      ? state.history.slice(0, state.historyIndex + 1)
      : [...state.history];
    
    // Add new entry
    newHistory.push(entry);
    
    // Limit history size
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory = newHistory.slice(-MAX_HISTORY_SIZE);
    }
    
    set({
      history: newHistory,
      historyIndex: -1,  // Reset to present
    });
  },
  
  undo: () => {
    const state = get();
    
    // Calculate which history entry to go to
    const currentIndex = state.historyIndex === -1 
      ? state.history.length - 1  // We're at present, go to last history entry
      : state.historyIndex - 1;   // Go back one more
    
    if (currentIndex < 0 || state.history.length === 0) return;  // Nothing to undo
    
    // If at present, save current state first
    if (state.historyIndex === -1) {
      const currentEntry: HistoryEntry = {
        ...cloneFlowState(state.nodes, state.edges),
        timestamp: Date.now(),
      };
      set({
        history: [...state.history, currentEntry],
        isUndoRedoing: true,
      });
    } else {
      set({ isUndoRedoing: true });
    }
    
    const targetEntry = state.history[currentIndex];
    
    set({
      nodes: JSON.parse(JSON.stringify(targetEntry.nodes)),
      edges: JSON.parse(JSON.stringify(targetEntry.edges)),
      historyIndex: currentIndex,
      isUndoRedoing: false,
    });
  },
  
  redo: () => {
    const state = get();
    
    if (state.historyIndex === -1 || state.historyIndex >= state.history.length - 1) {
      return;  // Nothing to redo (at present or at end)
    }
    
    const nextIndex = state.historyIndex + 1;
    const targetEntry = state.history[nextIndex];
    
    set({
      isUndoRedoing: true,
    });
    
    // If next is the last entry (present), just restore and reset index
    const isAtPresent = nextIndex === state.history.length - 1;
    
    set({
      nodes: JSON.parse(JSON.stringify(targetEntry.nodes)),
      edges: JSON.parse(JSON.stringify(targetEntry.edges)),
      historyIndex: isAtPresent ? -1 : nextIndex,
      isUndoRedoing: false,
    });
  },
  
  canUndo: () => {
    const state = get();
    // Can undo if there's history and we're either at present or not at the first entry
    return state.history.length > 0 && (state.historyIndex === -1 || state.historyIndex > 0);
  },
  
  canRedo: () => {
    const state = get();
    // Can redo if we're in history (not at present)
    return state.historyIndex !== -1 && state.historyIndex < state.history.length - 1;
  },
  
  // Subflow operations
  savedSubflows: [],
  
  saveAsSubflow: (name: string, category: string = 'Custom') => {
    const state = get();
    const flow = state.exportFlow();
    
    // Validate and extract configuration
    const extracted = extractSubflowConfig(flow);
    if (!extracted.valid || !extracted.config) {
      console.error('Cannot save as subflow:', extracted.error);
      return null;
    }
    
    const subflow: SavedSubflow = {
      id: uuid(),
      name,
      category,
      version: '1.0.0',
      flowDefinition: flow,
      config: {
        ...extracted.config,
        nodeName: name,
        category,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Save to localStorage
    const savedSubflows = [...state.savedSubflows, subflow];
    localStorage.setItem('polymerase_subflows', JSON.stringify(savedSubflows));
    
    set({ savedSubflows });
    return subflow;
  },
  
  loadSubflows: () => {
    try {
      const stored = localStorage.getItem('polymerase_subflows');
      if (stored) {
        const subflows = JSON.parse(stored) as SavedSubflow[];
        set({ savedSubflows: subflows });
      }
    } catch (e) {
      console.error('Failed to load subflows:', e);
    }
  },
  
  deleteSubflow: (id: string) => {
    const state = get();
    const savedSubflows = state.savedSubflows.filter(s => s.id !== id);
    localStorage.setItem('polymerase_subflows', JSON.stringify(savedSubflows));
    set({ savedSubflows });
  },
  
  addSubflowNode: (subflow: SavedSubflow, position: { x: number; y: number }) => {
    const state = get();
    const newNode: FlowNode = {
      id: `subflow-${uuid().slice(0, 8)}`,
      type: 'subflow',
      position,
      data: {
        label: subflow.name,
        flowId: subflow.id,
        subflowConfig: subflow.config,
        flowDefinition: subflow.flowDefinition,
      },
    };
    
    set({
      nodes: [...state.nodes, newNode],
      nodeCache: {
        ...state.nodeCache,
        [newNode.id]: { status: 'idle' },
      },
    });
  },
}));

// Initialize subflows on store creation
if (typeof window !== 'undefined') {
  setTimeout(() => {
    useFlowStore.getState().loadSubflows();
  }, 0);
}
