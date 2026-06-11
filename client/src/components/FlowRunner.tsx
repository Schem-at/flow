import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Play, Loader2, AlertCircle, Workflow, Pencil, Zap,
  Download, Clock, Globe, Lock, Link2, ChevronDown
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Navbar } from './layout/Navbar';
import { useLocalExecutor } from '../hooks/useLocalExecutor';
import SchematicRenderer from './others/SchematicRenderer';
import { cacheFile, getCachedFile } from '../lib/fileCache';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

interface IOPort {
  name?: string;
  type: string;
  default?: unknown;
  description?: string;
  options?: string[] | { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

interface FlowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    value?: unknown;
    code?: string;
    dataType?: string;
    moduleRef?: { id: string; slug?: string; version?: string; pinned?: boolean };
    config?: Record<string, unknown>;
    io?: {
      inputs: Record<string, IOPort>;
      outputs: Record<string, IOPort>;
    };
  };
}

interface FlowData {
  id: string;
  name: string;
  version: string;
  visibility: string;
  metadata?: { description?: string };
  jsonContent: {
    nodes: FlowNode[];
    edges: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
  };
  canEdit: boolean;
  owner?: { username: string; avatar: string } | null;
}

const INPUT_TYPES = ['number_input', 'text_input', 'boolean_input', 'select_input', 'input', 'file_input'];
const OUTPUT_TYPES = ['output', 'viewer', 'file_output'];

function getInputDefault(node: FlowNode): unknown {
  if (node.data.value !== undefined) return node.data.value;
  if (node.data.config?.default !== undefined) return node.data.config.default;
  const firstOutput = node.data.io?.outputs ? Object.values(node.data.io.outputs)[0] : null;
  if (firstOutput?.default !== undefined) return firstOutput.default;
  switch (node.type) {
    case 'number_input': return 0;
    case 'boolean_input': return false;
    default: return '';
  }
}

function getSelectOptions(node: FlowNode): { value: string; label: string }[] {
  const opts = node.data.config?.options || [];
  return (opts as unknown[]).map((o) => {
    if (typeof o === 'string') return { value: o, label: o };
    if (typeof o === 'object' && o && 'value' in o) return o as { value: string; label: string };
    return { value: String(o), label: String(o) };
  });
}

