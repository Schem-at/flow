import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe, Lock, Link2, Loader2, Check, Clock, GitFork,
  Send, ShieldCheck, ShieldX, Ban, RotateCcw, Eye, Zap, X, Search, Tag
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import { TagTreeSelector } from '../ui/TagTreeSelector';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface TagItem {
  id: string;
  name: string;
  color?: string | null;
}

interface FlowMeta {
  id: string;
  name: string;
  version: string;
  visibility: 'public' | 'private' | 'unlisted';
  status: string;
  isForked: boolean;
  canEdit: boolean;
  canModerate: boolean;
  metadata?: {
    description?: string;
    [key: string]: unknown;
  };
  stats: { views: number; forks: number; stars: number; runs: number; versions: number };
  forkedFrom?: { id: string; name: string; owner?: { username: string } | null } | null;
  tags: TagItem[];
}

interface FlowVersionItem {
  id: string;
  versionNumber: string;
  changeNote: string | null;
  isLatest: boolean;
  createdAt: number;
  creator?: { username: string; avatar: string } | null;
}

const visibilityOptions = [
  { value: 'private', label: 'Private', desc: 'Only you can see this', Icon: Lock, color: 'text-neutral-400' },
  { value: 'unlisted', label: 'Unlisted', desc: 'Anyone with the link', Icon: Link2, color: 'text-cyan-400' },
  { value: 'public', label: 'Public', desc: 'Listed for everyone', Icon: Globe, color: 'text-green-400' },
] as const;

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'text-neutral-400 bg-neutral-500/10 border-neutral-700/30' },
  pending_review: { label: 'Pending Review', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  published: { label: 'Published', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  rejected: { label: 'Rejected', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  banned: { label: 'Banned', color: 'text-red-400 bg-red-500/15 border-red-500/25' },
};

interface FlowSettingsProps {
  onClose: () => void;
}

export function FlowSettings({ onClose }: FlowSettingsProps) {
  const { flowId, flowName, setFlowName } = useFlowStore();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'settings' | 'versions'>('settings');

  const [name, setName] = useState(flowName);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<string>('private');
  const [version, setVersion] = useState('1.0.0');
  const [saved, setSaved] = useState(false);
  const [selectedTags, setSelectedTags] = useState<TagItem[]>([]);

  const { data, isLoading } = useQuery<FlowMeta>({
    queryKey: ['flow-meta', flowId],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow as FlowMeta;
    },
    enabled: !!flowId,
  });

  const { data: versions } = useQuery<FlowVersionItem[]>({
    queryKey: ['flow-versions', flowId],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}/versions`, { credentials: 'include' });
      const json = await res.json();
      return json.versions || [];
    },
    enabled: !!flowId && tab === 'versions',
  });

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.metadata?.description || '');
      setVisibility(data.visibility);
      setVersion(data.version);
      setSelectedTags(data.tags || []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, version, visibility, tags: selectedTags.map(t => t.id), metadata: { ...(data?.metadata || {}), description } }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow;
    },
    onSuccess: () => {
      setFlowName(name);
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['flow-meta', flowId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ action, notes }: { action: string; notes?: string }) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-meta', flowId] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${flowId}/versions/${versionId}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-meta', flowId] });
      queryClient.invalidateQueries({ queryKey: ['flow-versions', flowId] });
      queryClient.invalidateQueries({ queryKey: ['flow', flowId] });
    },
  });

  if (!flowId) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-neutral-500">Save your flow first to edit its settings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
      </div>
    );
  }

  const canEdit = data?.canEdit !== false;
  const origTagIds = (data?.tags || []).map(t => t.id).sort().join(',');
  const currTagIds = selectedTags.map(t => t.id).sort().join(',');
  const hasChanges = data ? (
    name !== data.name || description !== (data.metadata?.description || '') ||
    visibility !== data.visibility || version !== data.version ||
    origTagIds !== currTagIds
  ) : false;

  const status = statusLabels[data?.status || 'draft'] || statusLabels.draft;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pt-4 pb-2">
        <button
          onClick={() => setTab('settings')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'settings' ? 'bg-white/[0.07] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          Settings
        </button>
        <button
          onClick={() => setTab('versions')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${tab === 'versions' ? 'bg-white/[0.07] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          Versions
          {data?.stats.versions ? (
            <span className="text-[10px] font-mono text-neutral-600">{data.stats.versions}</span>
          ) : null}
        </button>
      </div>

      {tab === 'settings' ? (
        <div className="p-5 pt-2 space-y-5">
          {/* Status & Stats bar */}
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-wider ${status.color}`}>
              {status.label}
            </span>
            {data?.stats && (
              <div className="flex items-center gap-3 text-[10px] font-mono text-neutral-600">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{data.stats.views}</span>
                <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{data.stats.forks}</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{data.stats.runs}</span>
              </div>
            )}
          </div>

          {/* Forked from */}
          {data?.forkedFrom && (
            <div className="flex items-center gap-2 text-xs text-neutral-500 bg-[#0c0c10] border border-neutral-800/40 rounded-lg px-3 py-2">
              <GitFork className="w-3 h-3" />
              Forked from <span className="text-neutral-300">{data.forkedFrom.name}</span>
              {data.forkedFrom.owner && <span>by {data.forkedFrom.owner.username}</span>}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="w-full bg-[#0c0c10] border border-neutral-800/60 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/30 disabled:opacity-50 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">Description</label>
            <MarkdownEditor value={description} onChange={setDescription} placeholder="What does this flow do?" disabled={!canEdit} />
          </div>

          {/* Version */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={!canEdit}
              className="w-full bg-[#0c0c10] border border-neutral-800/60 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-green-500/30 disabled:opacity-50 transition-all"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">Visibility</label>
            <div className="grid grid-cols-3 gap-2">
              {visibilityOptions.map((opt) => {
                const isSelected = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => canEdit && setVisibility(opt.value)}
                    disabled={!canEdit}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-center transition-all ${
                      isSelected ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-neutral-800/40 bg-[#0c0c10] hover:border-neutral-700/60'
                    } disabled:opacity-50`}
                  >
                    <opt.Icon className={`w-4 h-4 ${isSelected ? opt.color : 'text-neutral-600'}`} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-neutral-500'}`}>{opt.label}</span>
                    <span className="text-[9px] text-neutral-600 leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">Tags</label>
            <TagTreeSelector
              selected={selectedTags}
              onChange={setSelectedTags}
              disabled={!canEdit}
            />
          </div>

          {/* Moderation (admin only) */}
          {data?.canModerate && (
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">Moderation</label>
              <div className="flex items-center gap-2">
                {data.status !== 'published' && (
                  <button
                    onClick={() => moderateMutation.mutate({ action: 'approve' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition-colors"
                  >
                    <ShieldCheck className="w-3 h-3" /> Approve
                  </button>
                )}
                {data.status !== 'rejected' && (
                  <button
                    onClick={() => {
                      const notes = prompt('Rejection reason:');
                      if (notes) moderateMutation.mutate({ action: 'reject', notes });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
                  >
                    <ShieldX className="w-3 h-3" /> Reject
                  </button>
                )}
                {data.status !== 'banned' && (
                  <button
                    onClick={() => {
                      const notes = prompt('Ban reason:');
                      if (notes) moderateMutation.mutate({ action: 'ban', notes });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <Ban className="w-3 h-3" /> Ban
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Submit for review (owner, draft) */}
          {canEdit && data?.status === 'draft' && !data?.canModerate && (
            <button
              onClick={() => {
                fetch(`${SERVER_URL}/api/flows/${flowId}/submit-for-review`, { method: 'POST', credentials: 'include' })
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['flow-meta', flowId] });
                    queryClient.invalidateQueries({ queryKey: ['flows'] });
                  });
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> Submit for Review
            </button>
          )}

          {/* Save */}
          {canEdit && (
            <div className="pt-2 flex items-center justify-between">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white transition-colors">Cancel</button>
              <div className="flex items-center gap-2">
                {hasChanges && !saved && (
                  <span className="text-[10px] text-amber-500/70 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Unsaved
                  </span>
                )}
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || (!hasChanges && !saved)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                    saved ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : hasChanges ? 'bg-green-500 hover:bg-green-400 text-black hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                    : 'bg-neutral-800/50 text-neutral-600 cursor-default'
                  }`}
                >
                  {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
                  {saved ? 'Saved' : hasChanges ? 'Save Settings' : 'No changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Versions Tab */
        <div className="p-5 pt-2">
          {!versions?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-600">
              <Clock className="w-6 h-6 mb-2" />
              <p className="text-xs">No version history yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors group">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${v.isLatest ? 'bg-green-500' : 'bg-neutral-700'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-300">v{v.versionNumber}</span>
                      {v.isLatest && <span className="text-[8px] font-mono px-1 py-px rounded bg-green-500/10 text-green-500/70 border border-green-500/15">LATEST</span>}
                    </div>
                    {v.changeNote && <p className="text-[10px] text-neutral-600 truncate mt-0.5">{v.changeNote}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {v.creator && (
                        <div className="flex items-center gap-1">
                          <img src={v.creator.avatar} alt="" className="w-3 h-3 rounded" />
                          <span className="text-[9px] text-neutral-600">{v.creator.username}</span>
                        </div>
                      )}
                      <span className="text-[9px] text-neutral-700">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {canEdit && !v.isLatest && (
                    <button
                      onClick={() => {
                        if (confirm('Restore this version? Current state will be saved as a new version first.')) {
                          restoreMutation.mutate(v.id);
                        }
                      }}
                      className="p-1.5 rounded text-neutral-700 hover:text-white hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                      title="Restore this version"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
