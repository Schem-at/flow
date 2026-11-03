import { getToolInputContract, inputName, inputDefault } from '@flow/core';
import { useAuth } from '../hooks/useAuth';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Play, Loader2, AlertCircle, Workflow, Pencil, Zap,
  Clock, Globe, Lock, Link2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Navbar } from './layout/Navbar';
import { useLocalExecutor } from '../hooks/useLocalExecutor';
import type { CompiledFlow, FlowLike } from '@flow/core';
import { compileFlow, validateToolInputs, hashFlow } from '@flow/core';
import { EXAMPLE_FLOWS } from '../lib/exampleFlows';
import { hydrateModuleToGroup, type ModuleResolvePayload } from '../lib/moduleHydrate';
import {
  parseContextFromQuery,
  parseContextMessage,
  prefillInputsFromContext,
  EMBED_READY,
  type EmbedContext,
} from '../lib/embedContext';
import { GeneratedToolForm } from './GeneratedToolForm';
import { inputFieldType } from '@flow/core';
import { ToolOutput } from './blocks/NativeViewers';
import { ToolComments } from './ToolComments';
import { toolApi } from '../lib/toolApi';
import { resumeTool } from '../lib/resumeTool';

/**
 * Tool-mode flow folding: compile the whole graph into ONE script per content
 * hash and run it in a single worker call — no per-node serialization
 * round-trips. Invalid graphs report their compile error before execution.
 * Module instances are hydrated into group nodes (see resolveModuleNodes) before
 * folding, so the same contract applies to their execution.
 */
const foldCache = new Map<string, CompiledFlow>();
function getFoldedFlowCached(flow: FlowLike | null, trace = false): CompiledFlow | null {
  if (!flow) return null;
  const hash = hashFlow(flow) + String(trace);
  const hit = foldCache.get(hash);
  if (hit) return hit;
  const folded = compileFlow(flow, { trace });
  foldCache.set(hash, folded);
  if (foldCache.size > 20) foldCache.delete(foldCache.keys().next().value!);
  return folded;
}

/**
 * Module instances are `group` nodes carrying a `moduleRef`. Before folding,
 * resolve any that aren't yet hydrated (drag-dropped refs, or legacy `code`
 * nodes with a moduleRef from before the group consolidation) into a hydrated
 * group subgraph — so the whole flow folds statically and there's no per-node
 * module fetch at run time. Already-hydrated module groups pass through.
 */