export function FlowRunner() {
  const { flowId } = useParams();
  const { executeScript } = useLocalExecutor();
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [outputs, setOutputs] = useState<Record<string, unknown>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsReadyRef = useRef(false);
  // Cache node outputs between runs to skip unchanged nodes
  const nodeOutputCacheRef = useRef<Map<string, { inputHash: string; outputs: Record<string, unknown> }>>(new Map());

  const { data, isLoading } = useQuery<FlowData>({
    queryKey: ['flow-run', flowId],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow as FlowData;
    },
    enabled: !!flowId,
  });

  const { inputNodes, codeNodes, outputNodes, edges } = useMemo(() => {
    if (!data?.jsonContent) return { inputNodes: [], codeNodes: [], outputNodes: [], edges: [] };
    const nodes = data.jsonContent.nodes;
    return {
      inputNodes: nodes.filter(n => INPUT_TYPES.includes(n.type)),
      codeNodes: nodes.filter(n => n.type === 'code'),
      outputNodes: nodes.filter(n => OUTPUT_TYPES.includes(n.type)),
      edges: data.jsonContent.edges,
    };
  }, [data]);

  // Clear node output cache when flow definition changes (code updates, etc.)
  useEffect(() => {
    nodeOutputCacheRef.current.clear();
  }, [data]);

  // Initialize default inputs + restore cached files
  useEffect(() => {
    if (inputNodes.length === 0) return;

    const init = async () => {
      const defaults: Record<string, unknown> = {};
      for (const n of inputNodes) {
        const label = n.data.label || n.id;
        if (n.type === 'file_input' && flowId) {
          const cached = await getCachedFile(flowId, label);
          if (cached) {
            defaults[label] = cached;
            continue;
          }
        }
        defaults[label] = getInputDefault(n);
      }
      setInputs(defaults);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputNodes, flowId]);

  // Get topological execution order for code nodes
  const getExecutionOrder = (): FlowNode[] => {
    if (codeNodes.length <= 1) return codeNodes;

    const nodeIds = new Set(codeNodes.map(n => n.id));
    const deps = new Map<string, Set<string>>();
    codeNodes.forEach(n => deps.set(n.id, new Set()));

    // Build dependency graph from edges between code nodes
    for (const edge of edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        deps.get(edge.target)!.add(edge.source);
      }
    }

    // Topological sort
    const sorted: FlowNode[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dep of deps.get(id) || []) visit(dep);
      const node = codeNodes.find(n => n.id === id);
      if (node) sorted.push(node);
    };
    codeNodes.forEach(n => visit(n.id));
    return sorted;
  };

  // Resolve inputs for a code node from user inputs + previous node outputs
  const resolveNodeInputs = (
    node: FlowNode,
    nodeOutputs: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> => {
    const resolved: Record<string, unknown> = {};
    const nodeInputs = node.data.io?.inputs || {};

    for (const [handleName] of Object.entries(nodeInputs)) {
      // Find edge targeting this handle
      const edge = edges.find(e => e.target === node.id && e.targetHandle === handleName);
      if (!edge) continue;

      const sourceNode = data?.jsonContent.nodes.find(n => n.id === edge.source);
      if (!sourceNode) continue;

      if (INPUT_TYPES.includes(sourceNode.type)) {
        // Input node — get from user inputs
        const label = sourceNode.data.label || sourceNode.id;
        resolved[handleName] = inputs[label];
      } else if (sourceNode.type === 'code') {
        // Code node — get from its outputs
        const prevOutputs = nodeOutputs.get(sourceNode.id);
        if (prevOutputs && edge.sourceHandle) {
          resolved[handleName] = prevOutputs[edge.sourceHandle];
        }
      }
    }

    // Also handle default handle connections
    const defaultEdge = edges.find(e => e.target === node.id && e.targetHandle === 'default');
    if (defaultEdge) {
      const sourceNode = data?.jsonContent.nodes.find(n => n.id === defaultEdge.source);
      if (sourceNode && INPUT_TYPES.includes(sourceNode.type)) {
        const label = sourceNode.data.label || sourceNode.id;
        const val = inputs[label];
        // If using default handle, pass as first input key or 'input'
        const firstKey = Object.keys(nodeInputs)[0] || 'input';
        resolved[firstKey] = val;
      } else if (sourceNode?.type === 'code') {
        const prevOutputs = nodeOutputs.get(sourceNode.id);
        if (prevOutputs && defaultEdge.sourceHandle) {
          const firstKey = Object.keys(nodeInputs)[0] || 'input';
          resolved[firstKey] = prevOutputs[defaultEdge.sourceHandle];
        }
      }
    }

    return resolved;
  };

  // Convert File objects to DataValue format for the execution engine
  const prepareFileInput = async (value: unknown): Promise<unknown> => {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      return {
        format: value.name.split('.').pop() || 'bin',
        data: new Uint8Array(arrayBuffer),
        metadata: { name: value.name, fileSize: value.size, mimeType: value.type },
      };
    }
    return value;
  };

  const flattenResult = (rawResult: unknown): Record<string, unknown> => {
    const flat: Record<string, unknown> = {};
    if (rawResult && typeof rawResult === 'object') {
      const r = rawResult as Record<string, unknown>;
      if (r.result && typeof r.result === 'object') {
        Object.entries(r.result as Record<string, unknown>).forEach(([k, v]) => { flat[k] = v; });
      }
      if (r.schematics && typeof r.schematics === 'object') {
        Object.entries(r.schematics as Record<string, unknown>).forEach(([k, v]) => { flat[k] = v; });
      }
      if (Object.keys(flat).length === 0) {
        Object.entries(r).forEach(([k, v]) => {
          if (k !== 'success' && k !== 'executionTime') flat[k] = v;
        });
      }
    } else {
      flat['result'] = rawResult;
    }
    return flat;
  };

  const handleRun = async () => {
    if (codeNodes.length === 0) {
      setError('No code nodes found in this flow');
      return;
    }

    console.log('[FlowRunner] handleRun called, codeNodes:', codeNodes.length, 'outputNodes:', outputNodes.length);
    setIsRunning(true);
    setError(null);
    // Don't clear outputs — let them update in place to avoid remounting the schematic renderer
    const start = performance.now();

    try {
      // Prepare file inputs
      const preparedInputs = { ...inputs };
      for (const [key, val] of Object.entries(preparedInputs)) {
        preparedInputs[key] = await prepareFileInput(val);
      }

      const executionOrder = getExecutionOrder();
      const nodeOutputs = new Map<string, Record<string, unknown>>();
      const moduleCodeCache = new Map<string, string>();

      // Resolve module references — fetch code from API for module instances
      const resolveCode = async (node: FlowNode): Promise<string> => {
        const ref = node.data.moduleRef as { id: string; version?: string; pinned?: boolean } | undefined;
        if (!ref?.id) return node.data.code || '';

        const cacheKey = `${ref.id}@${ref.version || 'latest'}`;
        if (moduleCodeCache.has(cacheKey)) return moduleCodeCache.get(cacheKey)!;

        const params = ref.version ? `?version=${encodeURIComponent(ref.version)}` : '';
        const res = await fetch(`${SERVER_URL}/api/modules/${ref.id}/resolve${params}`, { credentials: 'include' });
        const json = await res.json();
        if (!json.success) throw new Error(`Failed to load module: ${ref.id}`);

        moduleCodeCache.set(cacheKey, json.code);
        return json.code;
      };

      // Execute code nodes in order, skipping nodes whose inputs haven't changed
      for (const node of executionOrder) {
        const nodeInputs = resolveNodeInputs(node, nodeOutputs);

        // For file inputs not resolved via edges, check prepared inputs
        for (const [key, val] of Object.entries(nodeInputs)) {
          if (val instanceof File) {
            nodeInputs[key] = await prepareFileInput(val);
          }
        }

        // Hash inputs to detect changes (skip expensive nodes when inputs are identical)
        const inputHash = JSON.stringify(nodeInputs, (_, v) =>
          v instanceof Uint8Array ? `u8[${v.length}]` :
          ArrayBuffer.isView(v) ? `view[${(v as Uint8Array).length}]` : v
        );
        const cached = nodeOutputCacheRef.current.get(node.id);
        if (cached && cached.inputHash === inputHash) {
          nodeOutputs.set(node.id, cached.outputs);
          continue; // Skip execution — inputs unchanged
        }

        const code = await resolveCode(node);
        const rawResult = await executeScript(code, nodeInputs);
        const flat = flattenResult(rawResult);
        nodeOutputs.set(node.id, flat);

        // Cache for next run
        nodeOutputCacheRef.current.set(node.id, { inputHash, outputs: flat });
      }

      // Collect final outputs from the last code node + any output/viewer nodes
      const lastNodeId = executionOrder[executionOrder.length - 1]?.id;
      const finalOutputs: Record<string, unknown> = {};

      console.log('[FlowRunner] nodeOutputs:', Object.fromEntries(nodeOutputs));
      console.log('[FlowRunner] outputNodes:', outputNodes.map(n => `${n.id}(${n.type})`));

      // Map output/viewer nodes to their source data
      for (const outNode of outputNodes) {
        const edge = edges.find(e => e.target === outNode.id);
        console.log('[FlowRunner] outNode:', outNode.id, 'edge:', edge?.source, ':', edge?.sourceHandle);
        if (edge && edge.source) {
          const sourceOutputs = nodeOutputs.get(edge.source);
          console.log('[FlowRunner] sourceOutputs keys:', sourceOutputs ? Object.keys(sourceOutputs) : 'NONE');
          if (sourceOutputs && edge.sourceHandle) {
            const val = sourceOutputs[edge.sourceHandle];
            console.log('[FlowRunner] mapped:', outNode.data.label, '=', val ? typeof val : 'undefined');
            finalOutputs[outNode.data.label || edge.sourceHandle] = val;
          }
        }
      }

      // If no output nodes found, use last code node's outputs
      if (Object.keys(finalOutputs).length === 0 && lastNodeId) {
        Object.assign(finalOutputs, nodeOutputs.get(lastNodeId) || {});
      }

      setExecutionTime(performance.now() - start);
      setOutputs(finalOutputs);
    } catch (err) {
      console.error('[FlowRunner] Execution error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setExecutionTime(performance.now() - start);
    } finally {
      setIsRunning(false);
    }
  };

  const setInput = useCallback((key: string, value: unknown) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Memoize output categorization to avoid recreating Uint8Arrays on every render
  const { schematicOutputs, nonSchematicOutputs } = useMemo(() => {
    const schematics: { key: string; bytes: Uint8Array }[] = [];
    const nonSchematics: { key: string; value: unknown }[] = [];

    for (const [key, value] of Object.entries(outputs)) {
      if (value && typeof value === 'object' && '__wbg_ptr' in (value as Record<string, unknown>)) continue;

      const val = value as Record<string, unknown> | null;
      const isSchematicObj = val && typeof val === 'object' && 'format' in val && 'data' in val;
      const outputNode = outputNodes.find(n => n.data.label === key);
      const isSchematic = isSchematicObj || outputNode?.type === 'viewer';

      if (isSchematic && isSchematicObj && val) {
        const rawData = val.data;
        let bytes: Uint8Array | null = null;
        if (typeof rawData === 'string') {
          bytes = new Uint8Array(atob(rawData).split('').map(c => c.charCodeAt(0)));
        } else if (rawData instanceof Uint8Array) {
          bytes = rawData;
        } else if (rawData && typeof rawData === 'object') {
          bytes = new Uint8Array(Object.values(rawData as Record<string, number>));
        }
        if (bytes) schematics.push({ key, bytes });
      } else {
        nonSchematics.push({ key, value });
      }
    }

    return { schematicOutputs: schematics, nonSchematicOutputs: nonSchematics };
  }, [outputs, outputNodes]);

  // Auto-run in live mode with debounce
  useEffect(() => {
    if (!liveMode || !inputsReadyRef.current || codeNodes.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleRun();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, liveMode]);

  // Mark inputs as ready after initial defaults are set
  useEffect(() => {
    if (Object.keys(inputs).length > 0) {
      inputsReadyRef.current = true;
    }
  }, [inputs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#07070a]">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#07070a]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32">
          <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
          <p className="text-sm text-neutral-400">Flow not found</p>
        </div>
      </div>
    );
  }

  const visIcon = data.visibility === 'public' ? Globe : data.visibility === 'unlisted' ? Link2 : Lock;
  const VisIcon = visIcon;

  return (
    <div className="min-h-screen bg-[#07070a]">
      {/* Dot grid */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #22c55e 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-3xl mx-auto px-6 pt-8 pb-16">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/[0.07] border border-green-500/10 flex items-center justify-center">
                    <Workflow className="w-4 h-4 text-green-500/60" />
                  </div>
                  <h1 className="text-xl font-semibold text-white">{data.name}</h1>
                  <span className="text-[10px] font-mono text-neutral-600">v{data.version}</span>
                  <VisIcon className="w-3 h-3 text-neutral-600" />
                </div>
                {data.owner && (
                  <div className="flex items-center gap-1.5 ml-10 mb-2">
                    <img src={data.owner.avatar} alt="" className="w-4 h-4 rounded" />
                    <span className="text-xs text-neutral-500">{data.owner.username}</span>
                  </div>
                )}
                {data.metadata?.description && (
                  <div className="ml-10 text-sm text-neutral-400 prose prose-sm prose-invert max-w-none prose-a:text-green-400 prose-code:text-green-300">
                    <Markdown>{data.metadata.description}</Markdown>
                  </div>
                )}
              </div>
              {data.canEdit && (
                <Link
                  to={`/editor/${data.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Inputs + Run */}
            <div>
              <div className="bg-[#0c0c10] border border-neutral-800/40 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-800/30">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-500">Inputs</h2>
                </div>

                <div className="p-4 space-y-4">
                  {inputNodes.length === 0 && (
                    <p className="text-xs text-neutral-600 text-center py-4">No inputs — this flow runs without parameters</p>
                  )}

                  {inputNodes.map(node => {
                    const label = node.data.label || node.id;
                    const desc = node.data.config?.description as string | undefined ||
                      (node.data.io?.outputs ? Object.values(node.data.io.outputs)[0]?.description : undefined);
                    const value = inputs[label];

                    return (
                      <div key={node.id}>
                        <label className="block text-xs font-medium text-neutral-300 mb-1">
                          {label}
                          {desc && <span className="text-neutral-600 font-normal ml-1.5">— {desc}</span>}
                        </label>

                        {node.type === 'number_input' && (
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min={node.data.config?.min as number ?? 0}
                              max={node.data.config?.max as number ?? 100}
                              step={node.data.config?.step as number ?? 1}
                              value={Number(value) || 0}
                              onChange={e => setInput(label, Number(e.target.value))}
                              className="flex-1"
                            />
                            <input
                              type="number"
                              value={Number(value) || 0}
                              onChange={e => setInput(label, Number(e.target.value))}
                              className="w-20 bg-[#07070a] border border-neutral-800/40 rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-green-500/30"
                            />
                          </div>
                        )}

                        {node.type === 'text_input' && (
                          <input
                            type="text"
                            value={String(value ?? '')}
                            onChange={e => setInput(label, e.target.value)}
                            className="w-full bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/30 placeholder:text-neutral-700"
                          />
                        )}

                        {node.type === 'boolean_input' && (
                          <button
                            onClick={() => setInput(label, !value)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                              value
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-[#07070a] border-neutral-800/40 text-neutral-500'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-sm ${value ? 'bg-green-500' : 'bg-neutral-700'}`} />
                            {value ? 'True' : 'False'}
                          </button>
                        )}

                        {node.type === 'select_input' && (
                          <div className="relative">
                            <select
                              value={String(value ?? '')}
                              onChange={e => setInput(label, e.target.value)}
                              className="w-full bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/30 appearance-none"
                            >
                              {getSelectOptions(node).map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-neutral-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        )}

                        {node.type === 'file_input' && (
                          <div>
                            <input
                              type="file"
                              onChange={e => {
                                const file = e.target.files?.[0] ?? null;
                                setInput(label, file);
                                if (file && flowId) cacheFile(flowId, label, file);
                              }}
                              className="w-full text-xs text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-neutral-800/40 file:bg-[#07070a] file:text-neutral-400 file:text-xs file:font-medium hover:file:bg-white/5 file:transition-colors file:cursor-pointer"
                            />
                            {value instanceof File && (
                              <div className="mt-1 text-[9px] text-green-500/60 font-mono flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                                {(value as File).name} ({Math.round((value as File).size / 1024)}KB)
                              </div>
                            )}
                          </div>
                        )}

                        {(node.type === 'input' && node.data.dataType !== 'file') && (
                          <input
                            type="text"
                            value={String(value ?? '')}
                            onChange={e => setInput(label, e.target.value)}
                            className="w-full bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/30"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Run controls */}
                <div className="px-4 py-3 border-t border-neutral-800/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRun}
                      disabled={isRunning || codeNodes.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold text-sm rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-[0.98]"
                    >
                      {isRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      {isRunning ? 'Running...' : 'Run'}
                    </button>
                    <button
                      onClick={() => setLiveMode(!liveMode)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border transition-all ${
                        liveMode
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-[#07070a] border-neutral-800/40 text-neutral-500 hover:text-neutral-300'
                      }`}
                      title={liveMode ? 'Live mode: auto-runs on input change' : 'Manual mode: click Run to execute'}
                    >
                      <Zap className={`w-3.5 h-3.5 ${liveMode ? 'fill-current' : ''}`} />
                      Live
                    </button>
                  </div>
                  {executionTime !== null && (
                    <div className="flex items-center justify-center gap-1 text-[10px] font-mono text-neutral-600">
                      <Clock className="w-2.5 h-2.5" />
                      {executionTime.toFixed(0)}ms
                      {liveMode && <span className="text-amber-500/50 ml-1">auto</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Outputs */}
            <div>
              <div className="bg-[#0c0c10] border border-neutral-800/40 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-800/30">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-500">Output</h2>
                </div>

                <div className="p-4">
                  {error && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono flex-1">{error}</pre>
                      </div>
                    </div>
                  )}

                  {Object.keys(outputs).length === 0 && !error && (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-700">
                      <Workflow className="w-8 h-8 mb-2" />
                      <p className="text-xs">Run the flow to see output</p>
                    </div>
                  )}

                  {/* Schematic renderers — stable keys, memoized data */}
                  {schematicOutputs.map(({ key, bytes }) => (
                    <div key={`schem-${key}`} className="mb-4">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-600 mb-2">{key}</div>
                      <div className="rounded-lg overflow-hidden border border-neutral-800/40 h-64">
                        <SchematicRenderer schematic={bytes} />
                      </div>
                      <button
                        onClick={() => {
                          const blob = new Blob([bytes], { type: 'application/octet-stream' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${key}.schem`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-1 mt-2 text-[10px] text-green-500/70 hover:text-green-400 transition-colors"
                      >
                        <Download className="w-2.5 h-2.5" /> Download .schem
                      </button>
                    </div>
                  ))}

                  {/* Non-schematic outputs */}
                  {nonSchematicOutputs.map(({ key, value }) => (
                    <div key={key} className="mb-4 last:mb-0">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-600 mb-2">{key}</div>
                      {typeof value === 'string' ? (
                        <div className="bg-[#07070a] border border-neutral-800/40 rounded-lg p-3">
                          <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono">{value}</pre>
                        </div>
                      ) : typeof value === 'number' || typeof value === 'boolean' ? (
                        <div className="bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2">
                          <span className="text-sm font-mono text-green-400">{String(value)}</span>
                        </div>
                      ) : value && typeof value === 'object' ? (
                        <div className="bg-[#07070a] border border-neutral-800/40 rounded-lg p-3">
                          <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono">{JSON.stringify(value, null, 2)}</pre>
                        </div>
                      ) : (
                        <div className="bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2">
                          <span className="text-xs text-neutral-600 italic">null</span>
                        </div>
                      )}
                      {typeof value === 'string' && value.length > 100 && (
                        <button
                          onClick={() => {
                            const blob = new Blob([value], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${key}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-1 mt-1.5 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                        >
                          <Download className="w-2.5 h-2.5" /> Download as file
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
