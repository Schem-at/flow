/**
 * Editor - Main flow editor component with execution state visualization
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  SelectionMode,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Edge } from '@xyflow/react';
import { type FlowNode } from '../../store/flowStore';

import { 
  FolderOpen, 
  Play, 
  Settings,
  Terminal,
  Plus,
  Globe,
  X,
  RotateCcw,
  Save,
  Maximize2,
  Grid3X3,
  Eye,
  Home,
  Book,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { nodeTypes } from '../nodes';
import { edgeTypes } from '../edges';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';
import { CodePanel } from './CodePanel';
import { ExecutionPanel } from './ExecutionPanel';
import { NodePropertiesPanel } from './NodePropertiesPanel';
import { FlowManager } from './FlowManager';
import { ApiPanel } from './ApiPanel';
import { FlowSettings } from './FlowSettings';
import { Modal } from '../ui/Modal';
import { ShortcutsModal } from '../ui/ShortcutsModal';
import { CommandPalette } from '../ui/CommandPalette';
import { MobileNodeDrawer } from './MobileNodeDrawer';
import { useLocalExecutor } from '../../hooks/useLocalExecutor';
import { parseExecutionError, createSimpleError } from '../../lib/utils';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export function Editor() {
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const { flowId: urlFlowId } = useParams();
  const navigate = useNavigate();
  
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    flowName,
    flowId,
    setFlowId,
    setFlowName,
    loadFlow,
    selectedNodeId,
    selectNode,
    deleteNode,
    addNode,
    clearAllCache,
    nodeCache,
    isExecuting,
    setIsExecuting,
    clearExecutionLogs,
    addExecutionLog,
    setNodeExecutionStatus,
    setExecutingNodeId,
    undo,
    redo,
    canUndo,
    canRedo,
    debugMode,
    toggleDebugMode,
    getStaleNodes,
    getNodesToExecute,
    markNodeCached,
  } = useFlowStore();

  // Track whether we've already loaded the flow from the URL to prevent
  // re-triggering loadFlow (which would overwrite user edits with stale data)
  const hasLoadedFlowRef = useRef<string | null>(null);

  // Fetch flow if URL has ID
  const { data: flowData, isLoading: isFlowLoading, error: flowError } = useQuery({
    queryKey: ['flow', urlFlowId],
    queryFn: async () => {
      if (!urlFlowId) return null;
      const res = await fetch(`${SERVER_URL}/api/flows/${urlFlowId}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow;
    },
    enabled: !!urlFlowId,
    staleTime: Infinity,
    retry: false,
  });

  // Load flow data when fetched — only once per flow ID
  useEffect(() => {
    if (flowData && flowData.id && hasLoadedFlowRef.current !== flowData.id) {
      hasLoadedFlowRef.current = flowData.id;
      loadFlow(flowData.jsonContent);
      setFlowId(flowData.id);
      if (flowData.name) setFlowName(flowData.name);
    }
  }, [flowData, loadFlow, setFlowId, setFlowName]);

  // Sync URL with store state
  // Only sync FROM store TO URL when store has a new flow that wasn't loaded from URL
  useEffect(() => {
    // Don't navigate while a flow is loading from the URL
    if (isFlowLoading) return;
    
    // If store has a flow ID that differs from URL, and we're not loading that URL's flow,
    // it means the store was updated independently (e.g., new flow created, imported)
    if (flowId && flowId !== urlFlowId && !flowData) {
      navigate(`/flow/${flowId}`, { replace: true });
    } else if (!flowId && urlFlowId && !flowData) {
      // If store has no ID but URL does, and we failed to load it, navigate to new editor
      navigate('/editor', { replace: true });
    }
  }, [flowId, urlFlowId, navigate, isFlowLoading, flowData]);

  // Modal states
  const [showFlowManager, setShowFlowManager] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showNodeProperties, setShowNodeProperties] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  
  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState<{ nodes: FlowNode[]; edges: Edge[] } | null>(null);
  
  // Mobile states
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  
  // Calculate stale node count
  const staleNodes = getStaleNodes();
  const staleCount = staleNodes.length;
  const hasStaleNodes = staleCount > 0;
  
  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Zoom to fit all nodes
  const handleZoomToFit = useCallback(() => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.fitView({ padding: 0.2, duration: 300 });
    }
  }, []);
  
  // Duplicate selected node
  const handleDuplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    
    const nodeToClone = nodes.find(n => n.id === selectedNodeId);
    if (!nodeToClone) return;
    
    const newId = `${nodeToClone.type}-${crypto.randomUUID().slice(0, 8)}`;
    const newNode: FlowNode = {
      ...nodeToClone,
      id: newId,
      position: {
        x: nodeToClone.position.x + 30,
        y: nodeToClone.position.y + 30,
      },
      data: { ...nodeToClone.data },
      selected: false,
    };
    
    addNode(newNode);
    selectNode(newId);
  }, [selectedNodeId, nodes, addNode, selectNode]);
  
  // Copy selected nodes
  const handleCopyNodes = useCallback(() => {
    // Get all selected nodes
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length === 0 && selectedNodeId) {
      // If no multi-selection, use the single selected node
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        selectedNodes.push(node);
      }
    }
    
    if (selectedNodes.length === 0) return;
    
    // Get edges between selected nodes
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(
      e => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
    );
    
    setClipboard({ nodes: selectedNodes, edges: selectedEdges });
    addExecutionLog(`[OK] Copied ${selectedNodes.length} node(s)`);
  }, [nodes, edges, selectedNodeId, addExecutionLog]);
  
  // Paste nodes from clipboard
  const handlePasteNodes = useCallback(() => {
    if (!clipboard || clipboard.nodes.length === 0) return;
    
    // Generate ID mapping for new nodes
    const idMap = new Map<string, string>();
    clipboard.nodes.forEach(node => {
      const newId = `${node.type}-${crypto.randomUUID().slice(0, 8)}`;
      idMap.set(node.id, newId);
    });
    
    // Offset pasted nodes by 50px
    const offsetX = 50;
    const offsetY = 50;
    
    // Create new nodes
    const newNodes: FlowNode[] = clipboard.nodes.map(node => ({
      ...node,
      id: idMap.get(node.id)!,
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
      },
      data: { ...node.data },
      selected: true,
    }));
    
    // Create new edges with updated IDs
    const newEdges: Edge[] = clipboard.edges.map(edge => ({
      ...edge,
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }));
    
    // Deselect all existing nodes and add new ones
    nodes.forEach(n => {
      if (n.selected) {
        onNodesChange([{ type: 'select', id: n.id, selected: false }]);
      }
    });
    
    // Add nodes and edges
    newNodes.forEach(node => addNode(node));
    newEdges.forEach(edge => onConnect({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
    }));
    
    addExecutionLog(`[OK] Pasted ${newNodes.length} node(s)`);
  }, [clipboard, nodes, addNode, onNodesChange, onConnect, addExecutionLog]);
  
  // Keyboard shortcuts for undo/redo/copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (cmdKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      } else if (cmdKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedo()) redo();
      } else if (cmdKey && e.key === 'y') {
        // Windows-style redo
        e.preventDefault();
        if (canRedo()) redo();
      } else if (cmdKey && e.key === 'd') {
        // Duplicate selected node
        e.preventDefault();
        handleDuplicateNode();
      } else if (cmdKey && e.key === 'c') {
        // Copy nodes
        e.preventDefault();
        handleCopyNodes();
      } else if (cmdKey && e.key === 'v') {
        // Paste nodes
        e.preventDefault();
        handlePasteNodes();
      } else if ((cmdKey && e.key === '0') || e.key === 'f') {
        // Zoom to fit
        if (!cmdKey || e.key === '0') {
          e.preventDefault();
          handleZoomToFit();
        }
      } else if ((cmdKey && e.key === '/') || e.key === '?') {
        // Show shortcuts panel
        e.preventDefault();
        setShowShortcuts(true);
      } else if (cmdKey && e.key === 'k') {
        // Show command palette
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (e.key === 'Escape') {
        // Close modals
        setShowShortcuts(false);
        setShowCommandPalette(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, handleDuplicateNode, handleCopyNodes, handlePasteNodes, handleZoomToFit]);
  
  const { executeScript, executeSubflow, workerClient } = useLocalExecutor();

  // Module code resolution cache + helper
  const moduleCodeCacheRef = useRef<Map<string, string>>(new Map());
  const resolveNodeCode = useCallback(async (node: FlowNode): Promise<string> => {
    const ref = (node.data as Record<string, unknown>).moduleRef as { id: string; version?: string } | undefined;
    if (!ref?.id) return (node.data as Record<string, unknown>).code as string || '';

    const cacheKey = `${ref.id}@${ref.version || 'latest'}`;
    if (moduleCodeCacheRef.current.has(cacheKey)) return moduleCodeCacheRef.current.get(cacheKey)!;

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
    const params = ref.version ? `?version=${encodeURIComponent(ref.version)}` : '';
    const res = await fetch(`${SERVER_URL}/api/modules/${ref.id}/resolve${params}`, { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(`Failed to load module: ${ref.id}`);

    moduleCodeCacheRef.current.set(cacheKey, json.code);
    return json.code;
  }, []);

  // Listen for module updates to clear cache
  useEffect(() => {
    const handler = (e: Event) => {
      const moduleId = (e as CustomEvent).detail?.moduleId;
      if (moduleId) {
        // Clear all cached entries for this module
        for (const key of moduleCodeCacheRef.current.keys()) {
          if (key.startsWith(moduleId)) {
            moduleCodeCacheRef.current.delete(key);
          }
        }
      }
    };
    window.addEventListener('module-updated', handler);
    return () => window.removeEventListener('module-updated', handler);
  }, []);

  /**
   * Get nodes in topological order for execution
   * Returns nodes from inputs → code → viewers
   */
  const getExecutionOrder = useCallback((nodes: FlowNode[], edges: Edge[]): FlowNode[] => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    
    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }
    
    // Build graph
    for (const edge of edges) {
      const targets = adjacency.get(edge.source) || [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
    
    // Kahn's algorithm
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) queue.push(nodeId);
    }
    
    const sorted: FlowNode[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (node) sorted.push(node);
      
      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }
    
    return sorted;
  }, []);

  /**
   * Find code chains - groups of sequential code nodes that can be executed
   * together in the worker without crossing the boundary.
   * 
   * IMPORTANT: A node can only be part of a chain if it EXCLUSIVELY outputs to
   * other code nodes. If a node outputs to ANY non-code node (viewer, output, etc.),
   * it must serialize its output and cannot be an intermediate chain node.
   */
  const findCodeChains = useCallback((nodes: FlowNode[], edges: Edge[]): Map<string, string[]> => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const chains = new Map<string, string[]>(); // chainId -> [nodeIds in order]
    const nodeToChain = new Map<string, string>(); // nodeId -> chainId
    
    // Get downstream nodes for each node
    const getDownstreamNodes = (nodeId: string): FlowNode[] => {
      return edges
        .filter(e => e.source === nodeId)
        .map(e => nodeMap.get(e.target))
        .filter((n): n is FlowNode => n !== undefined);
    };
    
    // Get upstream code nodes for a node
    const getUpstreamCodeNodes = (nodeId: string): FlowNode[] => {
      return edges
        .filter(e => e.target === nodeId)
        .map(e => nodeMap.get(e.source))
        .filter((n): n is FlowNode => n !== undefined && n.type === 'code');
    };
    
    // Check if a code node EXCLUSIVELY outputs to code nodes (can stay in worker)
    // Returns false if ANY downstream is a non-code node
    const canStayInWorker = (nodeId: string): boolean => {
      const downstream = getDownstreamNodes(nodeId);
      // If no downstream nodes, it needs to serialize (it's a terminal output)
      if (downstream.length === 0) return false;
      // Only stay in worker if ALL downstream nodes are code nodes
      // If even ONE downstream is a viewer/output, we must serialize
      return downstream.every(n => n.type === 'code');
    };
    
    // Build chains starting from code nodes that have no upstream code nodes
    // or whose upstream code nodes output to non-code nodes too
    const codeNodes = nodes.filter(n => n.type === 'code');
    
    for (const node of codeNodes) {
      if (nodeToChain.has(node.id)) continue;
      
      // Check if this node starts a new chain
      const upstreamCode = getUpstreamCodeNodes(node.id);
      const isChainStart = upstreamCode.length === 0 || 
        upstreamCode.every(u => !canStayInWorker(u.id));
      
      if (!isChainStart) continue;
      
      // Build the chain forward from this node
      const chainId = node.id;
      const chain: string[] = [node.id];
      nodeToChain.set(node.id, chainId);
      
      // Follow the chain while nodes EXCLUSIVELY output to code nodes
      let current = node;
      while (canStayInWorker(current.id)) {
        const downstream = getDownstreamNodes(current.id);
        const nextCodeNode = downstream.find(n => n.type === 'code' && !nodeToChain.has(n.id));
        if (!nextCodeNode) break;
        
        chain.push(nextCodeNode.id);
        nodeToChain.set(nextCodeNode.id, chainId);
        current = nextCodeNode;
      }
      
      chains.set(chainId, chain);
    }
    
    // Handle any remaining code nodes that weren't part of a chain
    for (const node of codeNodes) {
      if (!nodeToChain.has(node.id)) {
        chains.set(node.id, [node.id]);
        nodeToChain.set(node.id, node.id);
      }
    }
    
    return chains;
  }, []);

  const handleQuickRun = useCallback(async () => {
    setIsExecuting(true);
    clearExecutionLogs();
    addExecutionLog('Starting quick run...');

    // Store outputs from each node for passing to downstream nodes
    const nodeOutputs = new Map<string, Record<string, unknown>>();

    try {
      // Get execution order (topological sort)
      const executionOrder = getExecutionOrder(nodes, edges);
      
      // Find code nodes
      const codeNodes = executionOrder.filter(n => n.type === 'code');
      
      if (codeNodes.length === 0) {
        addExecutionLog('[ERROR] No code node found');
        setIsExecuting(false);
        return;
      }

      // Find code chains for batched execution
      const codeChains = findCodeChains(nodes, edges);
      const executedChains = new Set<string>();
      
      // Build a map of node -> chain for quick lookup
      const nodeToChain = new Map<string, string>();
      for (const [chainId, nodeIds] of codeChains) {
        for (const nodeId of nodeIds) {
          nodeToChain.set(nodeId, chainId);
        }
      }

      // Mark all nodes as pending
      for (const node of nodes) {
        setNodeExecutionStatus(node.id, 'pending');
      }

      console.log(`[Execution] Execution order:`, executionOrder.map(n => `${n.id}(${n.type})`));

      // Process nodes in topological order
      for (const node of executionOrder) {
        console.log(`[Execution] Processing node: ${node.id} type: ${node.type}`);
        
        // Handle input nodes - they just output their value
        if (node.type?.includes('input') && !node.type?.includes('schematic')) {
          let outputValue = node.data.value;
          let output: Record<string, unknown> = { default: outputValue };

          // Special handling for file inputs
          if (node.type === 'file_input') {
             outputValue = (node.data as { fileData: unknown }).fileData;
             output = { output: outputValue, default: outputValue };
          }

          nodeOutputs.set(node.id, output);
          setNodeExecutionStatus(node.id, 'completed', output);
          continue;
        }

        // Handle code nodes - execute as chain if part of multi-node chain
        if (node.type === 'code') {
          const chainId = nodeToChain.get(node.id);
          
          // Skip if we already executed this chain
          if (chainId && executedChains.has(chainId)) {
            continue;
          }
          
          const chain = chainId ? codeChains.get(chainId) || [node.id] : [node.id];
          console.log(`[Chain] Processing node ${node.id}, chain:`, chain);
          
          // TEMPORARILY DISABLED: Chain batching has issues when intermediate nodes 
          // have cached outputs that get reused. Execute all nodes individually for now.
          // TODO: Re-enable chain batching with proper cache invalidation
          const useChainBatching = false;
          
          if (useChainBatching && chain.length > 1) {
            // Execute entire chain as subflow (keeps data in worker)
            executedChains.add(chainId!);
            console.log(`[Chain] Executing multi-node chain:`, chain);
            
            addExecutionLog(`Executing code chain (${chain.length} nodes) in worker...`);
            
            // Mark all chain nodes as running
            for (const nodeId of chain) {
              setNodeExecutionStatus(nodeId, 'running');
            }
            setExecutingNodeId(chain[0]);
            
            // Gather chain nodes
            const chainNodeSet = new Set(chain);
            const chainNodes = nodes.filter(n => chainNodeSet.has(n.id));
            
            // Also include input nodes that feed into the chain
            const inputNodeIds = new Set<string>();
            for (const nodeId of chain) {
              const incomingEdges = edges.filter(e => e.target === nodeId && !chainNodeSet.has(e.source));
              for (const edge of incomingEdges) {
                const sourceNode = nodes.find(n => n.id === edge.source);
                if (sourceNode && (sourceNode.type?.includes('input') || sourceNode.type === 'code')) {
                  inputNodeIds.add(edge.source);
                }
              }
            }
            
            // Add input nodes to the subflow
            const inputNodes = nodes.filter(n => inputNodeIds.has(n.id));
            const allSubflowNodes = [...inputNodes, ...chainNodes];
            const allSubflowEdges = edges.filter(e => 
              (chainNodeSet.has(e.target) && (chainNodeSet.has(e.source) || inputNodeIds.has(e.source)))
            );
            
            // Gather external inputs for the subflow
            const subflowInputs: Record<string, unknown> = {};
            for (const inputNodeId of inputNodeIds) {
              const cached = nodeOutputs.get(inputNodeId);
              if (cached) {
                // Pass the entire output object
                subflowInputs[inputNodeId] = cached.default ?? cached;
              }
            }
            
            // The output node is the last code node in the chain
            const outputNodeId = chain[chain.length - 1];
            
            console.log(`[Chain] Subflow details:`, {
              chainNodes: chainNodes.map(n => n.id),
              inputNodes: inputNodes.map(n => n.id),
              allSubflowNodes: allSubflowNodes.map(n => n.id),
              allSubflowEdges: allSubflowEdges.map(e => `${e.source}->${e.target}`),
              subflowInputs: Object.keys(subflowInputs),
              outputNodeId
            });
            
            try {
              const startTime = Date.now();
              const result = await executeSubflow(
                allSubflowNodes.map(n => ({
                  id: n.id,
                  type: n.type || 'unknown',
                  data: { code: n.data.code, value: n.data.value, label: n.data.label }
                })),
                allSubflowEdges.map(e => ({
                  id: e.id,
                  source: e.source,
                  target: e.target,
                  sourceHandle: e.sourceHandle,
                  targetHandle: e.targetHandle
                })),
                subflowInputs,
                [outputNodeId]
              );
              
              const executionTime = Date.now() - startTime;
              
              console.log(`[Chain] Subflow result:`, {
                success: result.success,
                outputKeys: Object.keys(result.outputs || {}),
                schematicKeys: result.schematics ? Object.keys(result.schematics) : [],
                error: result.error
              });
              
              if (!result.success) {
                throw new Error(result.error?.message || 'Chain execution failed');
              }
              
              // Process results - mark intermediate nodes as completed (no serialized output)
              for (let i = 0; i < chain.length - 1; i++) {
                const nodeId = chain[i];
                const nodeLabel = nodes.find(n => n.id === nodeId)?.data.label || nodeId;
                // Intermediate nodes kept data in worker - mark with special indicator
                setNodeExecutionStatus(nodeId, 'completed', { _workerInternal: true });
                addExecutionLog(`[OK] "${nodeLabel}" (in-worker)`);
              }
              
              // Final node gets the serialized output
              let finalResult: Record<string, unknown> = {};
              if (result.schematics && Object.keys(result.schematics).length > 0) {
                for (const [key, value] of Object.entries(result.schematics)) {
                  if (value) finalResult[key] = value;
                }
              } else {
                finalResult = result.outputs;
              }
              
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
              
              nodeOutputs.set(outputNodeId, finalResult);
              const lastNodeLabel = nodes.find(n => n.id === outputNodeId)?.data.label || outputNodeId;
              setNodeExecutionStatus(outputNodeId, 'completed', finalResult, undefined, executionTime);
              addExecutionLog(`[OK] "${lastNodeLabel}" completed chain in ${executionTime}ms`);
              
            } catch (err) {
              const error = err as Error;
              for (const nodeId of chain) {
                setNodeExecutionStatus(nodeId, 'error', undefined, parseExecutionError(error));
              }
              addExecutionLog(`[ERROR] Chain execution: ${error.message}`);
              break;
            }
            
            continue;
          }
          
          // Single code node - execute normally (will serialize)
          // Resolve module reference if present, otherwise use inline code
          const code = await resolveNodeCode(node as unknown as FlowNode);

          if (!code) {
            addExecutionLog(`[WARN] Code node "${node.data.label || node.id}" has no script, skipping`);
            setNodeExecutionStatus(node.id, 'error', undefined, createSimpleError('No script'));
            continue;
          }

          // Gather inputs from connected upstream nodes
          // For code nodes, prefer handles (_schematicHandle) over serialized data
          const inputValues: Record<string, unknown> = {};
          const incomingEdges = edges.filter(e => e.target === node.id);
          
          for (const edge of incomingEdges) {
            const sourceOutput = nodeOutputs.get(edge.source);
            console.log('Edge:', edge.source, '->', edge.target, 'handles:', edge.sourceHandle, '->', edge.targetHandle);
            console.log('Source output:', sourceOutput);
            
            if (sourceOutput) {
              // Use the targetHandle as the input name
              const inputName = edge.targetHandle || 'default';
              // Try to get the value by sourceHandle, then by inputName, then 'default'
              const outputKey = edge.sourceHandle || inputName;
              let value = sourceOutput[outputKey];
              
              // If not found by outputKey, try to find a matching key or use 'default'
              if (value === undefined) {
                // Check if there's only one key in the output (common case)
                const outputKeys = Object.keys(sourceOutput);
                if (outputKeys.length === 1) {
                  value = sourceOutput[outputKeys[0]];
                } else {
                  value = sourceOutput['default'];
                }
              }
              
              // Value is either a handle { _schematicHandle: "..." } or primitive data
              // The worker will resolve handles back to WASM objects
              console.log('Mapping input:', inputName, '=', value);
              inputValues[inputName] = value;
            }
          }

          // Always use handles - keeps data in worker, avoids serialization
          // Viewers will fetch serialized data on-demand using the handle
          const returnHandles = true;

          // Mark as running
          setExecutingNodeId(node.id);
          setNodeExecutionStatus(node.id, 'running');
          const nodeLabel = node.data.label || 'Code';
          addExecutionLog(`Executing "${nodeLabel}"...`);

          // Execute with timing
          const startTime = Date.now();
          const result = await executeScript(code, inputValues, { returnHandles });
          const executionTime = Date.now() - startTime;

          if (result.success) {
            // Build final result - always store handles
            let finalResult: Record<string, unknown> = {};
            
            console.log('Execution result:', { 
              result: result.result, 
              schematics: result.schematics,
              schematicHandles: result.schematicHandles,
              returnHandles
            });
            
            if (returnHandles && result.schematicHandles && Object.keys(result.schematicHandles).length > 0) {
              // Store handles - downstream code nodes will use these
              for (const [key, handleId] of Object.entries(result.schematicHandles)) {
                finalResult[key] = { _schematicHandle: handleId };
              }
              
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
            } else if (result.schematics && Object.keys(result.schematics).length > 0) {
              // Store serialized data - viewers will use this directly
              for (const [key, value] of Object.entries(result.schematics)) {
                if (value) {
                  finalResult[key] = value;
                }
              }
              
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
            } else {
              finalResult = result.result || {};
            }

            nodeOutputs.set(node.id, finalResult);
            setNodeExecutionStatus(node.id, 'completed', finalResult, undefined, executionTime);
            addExecutionLog(`[OK] "${node.data.label || 'Code'}" completed in ${executionTime}ms`);
          } else {
            // Parse the error with line numbers from the script
            const executionError = result.error 
              ? parseExecutionError(result.error, node.data.code)
              : createSimpleError('Unknown execution error');
            setNodeExecutionStatus(node.id, 'error', undefined, executionError);
            addExecutionLog(`[ERROR] "${node.data.label || 'Code'}": ${executionError.message}`);
            // Stop execution on error
            break;
          }
        }

        // Handle viewer nodes - they receive data and can pass it through
        if (node.type === 'viewer') {
          console.log(`[Viewer] Processing viewer node: ${node.id}`);
          const incomingEdge = edges.find(e => e.target === node.id);
          console.log(`[Viewer] Incoming edge:`, incomingEdge);
          if (incomingEdge) {
            const sourceOutput = nodeOutputs.get(incomingEdge.source);
            console.log(`[Viewer] Source output from ${incomingEdge.source}:`, sourceOutput);
            if (sourceOutput) {
              // Strict output selection
              const handleId = incomingEdge.sourceHandle;
              let viewerValue: unknown = undefined;

              if (handleId) {
                // If a specific handle is requested, only return that
                if (handleId in sourceOutput) {
                  viewerValue = sourceOutput[handleId];
                }
              } else {
                // No handle specified - try default or single output
                if ('default' in sourceOutput) {
                  viewerValue = sourceOutput['default'];
                } else if (Object.keys(sourceOutput).length === 1) {
                  viewerValue = sourceOutput[Object.keys(sourceOutput)[0]];
                }
              }
              
              // For viewers: if we have a handle, fetch serialized data from worker
              if (viewerValue && typeof viewerValue === 'object') {
                if ('_schematicHandle' in viewerValue) {
                  const handleObj = viewerValue as { _schematicHandle: string };
                  const handleId = handleObj._schematicHandle;
                  console.log(`[Viewer] Fetching serialized data for handle: ${handleId}`);
                  
                  if (workerClient) {
                    try {
                      const serializedData = await workerClient.getData(handleId);
                      if (serializedData) {
                        viewerValue = serializedData;
                      }
                    } catch (err) {
                      console.error(`[Viewer] Failed to fetch data for handle ${handleId}:`, err);
                    }
                  }
                } else {
                  // Check for nested handles (e.g. when viewing all outputs)
                  const obj = viewerValue as Record<string, unknown>;
                  const entries = Object.entries(obj);
                  const updates: Record<string, unknown> = {};
                  let hasUpdates = false;

                  await Promise.all(entries.map(async ([key, val]) => {
                    if (val && typeof val === 'object' && '_schematicHandle' in val) {
                      const handleObj = val as { _schematicHandle: string };
                      const handleId = handleObj._schematicHandle;
                      
                      if (workerClient) {
                        try {
                          const serializedData = await workerClient.getData(handleId);
                          if (serializedData) {
                            updates[key] = serializedData;
                            hasUpdates = true;
                          }
                        } catch (err) {
                          console.error(`[Viewer] Failed to fetch data for handle ${handleId} at key ${key}:`, err);
                        }
                      }
                    }
                  }));

                  if (hasUpdates) {
                    viewerValue = { ...obj, ...updates };
                  }
                }
              }
              
              // Set the viewer's cache with the unwrapped value
              setNodeExecutionStatus(node.id, 'completed', { default: viewerValue });
              
              // If passthrough is enabled, make output available to downstream nodes
              // Pass through the ORIGINAL value (handle) so downstream code nodes can use it
              const viewerData = node.data as { passthrough?: boolean };
              if (viewerData.passthrough) {
                // Get the original source output (with handle) for passthrough
                const originalValue = sourceOutput[incomingEdge.sourceHandle || 'default'] || sourceOutput['default'];
                nodeOutputs.set(node.id, { output: originalValue, default: originalValue });
              }
            }
          }
        }

        // Handle output nodes - they receive data and mark it as a flow output
        if (node.type === 'output' || node.type === 'file_output') {
          const incomingEdge = edges.find(e => e.target === node.id);
          if (incomingEdge) {
            const sourceOutput = nodeOutputs.get(incomingEdge.source);
            if (sourceOutput) {
              // Unwrap - prefer sourceHandle, then 'default', then first key
              const handleKey = incomingEdge.sourceHandle || 'default';
              let outputValue: unknown = sourceOutput;
              
              if (handleKey in sourceOutput) {
                outputValue = sourceOutput[handleKey];
              } else if ('default' in sourceOutput) {
                outputValue = sourceOutput['default'];
              } else {
                const keys = Object.keys(sourceOutput);
                if (keys.length === 1) {
                  outputValue = sourceOutput[keys[0]];
                }
              }
              
              // For output nodes: if we have a handle, fetch serialized data from worker
              if (outputValue && typeof outputValue === 'object' && '_schematicHandle' in outputValue) {
                const handleObj = outputValue as { _schematicHandle: string };
                const handleId = handleObj._schematicHandle;
                
                if (workerClient) {
                  try {
                    const serializedData = await workerClient.getData(handleId);
                    if (serializedData) {
                      outputValue = serializedData;
                    }
                  } catch (err) {
                    console.error(`Failed to fetch data for handle ${handleId}:`, err);
                  }
                }
              }
              
              // Set the output node's cache
              setNodeExecutionStatus(node.id, 'completed', { output: outputValue, default: outputValue });
              
              // Store for downstream nodes (in case of chaining)
              nodeOutputs.set(node.id, { output: outputValue, default: outputValue });
            }
          }
        }

        // Handle subflow nodes - execute the embedded flow entirely within the worker
        // This avoids serialization overhead by keeping WASM objects in memory
        if (node.type === 'subflow') {
          const subflowData = node.data as { 
            flowId: string; 
            subflowConfig: { inputs: { id: string }[]; outputs: { id: string }[] };
            flowDefinition?: { nodes: FlowNode[]; edges: Edge[] };
          };
          
          if (!subflowData.flowDefinition) {
            setNodeExecutionStatus(node.id, 'error', undefined, createSimpleError('Subflow definition not loaded'));
            addExecutionLog(`[ERROR] Subflow "${node.data.label || node.id}": Definition not loaded`);
            continue;
          }
          
          // Mark as running
          setExecutingNodeId(node.id);
          setNodeExecutionStatus(node.id, 'running');
          addExecutionLog(`Executing subflow "${node.data.label || 'Subflow'}"...`);
          
          const subflowStartTime = Date.now();
          try {
            // Gather inputs for the subflow from upstream nodes
            const subflowInputs: Record<string, unknown> = {};
            const incomingEdges = edges.filter(e => e.target === node.id);
            
            for (const edge of incomingEdges) {
              const sourceOutput = nodeOutputs.get(edge.source);
              if (sourceOutput) {
                const inputPortId = edge.targetHandle;
                if (inputPortId) {
                  const outputKey = edge.sourceHandle || 'default';
                  let value = sourceOutput[outputKey];
                  if (value === undefined && Object.keys(sourceOutput).length === 1) {
                    value = sourceOutput[Object.keys(sourceOutput)[0]];
                  }
                  subflowInputs[inputPortId] = value;
                }
              }
            }
            
            // Execute the entire subflow within the worker
            // This keeps WASM objects in memory between nodes, only serializing at the end
            const subflowDef = subflowData.flowDefinition;
            const outputNodeIds = subflowData.subflowConfig.outputs.map(o => o.id);
            
            const result = await executeSubflow(
              subflowDef.nodes.map(n => ({
                id: n.id,
                type: n.type || 'unknown',
                data: { code: n.data.code, value: n.data.value, label: n.data.label }
              })),
              subflowDef.edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle
              })),
              subflowInputs,
              outputNodeIds
            );
            
            if (!result.success) {
              throw new Error(result.error?.message || 'Subflow execution failed');
            }
            
            // Process the result - prefer schematics if present
            let subflowResult: Record<string, unknown> = {};
            
            if (result.schematics && Object.keys(result.schematics).length > 0) {
              // Use serialized schematic data
              for (const [key, value] of Object.entries(result.schematics)) {
                if (value) subflowResult[key] = value;
              }
            } else {
              // Use regular outputs
              subflowResult = result.outputs;
            }
            
            // Add default output if there's only one
            if (Object.keys(subflowResult).length === 1 && !('default' in subflowResult)) {
              subflowResult['default'] = subflowResult[Object.keys(subflowResult)[0]];
            }
            
            nodeOutputs.set(node.id, subflowResult);
            const subflowTime = result.executionTime || (Date.now() - subflowStartTime);
            setNodeExecutionStatus(node.id, 'completed', subflowResult, undefined, subflowTime);
            addExecutionLog(`[OK] Subflow "${node.data.label || 'Subflow'}" completed in ${subflowTime}ms`);
            
          } catch (err) {
            const error = err as Error;
            setNodeExecutionStatus(node.id, 'error', undefined, parseExecutionError(error));
            addExecutionLog(`[ERROR] Subflow "${node.data.label || 'Subflow'}": ${error.message}`);
            break;
          }
        }
      }

      addExecutionLog('[OK] Execution complete');

    } catch (error) {
      const err = error as Error;
      addExecutionLog(`[ERROR] ${err.message}`);
      // Mark all code nodes as error with structured error info
      const execError = parseExecutionError(err);
      for (const node of nodes.filter(n => n.type === 'code')) {
        setNodeExecutionStatus(node.id, 'error', undefined, execError);
      }
    } finally {
      setIsExecuting(false);
      setExecutingNodeId(null);
    }
  }, [nodes, edges, setIsExecuting, clearExecutionLogs, addExecutionLog, setNodeExecutionStatus, setExecutingNodeId, executeScript, executeSubflow, getExecutionOrder, findCodeChains, workerClient]);

  /**
   * Run only nodes that have stale/invalidated cache
   * This is more efficient when only some inputs have changed
   */
  const handleIncrementalRun = useCallback(async () => {
    const nodesToRun = getNodesToExecute(true);
    
    if (nodesToRun.length === 0) {
      addExecutionLog('[OK] All nodes are up to date, nothing to run');
      return;
    }

    setIsExecuting(true);
    clearExecutionLogs();
    addExecutionLog(`Starting incremental run (${nodesToRun.length} stale nodes)...`);

    // Store outputs from each node for passing to downstream nodes
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    
    // Pre-populate with cached outputs from nodes that don't need re-execution
    for (const node of nodes) {
      const cache = nodeCache[node.id];
      if (cache?.status === 'completed' || cache?.status === 'cached') {
        if (cache.output) {
          nodeOutputs.set(node.id, cache.output as Record<string, unknown>);
          // Mark as using cached value
          markNodeCached(node.id);
        }
      }
    }

    try {
      // Get execution order but filter to only stale nodes and their dependencies
      const executionOrder = getExecutionOrder(nodes, edges);
      const nodesToRunIds = new Set(nodesToRun.map(n => n.id));
      
      // Find code chains for batched execution  
      const codeChains = findCodeChains(nodes, edges);
      
      // Build a map of node -> chain for quick lookup
      const nodeToChain = new Map<string, string>();
      for (const [chainId, nodeIds] of codeChains) {
        for (const nodeId of nodeIds) {
          nodeToChain.set(nodeId, chainId);
        }
      }

      // Mark only stale nodes as pending
      for (const node of nodesToRun) {
        setNodeExecutionStatus(node.id, 'pending');
      }

      console.log(`[Incremental] Running ${nodesToRun.length} nodes:`, nodesToRun.map(n => n.id));

      // Process nodes in topological order
      for (const node of executionOrder) {
        // Skip nodes that don't need to be executed
        if (!nodesToRunIds.has(node.id)) {
          // But make sure we have its cached output available
          const cache = nodeCache[node.id];
          if (cache?.output && !nodeOutputs.has(node.id)) {
            nodeOutputs.set(node.id, cache.output as Record<string, unknown>);
          }
          continue;
        }

        console.log(`[Incremental] Processing node: ${node.id} type: ${node.type}`);
        
        // Handle input nodes - they just output their value
        if (node.type?.includes('input') && !node.type?.includes('schematic')) {
          let outputValue = node.data.value;
          let output: Record<string, unknown> = { default: outputValue };

          // Special handling for file inputs
          if (node.type === 'file_input') {
             outputValue = (node.data as { fileData: unknown }).fileData;
             output = { output: outputValue, default: outputValue };
          }

          nodeOutputs.set(node.id, output);
          setNodeExecutionStatus(node.id, 'completed', output);
          continue;
        }

        // Handle code nodes
        if (node.type === 'code') {
          // Execute single code node — resolve module reference if present
          const code = await resolveNodeCode(node as unknown as FlowNode);
          
          if (!code) {
            addExecutionLog(`[WARN] Code node "${node.data.label || node.id}" has no script, skipping`);
            setNodeExecutionStatus(node.id, 'error', undefined, createSimpleError('No script'));
            continue;
          }

          // Gather inputs from connected upstream nodes (use cached values when available)
          const inputValues: Record<string, unknown> = {};
          const incomingEdges = edges.filter(e => e.target === node.id);
          
          for (const edge of incomingEdges) {
            const sourceOutput = nodeOutputs.get(edge.source);
            
            if (sourceOutput) {
              const inputName = edge.targetHandle || 'default';
              const outputKey = edge.sourceHandle || inputName;
              let value = sourceOutput[outputKey];
              
              if (value === undefined) {
                const outputKeys = Object.keys(sourceOutput);
                if (outputKeys.length === 1) {
                  value = sourceOutput[outputKeys[0]];
                } else {
                  value = sourceOutput['default'];
                }
              }
              
              inputValues[inputName] = value;
            }
          }

          const returnHandles = true;

          // Mark as running
          setExecutingNodeId(node.id);
          setNodeExecutionStatus(node.id, 'running');
          const nodeLabel = node.data.label || 'Code';
          addExecutionLog(`Executing "${nodeLabel}"...`);

          // Execute with timing
          const startTime = Date.now();
          const result = await executeScript(code, inputValues, { returnHandles });
          const executionTime = Date.now() - startTime;

          if (result.success) {
            let finalResult: Record<string, unknown> = {};
            
            if (returnHandles && result.schematicHandles && Object.keys(result.schematicHandles).length > 0) {
              for (const [key, handleId] of Object.entries(result.schematicHandles)) {
                finalResult[key] = { _schematicHandle: handleId };
              }
              
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
            } else if (result.schematics && Object.keys(result.schematics).length > 0) {
              for (const [key, value] of Object.entries(result.schematics)) {
                if (value) {
                  finalResult[key] = value;
                }
              }
              
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
            } else {
              finalResult = result.result || {};
            }

            nodeOutputs.set(node.id, finalResult);
            setNodeExecutionStatus(node.id, 'completed', finalResult, undefined, executionTime);
            addExecutionLog(`[OK] "${nodeLabel}" completed in ${executionTime}ms`);
          } else {
            const executionError = result.error 
              ? parseExecutionError(result.error, node.data.code)
              : createSimpleError('Unknown execution error');
            setNodeExecutionStatus(node.id, 'error', undefined, executionError);
            addExecutionLog(`[ERROR] "${nodeLabel}": ${executionError.message}`);
            break;
          }
        }

        // Handle viewer nodes - only update if this viewer is in the stale list
        if (node.type === 'viewer') {
          // Skip viewer if it's not stale (its source hasn't changed)
          if (!nodesToRunIds.has(node.id)) {
            // Make sure its output is available for downstream
            const cache = nodeCache[node.id];
            if (cache?.output && !nodeOutputs.has(node.id)) {
              nodeOutputs.set(node.id, cache.output as Record<string, unknown>);
            }
            continue;
          }
          
          const incomingEdge = edges.find(e => e.target === node.id);
          if (incomingEdge) {
            const sourceOutput = nodeOutputs.get(incomingEdge.source);
            if (sourceOutput) {
              const handleKey = incomingEdge.sourceHandle || 'default';
              let viewerValue: unknown = sourceOutput;
              
              if (handleKey in sourceOutput) {
                viewerValue = sourceOutput[handleKey];
              } else if ('default' in sourceOutput) {
                viewerValue = sourceOutput['default'];
              } else {
                const keys = Object.keys(sourceOutput);
                if (keys.length === 1) {
                  viewerValue = sourceOutput[keys[0]];
                }
              }
              
              // For viewers: if we have a handle, fetch serialized data from worker
              if (viewerValue && typeof viewerValue === 'object' && '_schematicHandle' in viewerValue) {
                const handleObj = viewerValue as { _schematicHandle: string };
                const handleId = handleObj._schematicHandle;
                
                if (workerClient) {
                  try {
                    const serializedData = await workerClient.getData(handleId);
                    if (serializedData) {
                      viewerValue = serializedData;
                    }
                  } catch (err) {
                    console.error(`Failed to fetch data for handle ${handleId}:`, err);
                  }
                }
              }
              
              setNodeExecutionStatus(node.id, 'completed', { default: viewerValue });
              
              const viewerData = node.data as { passthrough?: boolean };
              if (viewerData.passthrough) {
                const originalValue = sourceOutput[incomingEdge.sourceHandle || 'default'] || sourceOutput['default'];
                nodeOutputs.set(node.id, { output: originalValue, default: originalValue });
              }
            }
          }
        }

        // Handle output nodes - only update if stale
        if (node.type === 'output' || node.type === 'file_output') {
          // Skip if not stale
          if (!nodesToRunIds.has(node.id)) {
            const cache = nodeCache[node.id];
            if (cache?.output && !nodeOutputs.has(node.id)) {
              nodeOutputs.set(node.id, cache.output as Record<string, unknown>);
            }
            continue;
          }
          
          const incomingEdge = edges.find(e => e.target === node.id);
          if (incomingEdge) {
            const sourceOutput = nodeOutputs.get(incomingEdge.source);
            if (sourceOutput) {
              const handleKey = incomingEdge.sourceHandle || 'default';
              let outputValue: unknown = sourceOutput;
              
              if (handleKey in sourceOutput) {
                outputValue = sourceOutput[handleKey];
              } else if ('default' in sourceOutput) {
                outputValue = sourceOutput['default'];
              } else {
                const keys = Object.keys(sourceOutput);
                if (keys.length === 1) {
                  outputValue = sourceOutput[keys[0]];
                }
              }
              
              if (outputValue && typeof outputValue === 'object' && '_schematicHandle' in outputValue) {
                const handleObj = outputValue as { _schematicHandle: string };
                const handleId = handleObj._schematicHandle;
                
                if (workerClient) {
                  try {
                    const serializedData = await workerClient.getData(handleId);
                    if (serializedData) {
                      outputValue = serializedData;
                    }
                  } catch (err) {
                    console.error(`Failed to fetch data for handle ${handleId}:`, err);
                  }
                }
              }
              
              setNodeExecutionStatus(node.id, 'completed', { output: outputValue, default: outputValue });
              nodeOutputs.set(node.id, { output: outputValue, default: outputValue });
            }
          }
        }
      }

      addExecutionLog('[OK] Incremental execution complete');

    } catch (error) {
      const err = error as Error;
      addExecutionLog(`[ERROR] ${err.message}`);
      const execError = parseExecutionError(err);
      for (const node of nodesToRun.filter(n => n.type === 'code')) {
        setNodeExecutionStatus(node.id, 'error', undefined, execError);
      }
    } finally {
      setIsExecuting(false);
      setExecutingNodeId(null);
    }
  }, [nodes, edges, nodeCache, setIsExecuting, clearExecutionLogs, addExecutionLog, setNodeExecutionStatus, setExecutingNodeId, executeScript, getExecutionOrder, findCodeChains, getNodesToExecute, markNodeCached, workerClient]);

  // Listen for live execution triggers (when execution mode is 'live')
  useEffect(() => {
    const handleLiveExecution = (event: CustomEvent) => {
      console.log('[Live] Execution triggered by:', event.detail);
      // Use incremental run for live execution
      if (!isExecuting) {
        handleIncrementalRun();
      }
    };

    window.addEventListener('polymerase:liveExecutionTrigger', handleLiveExecution as EventListener);
    return () => {
      window.removeEventListener('polymerase:liveExecutionTrigger', handleLiveExecution as EventListener);
    };
  }, [isExecuting, handleIncrementalRun]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  // Handle node double-click to open editor
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: { id: string; type?: string }) => {
    // First select the node
    selectNode(node.id);
    // Then open the appropriate editor
    setEditingNodeId(node.id);
    if (node.type === 'code') {
      setShowCodeEditor(true);
    } else {
      setShowNodeProperties(true);
    }
  }, [selectNode]);

  // Handle keyboard shortcuts
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Don't delete nodes when user is typing in an input field
    const target = event.target as HTMLElement;
    const isInputElement = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.isContentEditable ||
                           target.closest('input, textarea, [contenteditable="true"]');
    
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Only delete node if not in an input element and modals are closed
      if (selectedNodeId && !showCodeEditor && !showNodeProperties && !isInputElement) {
        deleteNode(selectedNodeId);
      }
    }
    if (event.key === 'Escape') {
      selectNode(null);
    }
  }, [selectedNodeId, deleteNode, selectNode, showCodeEditor, showNodeProperties]);

  // Calculate cache stats - include both completed and cached nodes as "ready"
  const completedCount = Object.values(nodeCache).filter(c => c.status === 'completed' || c.status === 'cached').length;
  const totalNodes = nodes.length;

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const dataString = event.dataTransfer.getData('application/reactflow-data');
      
      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      if (!position) return;

      const nodeData = dataString ? JSON.parse(dataString) : { label: `${type} node` };

      const newNode: FlowNode = {
        id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
        type,
        position,
        data: nodeData,
      };

      addNode(newNode);

      // If it's a module instance, fetch IO schema async
      if (nodeData.moduleRef?.id && !nodeData.io) {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
        fetch(`${SERVER_URL}/api/modules/${nodeData.moduleRef.id}/resolve`, { credentials: 'include' })
          .then(r => r.json())
          .then(json => {
            if (json.success && json.ioSchema) {
              useFlowStore.getState().updateNodeData(newNode.id, { io: json.ioSchema });
            }
          })
          .catch(() => {});
      }
    },
    [addNode]
  );
  
  return (
    <div 
      className="h-screen w-screen bg-neutral-950 flex flex-col no-select"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Top Bar - Responsive */}
      <TopBar
        isMobile={isMobile}
        onRun={handleQuickRun}
        onRunStale={handleIncrementalRun}
        isExecuting={isExecuting}
        hasStaleNodes={hasStaleNodes}
        staleCount={staleCount}
        completedCount={completedCount}
        totalNodes={totalNodes}
        onClearCache={clearAllCache}
        onShowFlowManager={() => setShowFlowManager(true)}
        onShowExecution={() => setShowExecution(true)}
        onShowApiPanel={() => setShowApiPanel(true)}
        onShowShortcuts={() => setShowShortcuts(true)}
        onShowSettings={() => setShowSettings(true)}
        snapToGrid={snapToGrid}
        setSnapToGrid={setSnapToGrid}
        onZoomToFit={handleZoomToFit}
        onToggleMobileMenu={() => setShowMobileMenu(!showMobileMenu)}
      />
      
      {/* Mobile Menu Overlay */}
      {isMobile && showMobileMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowMobileMenu(false)}>
          <div 
            className="absolute top-0 left-0 h-full w-72 bg-neutral-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-green-500/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-sm bg-green-500" />
                </div>
                Menu
              </h2>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
              {/* Navigation */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-neutral-500 px-2 mb-2 uppercase tracking-wider">Navigation</div>
                <button onClick={() => navigate('/')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                  <Home className="w-4 h-4" /> Home
                </button>
                <button onClick={() => navigate('/docs')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                  <Book className="w-4 h-4" /> Documentation
                </button>
              </div>

              {/* File Actions */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-neutral-500 px-2 mb-2 uppercase tracking-wider">File</div>
                <button
                  onClick={() => {
                    setShowFlowManager(true);
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <FolderOpen className="w-4 h-4" /> Manage Flows
                </button>
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Save className="w-4 h-4" /> Save Flow
                </button>
              </div>

              {/* View Actions */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-neutral-500 px-2 mb-2 uppercase tracking-wider">View</div>
                <button
                  onClick={() => {
                    handleZoomToFit();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Maximize2 className="w-4 h-4" /> Zoom to Fit
                </button>
                <button
                  onClick={() => {
                    setSnapToGrid(!snapToGrid);
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Grid3X3 className={`w-4 h-4 ${snapToGrid ? 'text-green-400' : ''}`} /> 
                  Snap to Grid
                </button>
                <button
                  onClick={() => {
                    toggleDebugMode();
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Eye className={`w-4 h-4 ${debugMode ? 'text-green-400' : ''}`} /> 
                  Debug Mode
                </button>
              </div>
              
              {/* Execution Actions */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-neutral-500 px-2 mb-2 uppercase tracking-wider">Execution</div>
                <button
                  onClick={() => {
                    setShowExecution(true);
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                >
                  <Terminal className="w-4 h-4" /> Console Output
                </button>
                
                {completedCount > 0 && (
                  <button
                    onClick={() => {
                      clearAllCache();
                      setShowMobileMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                  >
                    <RotateCcw className="w-4 h-4" /> Clear Cache ({completedCount})
                  </button>
                )}
              </div>
            </div>
            
            {/* Status Footer */}
            {totalNodes > 0 && (
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-neutral-900/50 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${completedCount === totalNodes ? 'bg-green-500' : 'bg-neutral-600'}`} />
                  <span className="text-xs text-neutral-400">
                    {completedCount}/{totalNodes} nodes computed
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Area — Toolbar + Canvas */}
      <div className="flex-1 flex relative">
        {/* Node Toolbar - Desktop sidebar */}
        {!isMobile && <Toolbar />}

        <div className="flex-1 relative">
        {flowError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
            Failed to load flow: {(flowError as Error).message}
          </div>
        )}
        {isFlowLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-950/50">
            <div className="text-neutral-400 text-sm">Loading flow...</div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => {
            reactFlowInstance.current = instance;
            onInit(instance);
          }}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeClick={(_event, node) => selectNode(node.id)}
          onPaneClick={() => {
            selectNode(null);
            if (isMobile) setShowMobileToolbar(false);
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          snapToGrid={snapToGrid}
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            type: 'data',
            animated: false,
          }}
          proOptions={{ hideAttribution: true }}
          // Selection and Dragging
          selectionOnDrag={true}
          selectionMode={SelectionMode.Partial}
          // Mobile touch improvements
          panOnDrag={true}
          zoomOnPinch={true}
          zoomOnScroll={!isMobile}
          preventScrolling={true}
        >
          <Background color="#22c55e" gap={24} size={0.5} style={{ opacity: 0.07 }} />
          <Controls className="bg-[#0c0c10]! border-neutral-800/60! rounded-xl! shadow-2xl! shadow-black/50!" />
          {!isMobile && (
            <MiniMap
              className="bg-[#0c0c10]! border-neutral-800/60! rounded-xl! shadow-2xl! shadow-black/50!"
              nodeColor={(node) => {
                const cache = nodeCache[node.id];
                if (cache?.status === 'completed' || cache?.status === 'cached') return '#22c55e';
                if (cache?.status === 'running') return '#f59e0b';
                if (cache?.status === 'error') return '#ef4444';
                if (cache?.status === 'stale') return '#eab308'; // Yellow for stale
                
                switch (node.type) {
                  case 'code': return '#22c55e40';
                  case 'input':
                  case 'number_input':
                  case 'text_input':
                  case 'boolean_input':
                  case 'select_input': return '#a855f7';
                  case 'viewer': return '#ec4899';
                  case 'subflow': return '#6366f1';
                  case 'file_input': return '#f97316';
                  case 'file_output': return '#06b6d4';
                  case 'schematic_input': return '#f97316';
                  case 'schematic_output': return '#06b6d4';
                  case 'schematic_viewer': return '#ec4899';
                  default: return '#525252';
                }
              }}
              maskColor="rgba(10, 10, 10, 0.85)"
            />
          )}
          
          {/* Help Panel - Desktop only */}
          {!isMobile && (
            <Panel position="bottom-center">
              <div className="bg-[#0c0c10]/90 backdrop-blur-md px-5 py-2 rounded-xl border border-neutral-800/40 text-[10px] font-mono text-neutral-600 flex items-center gap-3 shadow-2xl shadow-black/40">
                <span className="text-neutral-500">dbl-click</span>
                <span className="text-neutral-800">|</span>
                <span className="text-neutral-500">del</span>
                <span className="text-neutral-800">|</span>
                <span className="text-neutral-500">drag handles</span>
                <span className="text-neutral-800">|</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  ready
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  stale
                </span>
              </div>
            </Panel>
          )}
        </ReactFlow>
        </div>

        {/* Mobile: Floating Action Buttons */}
        {isMobile && (
          <>
            {/* Run FAB */}
            <button
              onClick={handleQuickRun}
              disabled={isExecuting}
              className={`
                fab
                ${isExecuting
                  ? 'bg-amber-500 shadow-lg shadow-amber-500/30'
                  : 'bg-green-500 shadow-lg shadow-green-500/30 active:scale-95'
                }
                transition-all
              `}
              style={{ right: '5rem', bottom: '1.5rem', left: 'auto' }}
            >
              <Play className="w-6 h-6 text-black fill-black" />
            </button>

            {/* Add Node FAB */}
            <button
              onClick={() => setShowMobileToolbar(true)}
              className="fab bg-[#0c0c10] border border-neutral-800/60 shadow-lg shadow-black/40 active:scale-95 transition-all"
              style={{ right: '1.5rem', bottom: '1.5rem', left: 'auto' }}
            >
              <Plus className="w-6 h-6 text-neutral-400" />
            </button>
          </>
        )}
        
        {/* Mobile Node Drawer */}
        {isMobile && (
          <MobileNodeDrawer
            isOpen={showMobileToolbar}
            onClose={() => setShowMobileToolbar(false)}
            onNodeAdded={() => setShowMobileToolbar(false)}
          />
        )}
      </div>

      {/* Modals */}
      <FlowManager 
        isOpen={showFlowManager} 
        onClose={() => setShowFlowManager(false)} 
      />

      {/* Code Editor Modal */}
      <Modal
        isOpen={showCodeEditor}
        onClose={() => {
          setShowCodeEditor(false);
          setEditingNodeId(null);
        }}
        size={isMobile ? 'full' : 'xl'}
        showCloseButton={false}
      >
        {editingNodeId && (
          <CodePanel 
            nodeId={editingNodeId} 
            onClose={() => {
              setShowCodeEditor(false);
              setEditingNodeId(null);
            }}
          />
        )}
      </Modal>

      {/* Node Properties Modal */}
      <Modal
        isOpen={showNodeProperties}
        onClose={() => {
          setShowNodeProperties(false);
          setEditingNodeId(null);
        }}
        title="Node Properties"
        subtitle="Configure node settings"
        icon={<Settings className="w-5 h-5" />}
        iconColor="text-purple-400"
        size={isMobile ? 'full' : 'md'}
      >
        {editingNodeId && <NodePropertiesPanel nodeId={editingNodeId} />}
      </Modal>

      {/* Execution Modal */}
      <Modal
        isOpen={showExecution}
        onClose={() => setShowExecution(false)}
        title="Execute Flow"
        subtitle="Run and debug your flow"
        icon={<Terminal className="w-5 h-5" />}
        iconColor="text-cyan-400"
        size={isMobile ? 'full' : 'lg'}
      >
        <ExecutionPanel workerClient={workerClient} />
      </Modal>

      {/* API Panel Modal */}
      <Modal
        isOpen={showApiPanel}
        onClose={() => setShowApiPanel(false)}
        title="Flow API"
        subtitle="Publish and test as API"
        icon={<Globe className="w-5 h-5" />}
        iconColor="text-cyan-400"
        size={isMobile ? 'full' : 'lg'}
      >
        <ApiPanel flowId={flowId || ''} flowName={flowName} onClose={() => setShowApiPanel(false)} />
      </Modal>

      {/* Flow Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Flow Settings"
        subtitle="Name, description, and visibility"
        icon={<Settings className="w-5 h-5" />}
        iconColor="text-green-400"
        size={isMobile ? 'full' : 'md'}
      >
        <FlowSettings onClose={() => setShowSettings(false)} />
      </Modal>

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />
    </div>
  );
}
