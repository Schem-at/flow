import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, MoreVertical, Pencil, Trash2, Copy, Play, GitFork,
  Clock, Workflow, AlertCircle, Loader2, Globe, Lock, Link2, Eye, Shield,
  Terminal, Boxes, Zap, Send
} from 'lucide-react';
import { Navbar } from './layout/Navbar';
import { useAuth } from '../hooks/useAuth';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

interface FlowOwner {
  username: string;
  avatar: string;
}

interface FlowTag {
  id: string;
  name: string;
  color?: string;
}

interface FlowStats {
  views: number;
  forks: number;
  stars: number;
  runs: number;
  versions: number;
}

interface Flow {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt?: number;
  metadata?: {
    nodeCount?: number;
    description?: string;
  };
  visibility: 'public' | 'private' | 'unlisted';
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'banned';
  isOwner: boolean;
  canEdit: boolean;
  canModerate: boolean;
  isForked: boolean;
  owner?: FlowOwner | null;
  stats: FlowStats;
  tags: FlowTag[];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const visibilityLabel: Record<string, string> = {
  public: 'PUB',
  private: 'PRV',
  unlisted: 'UNL',
};

const visibilityCycle: Record<string, string> = {
  private: 'unlisted',
  unlisted: 'public',
  public: 'private',
};

const visibilityColor: Record<string, string> = {
  public: 'text-green-400 bg-green-500/10 border-green-500/20',
  private: 'text-neutral-500 bg-neutral-500/5 border-neutral-700/30',
  unlisted: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
};

export function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'public'>('all');