const moduleResolveCache = new Map<string, ModuleResolvePayload>();
async function resolveModuleNodes(nodes: FlowNode[]): Promise<FlowNode[]> {
  const out: FlowNode[] = [];
  for (const node of nodes) {
    const ref = node.data.moduleRef;
    const alreadyHydrated =
      node.type === 'group' && Array.isArray(node.data.subgraph?.nodes) && node.data.subgraph!.nodes.length > 0;
    if (!ref?.id || alreadyHydrated) {
      out.push(node);
      continue;
    }
    const key = `${ref.id}@${ref.version || 'latest'}`;
    let payload = moduleResolveCache.get(key);
    if (!payload) {
      const params = ref.version ? `?version=${encodeURIComponent(ref.version)}` : '';
      const res = await fetch(`${SERVER_URL}/api/modules/${ref.id}/resolve${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success || !json.ioSchema) throw new Error(`Failed to load module: ${ref.id}`);
      payload = {
        subgraph: json.subgraph ?? undefined,
        ioSchema: json.ioSchema,
        code: json.code ?? undefined,
        version: json.version,
      };
      moduleResolveCache.set(key, payload);
    }
    const g = hydrateModuleToGroup(payload, { id: ref.id, slug: ref.slug ?? ref.id });
    out.push({ ...node, type: 'group', data: { ...node.data, ...g } } as FlowNode);
  }
  return out;
}
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
    // Group/module instances carry a hydrated subgraph + boundary.
    subgraph?: { nodes: unknown[]; edges: unknown[] };
    groupInputs?: unknown[];
    groupOutputs?: unknown[];
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


/**
 * Normalize a built-in EXAMPLE_FLOWS entry (flat { nodes, edges }) into the same
 * `FlowData` shape the runner gets back from `/api/flows/:id` (which nests the
 * graph under `jsonContent`). Examples are ephemeral: no owner, not editable,
 * and carry no backend id — they're identified by their `example-*` id.
 *
 * Example `input` nodes store their widget config INLINE on `data`
 * (dataType / widgetType / min / max / step / options) rather than under
 * `data.config`. We project those into `config` so the existing input renderer
 * + `getInputDefault` pick them up unchanged.
 */
function exampleToFlowData(example: (typeof EXAMPLE_FLOWS)[number]): FlowData {
  const nodes = (example.nodes as unknown as FlowNode[]).map((node) => {
    if (node.type !== 'input') return node;
    const d = node.data as Record<string, unknown>;
    const config: Record<string, unknown> = { ...(node.data.config ?? {}) };
    for (const key of ['min', 'max', 'step', 'options', 'description', 'default']) {
      if (d[key] !== undefined && config[key] === undefined) config[key] = d[key];
    }
    return { ...node, data: { ...node.data, config } };
  });
  return {
    id: example.id,
    name: example.name,
    version: example.version,
    visibility: 'public',
    metadata: example.metadata as { description?: string } | undefined,
    jsonContent: {
      nodes,
      edges: example.edges as FlowData['jsonContent']['edges'],
    },
    canEdit: false,
    owner: null,
  };
}

function getInputDefault(node: FlowNode): unknown {
  return inputDefault(node);
}


interface FlowRunnerProps {
  /** Chromeless embed mode: no Navbar / Edit link, suitable for an <iframe>. */
  embed?: boolean;
}

export function FlowRunner({ embed = false }: FlowRunnerProps = {}) {
  const { flowId: urlFlowId } = useParams();
  const [searchParams] = useSearchParams();
  const exampleId = searchParams.get('example');
  const officialTool = searchParams.get('tool');
  const { executeScript, workerClient, getData } = useLocalExecutor();
  const { isAuthenticated } = useAuth();
  const [historyError,setHistoryError] = useState('');
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [outputs, setOutputs] = useState<Record<string, unknown>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [debug, setDebug] = useState(false);
  const [exampleInputName, setExampleInputName] = useState('');
  const [trace, setTrace] = useState<Record<string, any>>({});
  const runningRef = useRef(false);
  const runEpochRef = useRef(0);
  const queuedRef = useRef(false);
  const runLatestRef = useRef<() => void>(() => {});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputsReadyRef = useRef(false);
  // Cache node outputs between runs to skip unchanged nodes

  // ── Embed context injection ─────────────────────────────────────────────
  // Start from the URL-param fallback (always available). postMessage from an
  // allowed parent origin (see embedContext) overrides it. `user`/`permissions`
  // are UNTRUSTED display hints — never gate data access on them client-side.
  const [embedCtx, setEmbedCtx] = useState<EmbedContext>(() =>
    embed ? parseContextFromQuery(searchParams) : {}
  );
  const embedCtxRef = useRef(embedCtx);
  embedCtxRef.current = embedCtx;

  useEffect(() => {
    if (!embed) return;
    // Handshake: tell the parent we're ready to receive context.
    try {
      window.parent?.postMessage({ type: EMBED_READY }, '*');
    } catch {
      /* cross-origin parent without a listener — ignore */
    }
    const onMessage = (event: MessageEvent) => {
      const ctx = parseContextMessage(event);
      if (ctx) setEmbedCtx((prev) => ({ ...prev, ...ctx }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embed]);

  // Examples are resolved synchronously; only hit the API for real flow ids.
  const example = useMemo(() => {
    const id = exampleId ?? (urlFlowId?.startsWith('example-') ? urlFlowId : null);
    return id ? EXAMPLE_FLOWS.find((f) => f.id === id) ?? null : null;
  }, [exampleId, urlFlowId]);

  const apiFlowId = example ? null : officialTool ?? urlFlowId ?? null;

  const { data: apiData, isLoading: isApiLoading } = useQuery<FlowData>({
    queryKey: ['flow-run', apiFlowId, officialTool],
    queryFn: async () => {
      const res = await fetch(officialTool ? `${SERVER_URL}/api/tools/definitions/${encodeURIComponent(officialTool)}` : `${SERVER_URL}/api/flows/${apiFlowId}?published=1`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to load tool');
      if (officialTool) return exampleToFlowData(json.graph);
      if (!json.success) throw new Error(json.error);
      return json.flow as FlowData;
    },
    enabled: !!apiFlowId,
  });

  const data = useMemo<FlowData | undefined>(
    () => (example ? exampleToFlowData(example) : apiData),
    [example, apiData]
  );
  const isLoading = !example && isApiLoading;
  // The id used for file caching: examples share their stable example id.
  const flowId = example ? example.id : officialTool ?? urlFlowId;

  const history = useQuery({queryKey:['tool-history',flowId],queryFn:()=>toolApi<{runs:{id:string;input:Record<string,unknown>;created_at:string}[]}>(`tools/runs?tool=${encodeURIComponent(flowId!)}`),enabled:!!flowId && !example && isAuthenticated});
  const { inputNodes, edges } = useMemo(() => {
    if (!data?.jsonContent) return { inputNodes: [], edges: [] };
    const nodes = data.jsonContent.nodes;
    // Form nodes expand into one synthetic `input` per field so the run panel
    // lists each field. (The fold path stays on RAW nodes/edges below; compileFlow
    // expands forms itself.) Synthetic inputs carry inline widget config, so we
    // project it into `config` the same way exampleToFlowData does.
    const expandedInputs = (getToolInputContract({ nodes, edges: data.jsonContent.edges }).nodes as unknown as FlowNode[])
      .map((node) => {
        const d = node.data as Record<string, unknown>;
        if (d.config || ['min', 'max', 'step', 'options'].every((k) => d[k] === undefined)) return node;
        const config: Record<string, unknown> = { ...(node.data.config ?? {}) };
        for (const key of ['min', 'max', 'step', 'options', 'description', 'default']) {
          if (d[key] !== undefined && config[key] === undefined) config[key] = d[key];
        }
        return { ...node, data: { ...node.data, config } };
      });
    return {
      inputNodes: expandedInputs,
      edges: data.jsonContent.edges,
    };
  }, [data]);

  const hasExecutable = (data?.jsonContent?.nodes ?? []).some(n => !['frame', 'comment'].includes(n.type));

  // Clear node output cache when flow definition changes (code updates, etc.)
  useEffect(() => {
    setOutputs({}); setError(null);
    runEpochRef.current++;
    queuedRef.current = false;
    if (runningRef.current) void workerClient.cancelExecution();
    runningRef.current = false; setIsRunning(false);
  }, [data, workerClient]);

  useEffect(() => () => {
    runEpochRef.current++;
    queuedRef.current = false;
    void workerClient.resetSession();
    runningRef.current = false;
  }, [workerClient]);

  // Initialize default inputs + restore cached files
  useEffect(() => {
    if (inputNodes.length === 0) return;

    let disposed = false;
    const init = async () => {
      const defaults: Record<string, unknown> = {};
      for (const n of inputNodes) {
        const label = inputName(n);
        if (inputFieldType(n).kind === 'file' && flowId) {
          const cached = await getCachedFile(flowId, label);
          if (cached) {
            defaults[label] = cached;
            continue;
          }
        }
        defaults[label] = getInputDefault(n);
      }
      if (!disposed) setInputs(defaults);
    };

    init();
    return () => { disposed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputNodes, flowId]);

  // Auto-bind embed context → inputs by matching name (PART 3a). Runs whenever
  // context arrives (postMessage may land after the initial defaults). Only
  // overrides inputs whose label matches a context key; everything else is left
  // as the user set it.
  useEffect(() => {
    if (!embed || inputNodes.length === 0) return;
    const keys = Object.keys(embedCtx);
    if (keys.length === 0) return;
    const names = inputNodes.map((n) => inputName(n));
    setInputs((prev) => prefillInputsFromContext(prev, embedCtx, names));
  }, [embed, embedCtx, inputNodes]);

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

  const handleRun = async (resumeAt?: string) => {
    if (runningRef.current) { queuedRef.current = true; return; }
    if (!hasExecutable) {
      setError('This tool has no executable graph.');
      return;
    }

    runningRef.current = true;
    const epoch = ++runEpochRef.current;
    setIsRunning(true);
    setError(null);
    if (!resumeAt) setTrace({});
    const start = performance.now();

    try {
      if (!resumeAt) await workerClient.resetSession();
      if (epoch !== runEpochRef.current) return;
      // Prepare file inputs
      const preparedInputs = { ...inputs };
      for (const [key, val] of Object.entries(preparedInputs)) {
        preparedInputs[key] = await prepareFileInput(val);
      }

      // ── folded fast path: one worker call for the whole graph ────────────
      // Hydrate module-ref group nodes (and legacy code-node moduleRefs) before folding.
      const resolvedNodes = data?.jsonContent ? await resolveModuleNodes(data.jsonContent.nodes) : null;
      if (epoch !== runEpochRef.current) return;
      const resume = resumeAt && resolvedNodes ? resumeTool({ nodes: resolvedNodes, edges } as FlowLike, resumeAt, trace) : null;
      const folded = getFoldedFlowCached(resume?.graph ?? (resolvedNodes ? ({ nodes: resolvedNodes, edges } as FlowLike) : null), debug);
      if (!folded) throw new Error('No graph is available to run.');
      {
        console.log(`[FlowRunner] folded run ${folded.hash}: ${folded.nodeOrder.join(' → ')}`);
        const rawResult = await executeScript(folded.source, resume?.inputs ?? validateToolInputs({ nodes: resolvedNodes, edges }, preparedInputs), { returnHandles: true, timeout: Math.min(300000, ((data?.metadata as any)?.tool?.timeout ?? 60) * 1000) });
        if (!rawResult.success) {
          throw new Error(rawResult.error?.message || 'Tool execution failed');
        }
        if (epoch !== runEpochRef.current || queuedRef.current) return;
        setExecutionTime(performance.now() - start);
        const flat = flattenResult(rawResult);
        if (flat.__trace) { setTrace(prev => ({...prev, ...flat.__trace as object})); setOutputs(resumeAt ? {...outputs,...flat.__outputs as Record<string,unknown>} : flat.__outputs as Record<string,unknown>); const failures = Object.entries(flat.__trace as Record<string,any>).filter(([,v])=>v.status === "error"); if(failures.length)setError(failures.map(([id,v])=>`${id}: ${v.message}`).join("\n")); }
        else setOutputs(flat);
        if (!resumeAt && !example && isAuthenticated && flowId) {
          const recorded=Object.fromEntries(inputNodes.filter(n=>inputFieldType(n).kind!=='file').map(n=>[inputName(n),inputs[inputName(n)]]));
          void toolApi('tools/runs','POST',{tool_id:flowId,input:recorded}).then(()=>{setHistoryError('');void history.refetch();}).catch(()=>setHistoryError('Your result is ready, but this run could not be added to history.'));
        }
        return;
      }

    } catch (err) {
      if (epoch !== runEpochRef.current) return;
      console.error('[FlowRunner] Execution error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setExecutionTime(performance.now() - start);
    } finally {
      if (epoch !== runEpochRef.current) return;
      runningRef.current = false;
      setIsRunning(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        queueMicrotask(() => runLatestRef.current());
      }
    }
  };
  runLatestRef.current = () => void handleRun();

  const setInput = useCallback((key: string, value: unknown) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-run in live mode with debounce
  useEffect(() => {
    if (!liveMode || !inputsReadyRef.current || !hasExecutable) return;

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
      <div className="tools-runner min-h-screen bg-[#0a0a0b]">
        {!embed && <Navbar />}
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="tools-runner min-h-screen bg-[#0a0a0b]">
        {!embed && <Navbar />}
        <div className="flex flex-col items-center justify-center py-32">
          <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
          <p className="text-sm text-neutral-400">Tool not found</p>
        </div>
      </div>
    );
  }

  const visIcon = data.visibility === 'public' ? Globe : data.visibility === 'unlisted' ? Link2 : Lock;
  const VisIcon = visIcon;

  return (
    <div className="tools-runner min-h-screen bg-[#0a0a0b]">
      <div className="relative z-10">
        {!embed && <Navbar />}

        <div className={`tools-rails mx-auto px-6 pb-12 ${embed ? 'pt-3' : 'pt-5'}`}>
          {!embed && <Link to="/" className="mb-3 inline-flex text-xs text-neutral-500 hover:text-white">← All tools</Link>}
          {/* Header */}
          <div className="mb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="w-7 h-7 rounded-lg bg-brand-500/[0.07] border border-brand-500/10 flex items-center justify-center">
                    <Workflow className="w-3.5 h-3.5 text-brand-500/60" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">{data.name}</h1>
                  <span className="text-[10px] font-mono text-neutral-600">v{data.version}</span>
                  <VisIcon className="w-3 h-3 text-neutral-600" />
                  {data.owner && (
                    <span className="ml-1 flex items-center gap-1.5 text-xs text-neutral-500">
                      <span className="text-neutral-600">by</span>
                      <img src={data.owner.avatar} alt="" className="w-4 h-4 rounded" />
                      {data.owner.username}
                    </span>
                  )}
                </div>
                {data.metadata?.description && (
                  <div className="mt-1.5 ml-9 text-sm text-neutral-400 prose prose-sm prose-invert max-w-none prose-p:my-0 prose-a:text-brand-400 prose-code:text-brand-300">
                    <Markdown>{data.metadata.description}</Markdown>
                  </div>
                )}
              </div>
              {!embed && !data.canEdit && !example && !officialTool && <button className="text-sm text-neutral-400" onClick={async()=>{try{const result=await toolApi(`flows/${data.id}/fork`,"POST",{});window.location.assign(`/editor/${result.flow.id}`);}catch(e){setError(String(e));}}}>Remix tool</button>}
              {!embed && (data.canEdit || example || officialTool) && (
                <Link
                  to={officialTool ? `/editor?tool=${encodeURIComponent(officialTool)}` : example ? `/editor?example=${example.id}` : `/editor/${data.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit graph
                </Link>
              )}
            </div>
          </div>

          <div className="tool-workspace">
            {/* Left: Inputs + Run (the run bar pins to the viewport bottom) */}
              <div className="tool-config-panel bg-[#0c0c10] border border-neutral-800/40 rounded-xl">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/30">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-500">Configure</h2>
                  <span className="text-[10px] text-neutral-600">Runs in your browser</span>
                </div>

                <div className="tool-form-body">
                  {(data.metadata as any)?.examples?.length>0 && <select aria-label="Example inputs" className="w-full rounded border border-white/15 bg-neutral-950 px-2 py-1 text-xs text-neutral-300" value={exampleInputName} onChange={e=>{setExampleInputName(e.target.value);const item=(data.metadata as any).examples.find((x:any)=>x.name===e.target.value);if(item)setInputs(prev=>({...prev,...item.inputs}));}}><option value="">Try example inputs…</option>{(data.metadata as any).examples.map((e:any)=><option key={e.name}>{e.name}</option>)}</select>}
                  <GeneratedToolForm nodes={inputNodes} values={inputs} disabled={isRunning} onChange={(name, value) => {
                    setInput(name, value);
                    if (value instanceof File && flowId) void cacheFile(flowId, name, value);
                  }} />
                </div>

                {/* Run controls */}
                <div className="tool-run-bar flex-none px-4 py-3 border-t border-neutral-800/30 space-y-2">
                  {history.data?.runs.length ? <select aria-label="Previous runs" className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-neutral-400" value="" onChange={e=>{const run=history.data.runs.find(r=>r.id===e.target.value);if(run)setInputs(prev=>({...prev,...run.input}));}}><option value="">Restore a previous run…</option>{history.data.runs.map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleString()}</option>)}</select> : null}
                  {historyError && <p className="text-xs text-amber-400">{historyError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRun()}
                      // Code can live INSIDE a group/map (no top-level code node),
                      // so the flow is still runnable — don't gate on codeNodes alone.
                      disabled={isRunning || !hasExecutable}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-semibold text-sm rounded-lg transition-colors"
                    >
                      {isRunning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      {isRunning ? 'Running…' : 'Run tool'}
                    </button>
                    <button
                      onClick={() => setLiveMode(!liveMode)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
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
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                    <label className="flex items-center gap-2 text-neutral-400"><input type="checkbox" checked={debug} disabled={isRunning} onChange={e=>setDebug(e.target.checked)}/> Inspect node timings</label>
                    <button className="flex-none hover:text-white" onClick={()=>setInputs(Object.fromEntries(inputNodes.map(n=>[inputName(n),getInputDefault(n)])))}>Reset inputs</button>
                  </div>
                  {isRunning && (
                    <button className="w-full text-xs py-2 text-neutral-300 border border-white/10" onClick={() => {
                      runEpochRef.current++; queuedRef.current = false; runningRef.current = false;
                      void workerClient.cancelExecution(); setIsRunning(false); setError('Run cancelled.');
                    }}>Cancel run</button>
                  )}
                  {executionTime !== null && (
                    <div className="flex items-center justify-center gap-1 text-[10px] font-mono text-neutral-600">
                      <Clock className="w-2.5 h-2.5" />
                      {executionTime.toFixed(0)}ms
                      {liveMode && <span className="text-amber-500/50 ml-1">auto</span>}
                    </div>
                  )}
                </div>
              </div>

            {/* Right: Outputs */}
            <div className="tool-preview-column min-w-0">
              <div className="bg-[#0c0c10] border border-neutral-800/40 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-neutral-800/30">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-500">Result</h2>
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
                    <div className="tool-preview-empty flex flex-col items-center justify-center text-neutral-600">
                      <Workflow className="w-8 h-8 mb-2" />
                      <p className="mt-2 text-sm text-neutral-400">Your result will appear here</p><p className="mt-2 text-xs">Choose your inputs, then run the tool.</p>
                    </div>
                  )}

                  {Object.entries(outputs).map(([name,value]) => {
                    const viewer = <ToolOutput name={name} value={value} getData={getData} active={!isRunning} preferredFormat={typeof inputs.format === 'string' ? inputs.format : undefined}/>;
                    return /^(metadata|stats|info)$/i.test(name)
                      ? <details key={name} className="my-4 border-t border-white/10 pt-4"><summary className="mb-3 cursor-pointer text-xs text-neutral-400">{name}</summary>{viewer}</details>
                      : <div key={name} className="mb-6"><h3 className="mb-3 text-xs text-neutral-500">{name}</h3>{viewer}</div>;
                  })}
                  {debug && Object.entries(trace).map(([id,entry])=><details key={id} className="border-t border-white/10 py-3 text-xs text-neutral-400"><summary className="cursor-pointer">{data.jsonContent.nodes.find(n=>n.id===id)?.data.label ?? id} · {entry.status} · {entry.ms?.toFixed(1)} ms</summary><pre className="my-3 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(entry.value,null,2)}</pre>{entry.message && <p className="text-red-400">{entry.message}</p>}{data.jsonContent.nodes.some(n=>n.id===id && n.type==='code') && <button disabled={isRunning} className="rounded border border-white/10 px-3 py-2" onClick={()=>handleRun(id)}>Run from here</button>}</details>)}
                </div>
              </div>
            </div>
          </div>
          {!embed && (officialTool || (urlFlowId && !example)) && <ToolComments tool={officialTool ?? urlFlowId!}/>}
        </div>
      </div>
    </div>
  );
}
