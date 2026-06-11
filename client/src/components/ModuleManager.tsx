import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Package, Star, GitFork, Eye, Zap, Trash2, Pencil,
  MoreVertical, Loader2, AlertCircle, Globe, Lock, Link2, Send,
  Plus, Clock
} from 'lucide-react';
import { Navbar } from './layout/Navbar';
import { useAuth } from '../hooks/useAuth';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

interface Module {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  visibility: string;
  status: string;
  isOwner: boolean;
  canEdit: boolean;
  isStarred: boolean;
  isForked: boolean;
  owner?: { username: string; avatar: string } | null;
  stats: { views: number; uses: number; stars: number; forks: number; versions: number };
  tags: { id: string; name: string; color?: string }[];
  createdAt: number;
  updatedAt?: number;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString();
}

export function ModuleManager() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'starred'>('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const { data: modules, isLoading, error } = useQuery<Module[]>({
    queryKey: ['modules-manage', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filter === 'starred') params.set('starred', '1');
      const res = await fetch(`${SERVER_URL}/api/modules?${params}`, { credentials: 'include' });
      const json = await res.json();
      return (json.modules || []) as Module[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${SERVER_URL}/api/modules/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modules-manage'] }),
  });

  const starMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${SERVER_URL}/api/modules/${id}/star`, { method: 'POST', credentials: 'include' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modules-manage'] }),
  });

  const filtered = (modules || []).filter(m => {
    if (filter === 'mine') return m.isOwner;
    if (filter === 'starred') return m.isStarred;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#07070a]">
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #06b6d4 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}
      />
      <div className="relative z-10">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 pt-8 pb-16">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-500/60">Library</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Modules</h1>
              <p className="text-sm text-neutral-500 mt-1 font-light">
                Reusable code blocks for your flows
              </p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search modules..."
                className="w-full bg-[#0c0c10] border border-neutral-800/60 rounded-lg px-4 py-2.5 pl-10 text-sm text-white focus:outline-none focus:border-cyan-500/30 placeholder:text-neutral-700 font-light transition-all"
              />
            </div>
            {isAuthenticated && (
              <div className="flex items-center bg-[#0c0c10] border border-neutral-800/60 rounded-lg p-0.5">
                {([
                  { key: 'all' as const, label: 'All' },
                  { key: 'mine' as const, label: 'Mine' },
                  { key: 'starred' as const, label: 'Starred', icon: Star },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                      filter === f.key ? 'bg-white/[0.07] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {f.icon && <f.icon className="w-3 h-3" />}
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLoading && (
            <div className="flex justify-center py-24"><Loader2 className="w-5 h-5 text-cyan-500 animate-spin" /></div>
          )}
          {error && (
            <div className="flex flex-col items-center py-24"><AlertCircle className="w-5 h-5 text-red-500 mb-2" /><p className="text-xs text-neutral-500">Failed to load modules</p></div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center py-24">
              <Package className="w-8 h-8 text-neutral-700 mb-3" />
              <p className="text-sm text-neutral-400 mb-1">{search ? 'No matches' : 'No modules yet'}</p>
              <p className="text-xs text-neutral-600 mb-4">Extract code from any flow node to create a module</p>
            </div>
          )}

          {!isLoading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(mod => (
                <div key={mod.id} className="group bg-[#0c0c10] border border-neutral-800/40 rounded-xl hover:border-neutral-700/60 transition-all">
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent rounded-t-xl" />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/[0.07] border border-cyan-500/10 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-cyan-500/60" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-neutral-200 truncate">{mod.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono text-neutral-600">v{mod.version}</span>
                            {mod.status === 'published' && <span className="text-[8px] font-mono px-1 py-px rounded bg-green-500/10 text-green-500/70 border border-green-500/15">PUB</span>}
                            {mod.status === 'draft' && <span className="text-[8px] font-mono px-1 py-px rounded bg-neutral-500/10 text-neutral-500/70 border border-neutral-700/30">DRAFT</span>}
                            {mod.isForked && <GitFork className="w-2.5 h-2.5 text-neutral-600" />}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => starMutation.mutate(mod.id)}
                          className={`p-1 rounded transition-colors ${mod.isStarred ? 'text-amber-400' : 'text-neutral-700 hover:text-amber-400'}`}
                        >
                          <Star className={`w-3.5 h-3.5 ${mod.isStarred ? 'fill-current' : ''}`} />
                        </button>

                        {mod.canEdit && (
                          <div className="relative">
                            <button
                              onClick={() => setMenuOpen(menuOpen === mod.id ? null : mod.id)}
                              className="p-1 rounded text-neutral-700 hover:text-neutral-400 hover:bg-white/5 transition-all"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {menuOpen === mod.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                                <div className="absolute right-0 top-7 z-20 w-36 bg-[#111116] border border-neutral-800/80 rounded-lg shadow-2xl py-1 animate-scale-in">
                                  <div className="border-t border-neutral-800/50 my-1" />
                                  <button
                                    onClick={() => { if (confirm('Delete this module?')) deleteMutation.mutate(mod.id); setMenuOpen(null); }}
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
                    </div>

                    {mod.description && (
                      <p className="text-xs text-neutral-600 line-clamp-2 mb-3 leading-relaxed">{mod.description}</p>
                    )}

                    {mod.tags.length > 0 && (
                      <div className="flex gap-1 mb-3 flex-wrap">
                        {mod.tags.slice(0, 3).map(t => (
                          <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-neutral-800/40 text-neutral-500"
                            style={t.color ? { borderColor: `${t.color}30`, color: t.color } : undefined}
                          >{t.name}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-neutral-800/30">
                      {mod.owner && (
                        <div className="flex items-center gap-1">
                          <img src={mod.owner.avatar} alt="" className="w-4 h-4 rounded" />
                          <span className="text-[10px] text-neutral-600">{mod.owner.username}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-neutral-700 font-mono">
                        {mod.stats.stars > 0 && <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5" />{mod.stats.stars}</span>}
                        {mod.stats.uses > 0 && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{mod.stats.uses}</span>}
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{timeAgo(mod.updatedAt || mod.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
