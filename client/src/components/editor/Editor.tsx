import { uuid } from '../../lib/uuid';
/**
 * Editor - Main flow editor component with execution state visualization
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { layoutWithElk } from '../../lib/layout';
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
import type { TracedResult } from '@flow/core';
import { isAssetNodeData, assetNodeValue, compileFlow, compileBlock, FlowCompileError } from '@flow/core';
import { type FlowNode } from '../../store/flowStore';
import {
  collectFlowInputs,
  collectOutputNames,
  traceValueToCache,
  flowHasSubflowNodes,
} from '../../lib/tracePlan';

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
  Wand2,
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
import { features } from '../../config/features';
import { Modal } from '../ui/Modal';
import { ShortcutsModal } from '../ui/ShortcutsModal';
import { CommandPalette } from '../ui/CommandPalette';
import { MobileNodeDrawer } from './MobileNodeDrawer';
import { useLocalExecutor } from '../../hooks/useLocalExecutor';
import { parseExecutionError, createSimpleError } from '../../lib/utils';
import { compileCulprits } from '../../lib/compileCulprits';
import { EXAMPLE_FLOWS } from '../../lib/exampleFlows';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export function Editor() {
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const { flowId: urlFlowId } = useParams();
  const [searchParams] = useSearchParams();
  const exampleId = searchParams.get('example');
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
    groupSelected,
    ungroupNode,
  } = useFlowStore();

  // Auto-arrange the graph into a clean left-to-right layered layout (ELK).
  const [layingOut, setLayingOut] = useState(false);
  const handleTidyLayout = useCallback(async () => {
    const { nodes: ns, edges: es, setNodes } = useFlowStore.getState();
    if (ns.length === 0) return;
    setLayingOut(true);
    try {
      const laid = await layoutWithElk(ns, es);
      setNodes(laid);
      requestAnimationFrame(() =>
        reactFlowInstance.current?.fitView({ padding: 0.2, duration: 400 })
      );
    } catch (err) {
      console.error('Layout failed', err);
    } finally {
      setLayingOut(false);
    }
  }, []);

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

  // Deep-linked example (?example=<id>) — only when there is no saved-flow id in
  // the URL (so /flow/:uuid and /editor/:uuid stay untouched). Examples are
  // ephemeral: loaded with no backend id (flowId stays null) so a "Save" still
  // creates a fresh flow. Guarded so a refresh restores it without thrashing.
  useEffect(() => {
    if (urlFlowId || !exampleId) return;
    const key = `example:${exampleId}`;
    if (hasLoadedFlowRef.current === key) return;
    const example = EXAMPLE_FLOWS.find((f) => f.id === exampleId);
    if (!example) return;
    hasLoadedFlowRef.current = key;
    loadFlow({ ...example, id: '', createdAt: Date.now() });
    // Examples are ephemeral — force flowId null so "Save" creates a fresh flow
    // AND so the store→URL sync below doesn't think we have a saved flow to
    // redirect to (it would otherwise bounce us back to the previous /flow/:id).
    setFlowId(null);
    setFlowName(example.name);
  }, [urlFlowId, exampleId, loadFlow, setFlowId, setFlowName]);

  // Sync URL with store state
  // Only sync FROM store TO URL when store has a new flow that wasn't loaded from URL
  useEffect(() => {
    // Don't navigate while a flow is loading from the URL
    if (isFlowLoading) return;

    // A deep-linked example owns the URL (?example=<id>); never sync the store's
    // (stale, previous) flowId back onto it — that's what bounced "Load example"
    // back to the flow you came from.
    if (exampleId) return;

    // If store has a flow ID that differs from URL, and we're not loading that URL's flow,
    // it means the store was updated independently (e.g., new flow created, imported)
    if (flowId && flowId !== urlFlowId && !flowData) {
      navigate(`/flow/${flowId}`, { replace: true });
    } else if (!flowId && urlFlowId && !flowData) {
      // If store has no ID but URL does, and we failed to load it, navigate to new editor
      navigate('/editor', { replace: true });
    }
  }, [flowId, urlFlowId, navigate, isFlowLoading, flowData, exampleId]);

  // Modal states
  const [showFlowManager, setShowFlowManager] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [codeEditorFullscreen, setCodeEditorFullscreen] = useState(false);
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
    
    const newId = `${nodeToClone.type}-${uuid().slice(0, 8)}`;
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
      const newId = `${node.type}-${uuid().slice(0, 8)}`;
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
      id: `edge-${uuid().slice(0, 8)}`,
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
      } else if (cmdKey && (e.key === 'g' || e.key === 'G')) {
        // Group selected nodes (Cmd/Ctrl+G); Shift to ungroup the selected group.
        e.preventDefault();
        if (e.shiftKey) {
          const sel = nodes.find((n) => n.selected && n.type === 'group') ??
            (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId && n.type === 'group') : undefined);
          if (sel) {
            ungroupNode(sel.id);
            addExecutionLog('[OK] Ungrouped');
          }
        } else {
          const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
          const ids = selectedIds.length ? selectedIds : selectedNodeId ? [selectedNodeId] : [];
          if (ids.length >= 1) {
            const gid = groupSelected(ids);
            if (gid) addExecutionLog(`[OK] Grouped ${ids.length} node(s)`);
          }
        }
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
  }, [undo, redo, canUndo, canRedo, handleDuplicateNode, handleCopyNodes, handlePasteNodes, handleZoomToFit, nodes, selectedNodeId, groupSelected, ungroupNode, addExecutionLog]);
  
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

  // Heal module nodes that lost their ports (older flows, or contracts wiped
  // by pre-fix versions): re-derive contract+io from the resolved module code,
  // falling back to the module's stored io schema for typeless legacy sources.
  const healedModuleNodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const node of nodes) {
      const data = node.data as Record<string, unknown>;
      const ref = data.moduleRef as { id: string; version?: string; pinned?: boolean } | undefined;
      if (!ref?.id || healedModuleNodesRef.current.has(node.id)) continue;
      const contract = data.contract as { inputs?: object; outputs?: object } | undefined;
      const hasPorts = !!(
        contract &&
        (Object.keys(contract.inputs ?? {}).length || Object.keys(contract.outputs ?? {}).length)
      );
      if (hasPorts) continue;
      healedModuleNodesRef.current.add(node.id);

      const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
      const vParam = ref.pinned && ref.version ? `?version=${encodeURIComponent(ref.version)}` : '';
      fetch(`${SERVER_URL}/api/modules/${ref.id}/resolve${vParam}`, { credentials: 'include' })
        .then((r) => r.json())
        .then(async (json) => {
          if (!json.success) return;
          const { parseBlockSource } = await import('../../lib/block/parser');
          const { ioToContract, contractToIO } = await import('../../lib/block/io-compat');
          let healed = null;
          if (json.code) {
            try {
              const parsed = await parseBlockSource(json.code);
              if (Object.keys(parsed.contract.inputs).length || Object.keys(parsed.contract.outputs).length) {
                healed = parsed.contract;
              }
            } catch { /* legacy source without type declarations */ }
          }
          if (!healed && json.ioSchema) healed = ioToContract(json.ioSchema);
          if (healed) {
            useFlowStore.getState().updateNodeData(node.id, { contract: healed, io: contractToIO(healed) });
          }
        })
        .catch(() => healedModuleNodesRef.current.delete(node.id));
    }
  }, [nodes]);

  // Heal plain code nodes that lost their ports (stale saved flows / older
  // contracts): re-derive contract+io by parsing the node's own source. Skips
  // nodes that already have ports, so fresh examples are untouched.
  const healedCodeNodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const node of nodes) {
      if (node.type !== 'code') continue;
      const data = node.data as Record<string, unknown>;
      if (data.moduleRef) continue; // module nodes handled above
      const code = data.code as string | undefined;
      if (!code || healedCodeNodesRef.current.has(node.id)) continue;
      const contract = data.contract as { inputs?: object; outputs?: object } | undefined;
      const hasPorts = !!(
        contract &&
        (Object.keys(contract.inputs ?? {}).length || Object.keys(contract.outputs ?? {}).length)
      );
      if (hasPorts) continue;
      healedCodeNodesRef.current.add(node.id);

      (async () => {
        try {
          const { parseBlockSource } = await import('../../lib/block/parser');
          const { contractToIO } = await import('../../lib/block/io-compat');
          const parsed = await parseBlockSource(code);
          if (Object.keys(parsed.contract.inputs).length || Object.keys(parsed.contract.outputs).length) {
            useFlowStore.getState().updateNodeData(node.id, {
              contract: parsed.contract,
              io: contractToIO(parsed.contract),
            });
          }
        } catch {
          healedCodeNodesRef.current.delete(node.id);
        }
      })();
    }
  }, [nodes]);

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

  // ── type-mismatch connection prompt ──────────────────────────────────────
  const pendingConnection = useFlowStore((state) => state.pendingConnection);

  /** Extend the target block's contract with a matching input, then connect. */
  const handleAdaptConnection = useCallback(async () => {
    const state = useFlowStore.getState();
    const pending = state.pendingConnection;
    if (!pending) return;
    const targetNode = state.nodes.find((n) => n.id === pending.target);
    const sourceNode = state.nodes.find((n) => n.id === pending.source);
    const code = targetNode?.data.code;
    if (!targetNode || !code) {
      state.setPendingConnection(null);
      return;
    }
    try {
      const { parseBlockSource } = await import('../../lib/block/parser');
      const { composeBlockSource } = await import('../../lib/block/codegen');
      const { contractToIO } = await import('../../lib/block/io-compat');
      const parsed = await parseBlockSource(code);

      const baseName =
        (sourceNode?.type === 'input' && sourceNode.data.label) ||
        pending.sourceHandle ||
        pending.sourceType.kind;
      let name = String(baseName);
      let suffix = 2;
      while (name in parsed.contract.inputs) name = `${baseName}${suffix++}`;

      const newContract = {
        ...parsed.contract,
        inputs: { ...parsed.contract.inputs, [name]: pending.sourceType },
      };
      const newSource = composeBlockSource(newContract, parsed.bodyText);
      state.updateNodeData(targetNode.id, {
        code: newSource,
        contract: newContract,
        io: contractToIO(newContract),
      });
      state.setEdges([
        ...useFlowStore.getState().edges,
        {
          id: `edge-${pending.source}-${targetNode.id}-${name}`,
          source: pending.source,
          sourceHandle: pending.sourceHandle ?? undefined,
          target: targetNode.id,
          targetHandle: name,
          type: 'data',
        },
      ]);
      state.addExecutionLog(
        `[OK] Added input '${name}: ${pending.sourceType.kind}' to "${targetNode.data.label || 'Code'}" and connected`
      );
    } catch (e) {
      state.addExecutionLog(`[ERROR] Could not adapt contract: ${(e as Error).message}`);
    }
    useFlowStore.getState().setPendingConnection(null);
  }, []);

  /** Connect despite the mismatch — the user knows better. */
  const handleForceConnection = useCallback(() => {
    const state = useFlowStore.getState();
    const pending = state.pendingConnection;
    if (!pending) return;
    state.setEdges([
      ...state.edges,
      {
        id: `edge-${pending.source}-${pending.target}-${pending.targetHandle}`,
        source: pending.source,
        sourceHandle: pending.sourceHandle ?? undefined,
        target: pending.target,
        targetHandle: pending.targetHandle ?? undefined,
        type: 'data',
      },
    ]);
    state.setPendingConnection(null);
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // SINGLE LIVE-CANVAS ENGINE
  //
  // The live canvas runs ONE execution path: fold the WHOLE flow with trace
  // mode (`compileFlow(flow, { trace:true })`), run the folded source ONCE on
  // the shared worker (`executeScript(..., { returnHandles:true })`), then
  // distribute the per-node `__trace` ({ value, ms, status }) and the flow
  // `__outputs` back onto the canvas via the SAME store actions the old
  // bespoke per-node engine used (setNodeExecutionStatus / markNodeCached /
  // setExecutingNodeId). The folder executes EVERY node type — code, viewer,
  // bundle/unbundle, switch, map, group, constant, reroute, inspect — so the
  // canvas, viewer previews and Inspect (which all read nodeCache) light up
  // uniformly, with REAL per-node timing (ms via the endowed __hostNow clock).
  //
  // Nested schematic handles in trace/output values are deep-resolved by the
  // shared client (`workerClient.resolveSchematicHandles`) so SCHEMATIC nodes
  // render on the canvas and in the viewer.
  //
  // The one node type the folder does NOT compile is `subflow` (an embedded
  // `flowDefinition` run via `executeSubflow`). Flows containing a subflow are
  // routed through `runSubflowLegacy` below — a trimmed, subflow-aware
  // executor — so that (rare) feature is preserved, not regressed. Everything
  // else (all examples, all meta nodes) runs the unified path.
  // ════════════════════════════════════════════════════════════════════════

  /**
   * The unified live run. Folds + executes the whole flow once and paints the
   * canvas from `__trace` / `__outputs`.
   *
   * @param opts.onlyStale  When true (live/debounced mode), skip re-painting
   *   nodes whose cache is already up to date — the trace value is identical,
   *   so we avoid needless churn (and re-resolving schematic handles). The
   *   manual quick-run passes `false` to repaint everything.
   *
   * GRACEFUL FALLBACK: a FlowCompileError (mid-edit graph, or a subflow node)
   * or an executeScript throw never blanks the canvas — it surfaces in the
   * ExecutionPanel + leaves existing node state intact.
   */
  // Last raw (pre-resolve) trace value per node — lets live mode repaint only
  // what actually changed, instead of a drift-prone separate staleness graph.
  const lastTraceRef = useRef<Record<string, unknown>>({});
  const runUnifiedFlow = useCallback(
    async (opts: { onlyStale?: boolean } = {}): Promise<void> => {
      const onlyStale = !!opts.onlyStale;

      // Subflow nodes aren't foldable — hand the whole flow to the legacy
      // subflow-aware executor (kept solely for this case).
      if (flowHasSubflowNodes(nodes)) {
        await runSubflowLegacyRef.current?.(onlyStale);
        return;
      }

      setIsExecuting(true);
      if (!onlyStale) clearExecutionLogs();
      addExecutionLog(onlyStale ? 'Live update…' : 'Running flow…');

      // 1. COLLECT input values exactly as compileFlow names them.
      const inputValues = collectFlowInputs(nodes);

      // 2. FOLD with trace. A compile error means the graph is incomplete /
      //    mid-edit — surface it, keep the canvas, bail.
      let compiled;
      try {
        compiled = compileFlow({ nodes: nodes as never, edges: edges as never }, { trace: true });
      } catch (err) {
        const message = (err as Error)?.message || 'Flow could not be compiled';
        if (err instanceof FlowCompileError) {
          // Expected during editing (no code node yet, dangling edge, cycle…).
          addExecutionLog(`[WARN] ${message}`);
        } else {
          addExecutionLog(`[ERROR] ${message}`);
        }
        setIsExecuting(false);
        setExecutingNodeId(null);
        return;
      }

      // Cheap signature of a raw (pre-resolve) trace value, for change detection.
      const traceSig = (v: unknown): string => {
        try { return JSON.stringify(v) ?? 'u'; } catch { return `x${Math.random()}`; }
      };

      // Manual run flashes every node "pending"; live mode skips the flash and
      // just repaints whatever actually changed after the run (below), so a
      // tweak to any input always lands — no separate staleness graph needed.
      if (!onlyStale) {
        for (const node of nodes) {
          setNodeExecutionStatus(node.id, 'pending');
        }
      }

      // A folded run can fail as ONE script (e.g. a type-strip / syntax error in
      // a single node's body). Attribute it to the SPECIFIC culprit node(s) by
      // re-compiling each node's source, instead of flagging every code node.
      const flagFoldedError = (execError: ReturnType<typeof parseExecutionError>) => {
        const culprits = compileCulprits(nodes, compileBlock);
        if (culprits.length) {
          for (const c of culprits) {
            setNodeExecutionStatus(c.id, 'error', undefined, parseExecutionError(c.error));
          }
        } else {
          // No single node is at fault — the failure is in the fold itself.
          for (const node of nodes.filter((n) => n.type === 'code')) {
            setNodeExecutionStatus(node.id, 'error', undefined, execError);
          }
        }
      };

      // 3. EXECUTE the folded source once on the shared worker.
      let result;
      try {
        result = await executeScript(compiled.source, inputValues, { returnHandles: true });
      } catch (err) {
        const execError = parseExecutionError(err as Error);
        addExecutionLog(`[ERROR] ${execError.message}`);
        flagFoldedError(execError);
        setIsExecuting(false);
        setExecutingNodeId(null);
        return;
      }

      if (!result.success) {
        const execError = result.error
          ? parseExecutionError(result.error)
          : createSimpleError('Unknown execution error');
        addExecutionLog(`[ERROR] ${execError.message}`);
        flagFoldedError(execError);
        setIsExecuting(false);
        setExecutingNodeId(null);
        return;
      }

      const traced = result.result as unknown as Partial<TracedResult> | undefined;
      if (!traced || typeof traced !== 'object' || !('__trace' in traced)) {
        // No trace payload — nothing to distribute. (Shouldn't happen for a
        // trace-mode fold, but never blank the canvas if it does.)
        addExecutionLog('[WARN] Run produced no trace');
        setIsExecuting(false);
        setExecutingNodeId(null);
        return;
      }

      const trace = traced.__trace ?? {};
      const outputs = traced.__outputs ?? {};
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      // 4. DISTRIBUTE the per-node trace onto the canvas. In live mode, only
      //    the stale nodes repaint — a fresh node's trace value is identical,
      //    so skipping it avoids re-resolving its (possibly heavy) schematic
      //    handles every keystroke.
      for (const [nodeId, entry] of Object.entries(trace)) {
        const node = nodeById.get(nodeId);
        if (!node) continue;
        // Live mode: skip nodes whose value didn't change (avoids re-resolving
        // heavy schematic handles every keystroke); errors always repaint.
        const changed = traceSig(lastTraceRef.current[nodeId]) !== traceSig(entry.value);
        lastTraceRef.current[nodeId] = entry.value;
        if (onlyStale && !changed && entry.status !== 'error') continue;

        if (entry.status === 'error') {
          setNodeExecutionStatus(
            nodeId,
            'error',
            undefined,
            createSimpleError(entry.message || 'Execution error')
          );
          continue;
        }

        setExecutingNodeId(nodeId);
        // Deep-resolve any nested { _schematicHandle } to serialized preview data
        // so viewers / the canvas can render schematics.
        let value: unknown = entry.value;
        try {
          value = await workerClient.resolveSchematicHandles(value);
        } catch {
          /* keep raw value if a handle can't be resolved */
        }

        const output = traceValueToCache(value);
        setNodeExecutionStatus(nodeId, 'completed', output, undefined, Math.round(entry.ms));
      }

      // 5. OUTPUT nodes ← __outputs (resolving nested handles too).
      const outputNames = collectOutputNames(nodes);
      for (const [nodeId, name] of outputNames) {
        if (!(name in outputs)) continue;
        const changed = traceSig(lastTraceRef.current[`out:${nodeId}`]) !== traceSig(outputs[name]);
        lastTraceRef.current[`out:${nodeId}`] = outputs[name];
        if (onlyStale && !changed) continue;
        let value: unknown = outputs[name];
        try {
          value = await workerClient.resolveSchematicHandles(value);
        } catch {
          /* keep raw */
        }
        setNodeExecutionStatus(nodeId, 'completed', { output: value, default: value });
      }

      addExecutionLog('[OK] Run complete');
      setIsExecuting(false);
      setExecutingNodeId(null);
    },
    [
      nodes,
      edges,
      setIsExecuting,
      clearExecutionLogs,
      addExecutionLog,
      setNodeExecutionStatus,
      setExecutingNodeId,
      executeScript,
      workerClient,
    ]
  );

  // Manual quick-run (toolbar Play): repaint everything.
  const handleQuickRun = useCallback(() => runUnifiedFlow({ onlyStale: false }), [runUnifiedFlow]);
  // "Run stale" button shares the single path (repaint all — cheap, one fold).
  const handleIncrementalRun = useCallback(
    () => runUnifiedFlow({ onlyStale: true }),
    [runUnifiedFlow]
  );

  // ── SUBFLOW-ONLY LEGACY EXECUTOR ─────────────────────────────────────────
  // The single node type `compileFlow` cannot fold is `subflow` (embedded
  // `flowDefinition`, run in-worker via `executeSubflow`). Flows that contain
  // one fall back to this trimmed topological executor — it handles input /
  // file_input / asset / code / viewer / output / file_output / subflow and
  // resolves schematic handles for viewers + outputs, exactly as before. Kept
  // deliberately minimal and documented; the common (subflow-free) case never
  // reaches it. Invoked via a ref so the unified run (declared above) can call
  // it without a circular dependency.
  const runSubflowLegacy = useCallback(
    async (onlyStale: boolean): Promise<void> => {
      setIsExecuting(true);
      if (!onlyStale) clearExecutionLogs();
      addExecutionLog('Running flow (subflow mode)…');

      const nodeOutputs = new Map<string, Record<string, unknown>>();

      // Seed cached outputs so already-computed nodes feed downstream.
      const cacheSnapshot = useFlowStore.getState().nodeCache;
      for (const node of nodes) {
        const cache = cacheSnapshot[node.id];
        if ((cache?.status === 'completed' || cache?.status === 'cached') && cache.output) {
          nodeOutputs.set(node.id, cache.output as Record<string, unknown>);
        }
      }

      const pickValue = (
        sourceOutput: Record<string, unknown>,
        sourceHandle: string | null | undefined,
        targetHandle?: string | null
      ): unknown => {
        const key = sourceHandle || targetHandle || 'default';
        if (key in sourceOutput) return sourceOutput[key];
        if ('default' in sourceOutput) return sourceOutput['default'];
        const keys = Object.keys(sourceOutput);
        return keys.length === 1 ? sourceOutput[keys[0]] : undefined;
      };

      const resolveForDisplay = async (value: unknown): Promise<unknown> => {
        if (value && typeof value === 'object') {
          try {
            return await workerClient.resolveSchematicHandles(value);
          } catch {
            return value;
          }
        }
        return value;
      };

      try {
        const order = getExecutionOrder(nodes, edges);
        for (const node of nodes) setNodeExecutionStatus(node.id, 'pending');

        for (const node of order) {
          // input / file_input
          if (node.type?.includes('input') && !node.type?.includes('schematic')) {
            const outputValue =
              node.type === 'file_input'
                ? (node.data as { fileData: unknown }).fileData
                : node.data.value;
            const output = { output: outputValue, default: outputValue };
            nodeOutputs.set(node.id, output);
            setNodeExecutionStatus(node.id, 'completed', output);
            continue;
          }

          if (node.type === 'asset') {
            if (isAssetNodeData(node.data)) {
              const value = assetNodeValue(node.data);
              const output = { output: value, default: value };
              nodeOutputs.set(node.id, output);
              setNodeExecutionStatus(node.id, 'completed', output);
            } else {
              setNodeExecutionStatus(
                node.id,
                'error',
                undefined,
                createSimpleError('Asset node has no file — pick one')
              );
            }
            continue;
          }

          if (node.type === 'code') {
            const code = await resolveNodeCode(node as unknown as FlowNode);
            if (!code) {
              setNodeExecutionStatus(node.id, 'error', undefined, createSimpleError('No script'));
              continue;
            }
            const inputValues: Record<string, unknown> = {};
            for (const edge of edges.filter((e) => e.target === node.id)) {
              const sourceOutput = nodeOutputs.get(edge.source);
              if (!sourceOutput) continue;
              const inputName = edge.targetHandle || 'default';
              inputValues[inputName] = pickValue(sourceOutput, edge.sourceHandle, inputName);
            }
            setExecutingNodeId(node.id);
            setNodeExecutionStatus(node.id, 'running');
            const startTime = Date.now();
            const result = await executeScript(code, inputValues, { returnHandles: true });
            const executionTime = Date.now() - startTime;
            useFlowStore.getState().setNodeProgress(node.id, undefined);
            if (result.success) {
              let finalResult: Record<string, unknown> = {
                ...((result.result as Record<string, unknown> | undefined) ?? {}),
              };
              if (result.schematicHandles) {
                for (const [key, handleId] of Object.entries(result.schematicHandles)) {
                  finalResult[key] = { _schematicHandle: handleId };
                }
              }
              if (Object.keys(finalResult).length === 0) finalResult = result.result || {};
              if (Object.keys(finalResult).length === 1 && !('default' in finalResult)) {
                finalResult['default'] = finalResult[Object.keys(finalResult)[0]];
              }
              nodeOutputs.set(node.id, finalResult);
              setNodeExecutionStatus(node.id, 'completed', finalResult, undefined, executionTime);
            } else {
              const execError = result.error
                ? parseExecutionError(result.error, node.data.code)
                : createSimpleError('Unknown execution error');
              setNodeExecutionStatus(node.id, 'error', undefined, execError);
              break;
            }
            continue;
          }

          if (node.type === 'viewer' || node.type === 'output' || node.type === 'file_output') {
            const incomingEdge = edges.find((e) => e.target === node.id);
            if (!incomingEdge) continue;
            const sourceOutput = nodeOutputs.get(incomingEdge.source);
            if (!sourceOutput) continue;
            const raw = pickValue(sourceOutput, incomingEdge.sourceHandle);
            const display = await resolveForDisplay(raw);
            if (node.type === 'viewer') {
              setNodeExecutionStatus(node.id, 'completed', { default: display });
              if ((node.data as { passthrough?: boolean }).passthrough) {
                nodeOutputs.set(node.id, { output: raw, default: raw });
              }
            } else {
              setNodeExecutionStatus(node.id, 'completed', { output: display, default: display });
              nodeOutputs.set(node.id, { output: display, default: display });
            }
            continue;
          }

          if (node.type === 'subflow') {
            const subflowData = node.data as {
              subflowConfig: { outputs: { id: string }[] };
              flowDefinition?: { nodes: FlowNode[]; edges: Edge[] };
            };
            if (!subflowData.flowDefinition) {
              setNodeExecutionStatus(
                node.id,
                'error',
                undefined,
                createSimpleError('Subflow definition not loaded')
              );
              continue;
            }
            setExecutingNodeId(node.id);
            setNodeExecutionStatus(node.id, 'running');
            const subflowStartTime = Date.now();
            try {
              const subflowInputs: Record<string, unknown> = {};
              for (const edge of edges.filter((e) => e.target === node.id)) {
                const sourceOutput = nodeOutputs.get(edge.source);
                if (sourceOutput && edge.targetHandle) {
                  subflowInputs[edge.targetHandle] = pickValue(
                    sourceOutput,
                    edge.sourceHandle,
                    edge.targetHandle
                  );
                }
              }
              const def = subflowData.flowDefinition;
              const outputNodeIds = subflowData.subflowConfig.outputs.map((o) => o.id);
              const result = await executeSubflow(
                def.nodes.map((n) => ({
                  id: n.id,
                  type: n.type || 'unknown',
                  data: { code: n.data.code, value: n.data.value, label: n.data.label },
                })),
                def.edges.map((e) => ({
                  id: e.id,
                  source: e.source,
                  target: e.target,
                  sourceHandle: e.sourceHandle,
                  targetHandle: e.targetHandle,
                })),
                subflowInputs,
                outputNodeIds
              );
              if (!result.success) throw new Error(result.error?.message || 'Subflow failed');
              let subflowResult: Record<string, unknown> = {};
              if (result.schematics && Object.keys(result.schematics).length > 0) {
                for (const [key, value] of Object.entries(result.schematics)) {
                  if (value) subflowResult[key] = value;
                }
              } else {
                subflowResult = result.outputs;
              }
              if (Object.keys(subflowResult).length === 1 && !('default' in subflowResult)) {
                subflowResult['default'] = subflowResult[Object.keys(subflowResult)[0]];
              }
              nodeOutputs.set(node.id, subflowResult);
              const subflowTime = result.executionTime || Date.now() - subflowStartTime;
              setNodeExecutionStatus(node.id, 'completed', subflowResult, undefined, subflowTime);
            } catch (err) {
              setNodeExecutionStatus(node.id, 'error', undefined, parseExecutionError(err as Error));
              break;
            }
            continue;
          }
        }

        addExecutionLog('[OK] Run complete');
      } catch (error) {
        const execError = parseExecutionError(error as Error);
        addExecutionLog(`[ERROR] ${execError.message}`);
        for (const node of nodes.filter((n) => n.type === 'code')) {
          setNodeExecutionStatus(node.id, 'error', undefined, execError);
        }
      } finally {
        setIsExecuting(false);
        setExecutingNodeId(null);
      }
    },
    [
      nodes,
      edges,
      setIsExecuting,
      clearExecutionLogs,
      addExecutionLog,
      setNodeExecutionStatus,
      setExecutingNodeId,
      executeScript,
      executeSubflow,
      getExecutionOrder,
      resolveNodeCode,
      workerClient,
    ]
  );

  // Ref so runUnifiedFlow (declared earlier) can invoke the legacy executor.
  const runSubflowLegacyRef = useRef<((onlyStale: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    runSubflowLegacyRef.current = runSubflowLegacy;
  }, [runSubflowLegacy]);

  // Listen for live execution triggers (execution mode 'live'). Triggers that
  // land mid-run are NOT dropped: they set a pending flag and re-run once the
  // current pass finishes, so the final tweak always lands — on the SAME path.
  const pendingLiveRunRef = useRef(false);
  useEffect(() => {
    const handleLiveExecution = async () => {
      if (useFlowStore.getState().isExecuting) {
        pendingLiveRunRef.current = true;
        return;
      }
      do {
        pendingLiveRunRef.current = false;
        await runUnifiedFlow({ onlyStale: true });
      } while (pendingLiveRunRef.current);
    };

    window.addEventListener(
      'polymerase:liveExecutionTrigger',
      handleLiveExecution as unknown as EventListener
    );
    return () => {
      window.removeEventListener(
        'polymerase:liveExecutionTrigger',
        handleLiveExecution as unknown as EventListener
      );
    };
  }, [runUnifiedFlow]);

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
      const nodePropsString = event.dataTransfer.getData('application/reactflow-nodeprops');

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
      const extraNodeProps = nodePropsString ? JSON.parse(nodePropsString) : {};

      const newNode: FlowNode = {
        id: `${type}-${uuid().slice(0, 8)}`,
        type,
        position,
        data: nodeData,
        ...extraNodeProps,
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

      {/* Main Area — Toolbar + Canvas.
          min-h-0 lets this row shrink to the viewport instead of growing to the
          sidebar's full content height — otherwise the Toolbar's `h-full` can't
          resolve to a bounded height and its internal scroll never engages,
          stretching the whole page past 100vh. */}
      <div className="flex-1 flex relative min-h-0">
        {/* Node Toolbar - Desktop sidebar */}
        {!isMobile && <Toolbar />}

        <div className="flex-1 relative min-w-0">
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
          
          {/* Tidy-layout button */}
          <Panel position="top-left">
            <button
              onClick={handleTidyLayout}
              disabled={layingOut}
              title="Auto-arrange the node layout (ELK)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-800/60 bg-[#0c0c10]/90 backdrop-blur-md px-3 py-2 text-xs font-medium text-neutral-300 shadow-2xl shadow-black/50 transition hover:border-emerald-600/60 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wand2 className={`w-3.5 h-3.5 ${layingOut ? 'animate-pulse' : ''}`} />
              {layingOut ? 'Arranging…' : 'Tidy layout'}
            </button>
          </Panel>

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
          setCodeEditorFullscreen(false);
        }}
        size={isMobile || codeEditorFullscreen ? 'full' : 'xl'}
        showCloseButton={false}
      >
        {editingNodeId && (
          <CodePanel
            nodeId={editingNodeId}
            isFullscreen={codeEditorFullscreen}
            onToggleFullscreen={() => setCodeEditorFullscreen((v) => !v)}
            onClose={() => {
              setShowCodeEditor(false);
              setEditingNodeId(null);
              setCodeEditorFullscreen(false);
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
      {features.apiExecution && (
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
      )}

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

      {/* Type-mismatch connection prompt */}
      {pendingConnection && (
        <div className="fixed bottom-6 left-1/2 z-[60] w-[460px] -translate-x-1/2 rounded-xl border border-amber-600/40 bg-neutral-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur">
          <p className="text-xs text-neutral-300">
            <span className="font-mono text-amber-300">{pendingConnection.sourceHandle || 'output'}</span>
            <span className="text-neutral-500"> ({pendingConnection.sourceType.kind})</span>
            {' '}doesn&apos;t fit input{' '}
            <span className="font-mono text-amber-300">{pendingConnection.targetHandle}</span>
            <span className="text-neutral-500"> ({pendingConnection.targetType.kind})</span>.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleAdaptConnection}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              Add a {pendingConnection.sourceType.kind} input & connect
            </button>
            <button
              onClick={handleForceConnection}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
            >
              Connect anyway
            </button>
            <button
              onClick={() => useFlowStore.getState().setPendingConnection(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