  const { data, isLoading, error } = useQuery<Flow[]>({
    queryKey: ['flows'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load flows');
      return json.flows as Flow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete flow');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });

  const visibilityMutation = useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: string }) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) throw new Error('Failed to update visibility');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });

  const forkMutation = useMutation({
    mutationFn: async (flow: Flow) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flow.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fork flow');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      if (data.flow?.id) navigate(`/editor/${data.flow.id}`);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (flow: Flow) => {
      const original = await fetch(`${SERVER_URL}/api/flows/${flow.id}`, { credentials: 'include' }).then(r => r.json());
      const res = await fetch(`${SERVER_URL}/api/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: `${flow.name} (copy)`,
          nodes: original.flow?.jsonContent?.nodes || [],
          edges: original.flow?.jsonContent?.edges || [],
        }),
      });
      if (!res.ok) throw new Error('Failed to duplicate flow');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });

  const allFlows = data || [];
  const flows = allFlows
    .filter(f => {
      if (filter === 'mine') return f.isOwner;
      if (filter === 'public') return f.visibility === 'public' && !f.isOwner;
      return true;
    })
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const myCount = allFlows.filter(f => f.isOwner).length;
  const publicCount = allFlows.filter(f => f.visibility === 'public' && !f.isOwner).length;

  return (
    <div className="min-h-screen bg-[#07070a] text-white">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #22c55e 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-5xl mx-auto px-6 pt-8 pb-16">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-green-500/60">
                  Workspace
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Flows
              </h1>
              <p className="text-sm text-neutral-500 mt-1 font-light">
                {allFlows.length} flow{allFlows.length !== 1 ? 's' : ''} in workspace
              </p>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => navigate('/editor')}
                className="group flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 text-black text-xs font-semibold rounded-lg transition-all hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                New Flow
              </button>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                placeholder="Filter by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0c0c10] border border-neutral-800/60 rounded-lg px-4 py-2.5 pl-10 text-sm text-white focus:outline-none focus:border-green-500/30 focus:shadow-[0_0_0_3px_rgba(34,197,94,0.05)] placeholder:text-neutral-700 font-light transition-all"
              />
            </div>
            {isAuthenticated && (
              <div className="flex items-center bg-[#0c0c10] border border-neutral-800/60 rounded-lg p-0.5">
                {([
                  { key: 'all' as const, label: 'All', count: allFlows.length },
                  { key: 'mine' as const, label: 'Mine', count: myCount },
                  { key: 'public' as const, label: 'Community', count: publicCount },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      filter === f.key
                        ? 'bg-white/[0.07] text-white shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {f.label}
                    <span className={`font-mono text-[10px] ${filter === f.key ? 'text-green-400' : 'text-neutral-700'}`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-green-500/5 border border-green-500/10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-600">Loading flows...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500/70" />
              </div>
              <span className="text-xs text-neutral-500">Could not connect to workspace</span>
              <span className="text-[10px] font-mono text-neutral-700">ERR_API_UNREACHABLE</span>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && flows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-2xl bg-[#0c0c10] border border-neutral-800/60 flex items-center justify-center">
                  <Terminal className="w-7 h-7 text-neutral-700" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[#07070a] border border-neutral-800/60 flex items-center justify-center">
                  <Boxes className="w-3 h-3 text-neutral-700" />
                </div>
              </div>
              <p className="text-sm text-neutral-400 mb-1">
                {search ? 'No matches' : filter === 'mine' ? 'No flows yet' : 'Nothing here'}
              </p>
              <p className="text-xs text-neutral-600 mb-6 max-w-[280px] text-center">
                {search
                  ? 'Try adjusting your search terms'
                  : 'Create a visual node graph to generate Minecraft schematics'}
              </p>
              {!search && isAuthenticated && (
                <button
                  onClick={() => navigate('/editor')}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/15 border border-green-500/10 rounded-lg transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create your first flow
                </button>
              )}
            </div>
          )}

          {/* Flow grid */}
          {!isLoading && !error && flows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {flows.map((flow, i) => (
                <div
                  key={flow.id}
                  onClick={() => navigate(`/editor/${flow.id}`)}
                  className="group relative bg-[#0c0c10] border border-neutral-800/40 rounded-xl cursor-pointer hover:border-neutral-700/60 hover:bg-[#0e0e13] transition-all duration-200"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Card top accent line */}
                  <div className={`h-px w-full rounded-t-xl ${
                    flow.visibility === 'public' ? 'bg-gradient-to-r from-transparent via-green-500/20 to-transparent' :
                    flow.visibility === 'unlisted' ? 'bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent' :
                    'bg-transparent'
                  }`} />

                  <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-green-500/[0.07] border border-green-500/10 flex items-center justify-center shrink-0 group-hover:border-green-500/20 group-hover:bg-green-500/10 transition-all">
                          <Workflow className="w-4 h-4 text-green-500/60 group-hover:text-green-400 transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-neutral-200 group-hover:text-white truncate transition-colors">
                            {flow.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-mono text-neutral-600">v{flow.version}</span>
                            {flow.status === 'published' && <span className="text-[8px] font-mono px-1 py-px rounded bg-green-500/10 text-green-500/70 border border-green-500/15">PUB</span>}
                            {flow.status === 'pending_review' && <span className="text-[8px] font-mono px-1 py-px rounded bg-amber-500/10 text-amber-400/70 border border-amber-500/15">REVIEW</span>}
                            {flow.status === 'rejected' && <span className="text-[8px] font-mono px-1 py-px rounded bg-red-500/10 text-red-400/70 border border-red-500/15">REJ</span>}
                            {flow.status === 'banned' && <span className="text-[8px] font-mono px-1 py-px rounded bg-red-500/15 text-red-400 border border-red-500/20">BAN</span>}
                            {flow.isForked && <GitFork className="w-2.5 h-2.5 text-neutral-600" />}
                            {flow.canEdit && !flow.isOwner && <span title="Admin access"><Shield className="w-2.5 h-2.5 text-amber-500/50" /></span>}
                          </div>
                        </div>
                      </div>

                      {/* Context menu */}
                      {flow.canEdit && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(menuOpen === flow.id ? null : flow.id);
                            }}
                            className="p-1.5 -m-1 rounded-lg text-neutral-700 hover:text-neutral-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {menuOpen === flow.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                              <div className="absolute right-0 top-7 z-20 w-40 bg-[#111116] border border-neutral-800/80 rounded-lg shadow-2xl shadow-black/50 py-1 animate-scale-in">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/run/${flow.id}`); setMenuOpen(null); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                                >
                                  <Play className="w-3 h-3 text-green-500" /> Run as tool
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/editor/${flow.id}`); setMenuOpen(null); }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                                >
                                  <Pencil className="w-3 h-3 text-neutral-500" /> Open in editor
                                </button>
                                {isAuthenticated && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); forkMutation.mutate(flow); setMenuOpen(null); }}
                                      className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                                    >
                                      <GitFork className="w-3 h-3 text-neutral-500" /> Fork
                                    </button>
                                    {flow.isOwner && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(flow); setMenuOpen(null); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                                      >
                                        <Copy className="w-3 h-3 text-neutral-500" /> Duplicate
                                      </button>
                                    )}
                                    {flow.isOwner && flow.status === 'draft' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          fetch(`${SERVER_URL}/api/flows/${flow.id}/submit-for-review`, { method: 'POST', credentials: 'include' })
                                            .then(() => queryClient.invalidateQueries({ queryKey: ['flows'] }));
                                          setMenuOpen(null);
                                        }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-neutral-300 hover:bg-white/5 transition-colors"
                                      >
                                        <Send className="w-3 h-3 text-cyan-500" /> Submit for review
                                      </button>
                                    )}
                                  </>
                                )}
                                <div className="border-t border-neutral-800/50 my-1" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Delete this flow permanently?')) deleteMutation.mutate(flow.id);
                                    setMenuOpen(null);
                                  }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-red-400/80 hover:bg-red-500/5 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {flow.metadata?.description && (
                      <p className="text-xs text-neutral-600 line-clamp-2 mb-3 leading-relaxed">
                        {flow.metadata.description}
                      </p>
                    )}

                    {/* Tags */}
                    {flow.tags.length > 0 && (
                      <div className="flex items-center gap-1 mb-3 flex-wrap">
                        {flow.tags.slice(0, 4).map(tag => (
                          <span
                            key={tag.id}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-neutral-800/40 text-neutral-500"
                            style={tag.color ? { borderColor: `${tag.color}30`, color: tag.color } : undefined}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {flow.tags.length > 4 && (
                          <span className="text-[9px] text-neutral-700">+{flow.tags.length - 4}</span>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-neutral-800/30">
                      <div className="flex items-center gap-2">
                        {/* Visibility badge */}
                        {flow.canEdit ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = visibilityCycle[flow.visibility] || 'private';
                              visibilityMutation.mutate({ id: flow.id, visibility: next });
                            }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase tracking-wider transition-all hover:brightness-125 ${visibilityColor[flow.visibility]}`}
                          >
                            {flow.visibility === 'public' && <Globe className="w-2.5 h-2.5" />}
                            {flow.visibility === 'private' && <Lock className="w-2.5 h-2.5" />}
                            {flow.visibility === 'unlisted' && <Link2 className="w-2.5 h-2.5" />}
                            {visibilityLabel[flow.visibility]}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] font-mono text-neutral-600 uppercase tracking-wider">
                            <Eye className="w-2.5 h-2.5" /> View
                          </span>
                        )}

                        {/* Owner */}
                        {flow.owner && !flow.isOwner && (
                          <div className="flex items-center gap-1">
                            <img src={flow.owner.avatar} alt="" className="w-4 h-4 rounded" />
                            <span className="text-[10px] text-neutral-600">{flow.owner.username}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-neutral-700 font-mono">
                        {flow.stats.forks > 0 && (
                          <span className="flex items-center gap-0.5"><GitFork className="w-2.5 h-2.5" />{flow.stats.forks}</span>
                        )}
                        {flow.stats.runs > 0 && (
                          <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{flow.stats.runs}</span>
                        )}
                        {flow.stats.views > 0 && (
                          <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{flow.stats.views}</span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {timeAgo(flow.updatedAt || flow.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* New flow ghost card */}
              {isAuthenticated && (
                <button
                  onClick={() => navigate('/editor')}
                  className="group border border-dashed border-neutral-800/40 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] hover:border-green-500/20 hover:bg-green-500/[0.02] transition-all duration-200 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg border border-dashed border-neutral-700/50 flex items-center justify-center group-hover:border-green-500/30 transition-colors">
                    <Plus className="w-4 h-4 text-neutral-700 group-hover:text-green-500/70 transition-colors" />
                  </div>
                  <span className="text-xs text-neutral-700 group-hover:text-neutral-500 transition-colors">New flow</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
