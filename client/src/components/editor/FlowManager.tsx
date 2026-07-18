/**
 * FlowManager — open, create, import and manage flows.
 *
 * Tabbed (My Flows / Examples), searchable, brand-consistent. No native
 * alert()/confirm() — errors go through the toast surface and deletes use an
 * inline confirm. Fixed-height body so the layout never shifts as content
 * loads or panels expand.
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen,
  Plus,
  Trash2,
  Clock,
  FileCode,
  Loader2,
  AlertCircle,
  Upload,
  Play,
  Pencil,
  Search,
  Workflow,
  Boxes,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { Modal } from '../ui/Modal';
import { EXAMPLE_FLOWS } from '../../lib/exampleFlows';
import { toast } from '../../lib/toast';
import { uuid } from '../../lib/uuid';

// Empty string in dev (Vite proxies /api); VITE_SERVER_URL in prod.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface FlowListItem {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt?: number;
}

interface FlowManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'flows' | 'examples';

export function FlowManager({ isOpen, onClose }: FlowManagerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadFlow, clearFlow, flowId } = useFlowStore();

  const [tab, setTab] = useState<Tab>('flows');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ---- data ----------------------------------------------------------------
  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Request failed');
      return json.flows as FlowListItem[];
    },
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, nodes: [], edges: [] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Could not create flow');
      return json.flow;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      setNewName('');
      loadFlow({ id: flow.id, name: flow.name, version: flow.version || '1.0.0', nodes: [], edges: [], createdAt: Date.now() });
      useFlowStore.getState().setFlowId(flow.id);
      useFlowStore.getState().setFlowName(flow.name);
      navigate(`/flow/${flow.id}`);
      onClose();
    },
    onError: (e) => toast(`Could not create flow: ${(e as Error).message}`, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Could not delete flow');
      return id;
    },
    onSuccess: (id) => {
      if (flowId === id) clearFlow();
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast('Flow deleted', 'success');
    },
    onError: (e) => toast(`Could not delete flow: ${(e as Error).message}`, 'error'),
  });

  // ---- import from file ----------------------------------------------------
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const flowData = JSON.parse(e.target?.result as string);
        if (!flowData.nodes || !flowData.edges) throw new Error('missing nodes or edges');

        // Remap ids so an imported flow never collides with the open one.
        const idMap = new Map<string, string>();
        flowData.nodes.forEach((n: { id: string; type?: string }) =>
          idMap.set(n.id, `${n.type || 'node'}-${uuid().slice(0, 8)}`),
        );
        loadFlow({
          ...flowData,
          id: '',
          name: flowData.name || 'Imported Flow',
          version: flowData.version || '1.0.0',
          createdAt: Date.now(),
          nodes: flowData.nodes.map((n: { id: string; [k: string]: unknown }) => ({ ...n, id: idMap.get(n.id) || n.id })),
          edges: flowData.edges.map((edge: { source: string; target: string; [k: string]: unknown }) => ({
            ...edge,
            id: `edge-${uuid().slice(0, 8)}`,
            source: idMap.get(edge.source) || edge.source,
            target: idMap.get(edge.target) || edge.target,
          })),
        });
        useFlowStore.getState().setFlowId(null);
        onClose();
        toast(`Imported "${flowData.name || 'flow'}" — Save to keep it`, 'success');
      } catch (err) {
        toast(`Import failed: ${(err as Error).message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  // ---- derived -------------------------------------------------------------
  const q = search.trim().toLowerCase();
  const filteredFlows = useMemo(
    () => (q ? flows.filter((f) => f.name.toLowerCase().includes(q)) : flows),
    [flows, q],
  );
  const filteredExamples = useMemo(
    () => (q ? EXAMPLE_FLOWS.filter((e) => e.name.toLowerCase().includes(q)) : EXAMPLE_FLOWS),
    [q],
  );

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const openFlow = (id: string, name: string) => {
    useFlowStore.getState().setFlowId(id);
    useFlowStore.getState().setFlowName(name);
    navigate(`/flow/${id}`);
    onClose();
  };

  const goExample = (id: string, mode: 'editor' | 'run') => {
    navigate(`/${mode === 'editor' ? 'editor' : 'run'}?example=${encodeURIComponent(id)}`);
    onClose();
  };

  // ---- ui ------------------------------------------------------------------
  const tabBtn = (id: Tab, label: string, count: number) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        tab === id ? 'bg-brand-500/15 text-brand-300' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
      }`}
    >
      {label}
      <span className={`text-[10px] font-mono px-1.5 py-px rounded ${tab === id ? 'bg-brand-500/20 text-brand-300' : 'bg-neutral-800 text-neutral-500'}`}>
        {count}
      </span>
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Flows" subtitle="Open, create, and manage your flows" icon={<FolderOpen className="w-5 h-5" />} iconColor="text-brand-400" size="lg">
      <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json,.polyflow.json" className="hidden" />

      <div className="flex h-[68vh] max-h-[620px] flex-col">
        {/* Tabs + search */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-neutral-800/60">
          <div className="flex items-center gap-1">
            {tabBtn('flows', 'My Flows', flows.length)}
            {tabBtn('examples', 'Examples', EXAMPLE_FLOWS.length)}
          </div>
          <div className="relative ml-auto w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === 'flows' ? 'flows' : 'examples'}…`}
              className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Create / import row (My Flows only) */}
        {tab === 'flows' && (
          <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-800/40">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate(newName.trim())}
              placeholder="Name a new flow…"
              className="flex-1 bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-brand-500/50 transition-colors"
            />
            <button
              onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
              disabled={!newName.trim() || createMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-300 rounded-lg border border-neutral-800 hover:bg-white/5 hover:text-white transition-colors"
              title="Import a flow from a .json file"
            >
              <Upload className="w-4 h-4" /> Import
            </button>
          </div>
        )}

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
          {tab === 'flows' ? (
            isLoading ? (
              <Centered><Loader2 className="w-7 h-7 animate-spin text-brand-500/50" /><span className="text-sm text-neutral-500">Loading flows…</span></Centered>
            ) : error ? (
              <Centered><AlertCircle className="w-7 h-7 text-red-400" /><span className="text-sm text-red-400">Couldn't load your flows</span><span className="text-xs text-neutral-600">You may need to sign in</span></Centered>
            ) : filteredFlows.length === 0 ? (
              <Centered>
                <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800/60 flex items-center justify-center"><FolderOpen className="w-6 h-6 text-neutral-700" /></div>
                <span className="text-sm text-neutral-400">{q ? 'No matching flows' : 'No flows yet'}</span>
                {!q && <span className="text-xs text-neutral-600">Name one above and hit Create</span>}
              </Centered>
            ) : (
              <div className="space-y-1.5">
                {filteredFlows.map((flow) => {
                  const active = flow.id === flowId;
                  const confirming = confirmDelete === flow.id;
                  return (
                    <div
                      key={flow.id}
                      onClick={() => !confirming && openFlow(flow.id, flow.name)}
                      className={`group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors ${
                        active ? 'bg-brand-500/10 border-brand-500/30' : 'bg-neutral-900/40 border-neutral-800/60 hover:border-neutral-700 hover:bg-neutral-800/40'
                      }`}
                    >
                      <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border ${active ? 'bg-brand-500/15 border-brand-500/20' : 'bg-neutral-800/60 border-neutral-800'}`}>
                        <Workflow className={`w-4 h-4 ${active ? 'text-brand-400' : 'text-neutral-500'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className={`text-sm font-medium truncate ${active ? 'text-brand-300' : 'text-neutral-200 group-hover:text-white'}`}>{flow.name}</h3>
                          {active && <span className="text-[9px] font-medium px-1.5 py-px rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/20">OPEN</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-neutral-600">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(flow.updatedAt || flow.createdAt)}</span>
                          <span className="flex items-center gap-1"><FileCode className="w-3 h-3" />v{flow.version}</span>
                        </div>
                      </div>

                      {confirming ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-neutral-400">Delete?</span>
                          <button onClick={() => deleteMutation.mutate(flow.id)} disabled={deleteMutation.isPending} className="px-2 py-1 text-[11px] font-medium rounded-md bg-red-600/90 text-white hover:bg-red-600 transition-colors">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 text-[11px] font-medium rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors">No</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <IconBtn title="Run as tool" onClick={() => { navigate(`/run/${flow.id}`); onClose(); }}><Play className="w-3.5 h-3.5 text-green-500" /></IconBtn>
                          <IconBtn title="Delete" onClick={() => setConfirmDelete(flow.id)} danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredExamples.length === 0 ? (
            <Centered>
              <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800/60 flex items-center justify-center"><Boxes className="w-6 h-6 text-neutral-700" /></div>
              <span className="text-sm text-neutral-400">No matching examples</span>
            </Centered>
          ) : (
            <div className="space-y-1.5">
              {filteredExamples.map((ex) => (
                <div key={ex.id} className="group flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-900/40 px-3.5 py-2.5 hover:border-neutral-700 hover:bg-neutral-800/40 transition-colors">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-brand-500/[0.07] border border-brand-500/10 flex items-center justify-center">
                    <Boxes className="w-4 h-4 text-brand-500/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-neutral-200 group-hover:text-white truncate">{ex.name}</h3>
                    <div className="text-[11px] text-neutral-600 mt-0.5">{ex.nodes.length} nodes · {ex.edges.length} edges</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => goExample(ex.id, 'run')} className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] font-medium text-neutral-300 hover:bg-white/5 hover:text-white transition-colors" title="Open as a read-only tool">
                      <Play className="w-3 h-3 text-green-500" /> Tool
                    </button>
                    <button onClick={() => goExample(ex.id, 'editor')} className="flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-300 hover:bg-brand-500/20 transition-colors">
                      <Pencil className="w-3 h-3" /> Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">{children}</div>;
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg transition-colors ${danger ? 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}
    >
      {children}
    </button>
  );
}
