/**
 * ReviewQueue — admin moderation surface for flows awaiting approval.
 * Lists pending_review flows (oldest first) with Approve / Request changes /
 * Ban actions. Reject + Ban require a note that's shown back to the author.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Ban, Pencil, Loader2, ShieldAlert, Inbox, Workflow, ExternalLink } from 'lucide-react';
import { Navbar } from './layout/Navbar';
import { useAuth } from '../hooks/useAuth';
import { toast } from '../lib/toast';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

interface QueueFlow {
  id: string;
  name: string;
  version: string;
  nodeCount: number;
  edgeCount: number;
  submittedAt?: number;
  owner?: { username?: string; avatar?: string | null } | null;
  tags: { id: string; name: string; color?: string | null }[];
}

type ModAction = 'approve' | 'reject' | 'ban';

export function ReviewQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = !!user?.isAdmin;

  // Per-row note entry for reject/ban.
  const [pending, setPending] = useState<{ id: string; action: Exclude<ModAction, 'approve'> } | null>(null);
  const [note, setNote] = useState('');

  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: ['review-queue'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows/review-queue`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Request failed');
      return json.flows as QueueFlow[];
    },
    enabled: isAdmin,
  });

  const moderate = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: ModAction; notes?: string }) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${id}/moderate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Action failed');
      return json;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast(`Flow ${vars.action === 'approve' ? 'approved & published' : vars.action === 'reject' ? 'sent back to author' : 'banned'}`, 'success');
      setPending(null);
      setNote('');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const submitNote = () => {
    if (!pending || !note.trim()) return;
    moderate.mutate({ id: pending.id, action: pending.action, notes: note.trim() });
  };

  const fmt = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-200">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Review queue</h1>
            <p className="text-xs text-neutral-500">Approve, request changes on, or ban flows awaiting moderation.</p>
          </div>
          {flows.length > 0 && (
            <span className="ml-auto text-xs font-mono px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300">{flows.length} pending</span>
          )}
        </div>

        {authLoading ? (
          <Centered><Loader2 className="w-7 h-7 animate-spin text-neutral-600" /></Centered>
        ) : !isAdmin ? (
          <Centered><ShieldAlert className="w-8 h-8 text-neutral-700" /><span className="text-sm text-neutral-400">Admins only</span></Centered>
        ) : isLoading ? (
          <Centered><Loader2 className="w-7 h-7 animate-spin text-amber-500/50" /><span className="text-sm text-neutral-500">Loading queue…</span></Centered>
        ) : error ? (
          <Centered><ShieldAlert className="w-7 h-7 text-red-400" /><span className="text-sm text-red-400">Couldn't load the queue</span></Centered>
        ) : flows.length === 0 ? (
          <Centered>
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800/60 flex items-center justify-center"><Inbox className="w-7 h-7 text-neutral-700" /></div>
            <span className="text-sm text-neutral-400">Queue is empty</span>
            <span className="text-xs text-neutral-600">Nothing is waiting for review. Nice.</span>
          </Centered>
        ) : (
          <div className="space-y-2.5">
            {flows.map((flow) => {
              const noting = pending?.id === flow.id;
              return (
                <div key={flow.id} className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-brand-500/[0.07] border border-brand-500/10 flex items-center justify-center">
                      <Workflow className="w-4 h-4 text-brand-500/60" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-white truncate">{flow.name}</h3>
                        <span className="text-[10px] font-mono text-neutral-600">v{flow.version}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                        {flow.owner?.username && (
                          <span className="flex items-center gap-1.5">
                            {flow.owner.avatar && <img src={flow.owner.avatar} alt="" className="w-3.5 h-3.5 rounded-sm" />}
                            {flow.owner.username}
                          </span>
                        )}
                        <span>{flow.nodeCount} nodes · {flow.edgeCount} edges</span>
                        {flow.submittedAt && <span>submitted {fmt(flow.submittedAt)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/editor/${flow.id}`)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1.5 text-[11px] font-medium text-neutral-300 hover:bg-white/5 hover:text-white transition-colors shrink-0"
                      title="Open in editor to inspect"
                    >
                      <ExternalLink className="w-3 h-3" /> Inspect
                    </button>
                  </div>

                  {noting ? (
                    <div className="mt-3">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        autoFocus
                        rows={2}
                        placeholder={pending?.action === 'ban' ? 'Reason for ban (shown to author)…' : 'What needs changing? (shown to author)…'}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-brand-500/50 transition-colors resize-none"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={submitNote}
                          disabled={!note.trim() || moderate.isPending}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${pending?.action === 'ban' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                        >
                          {moderate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pending?.action === 'ban' ? <Ban className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                          {pending?.action === 'ban' ? 'Confirm ban' : 'Send back'}
                        </button>
                        <button onClick={() => { setPending(null); setNote(''); }} className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-white/5 hover:text-white transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => moderate.mutate({ id: flow.id, action: 'approve' })}
                        disabled={moderate.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve & publish
                      </button>
                      <button
                        onClick={() => { setPending({ id: flow.id, action: 'reject' }); setNote(''); }}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-600/20 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Request changes
                      </button>
                      <button
                        onClick={() => { setPending({ id: flow.id, action: 'ban' }); setNote(''); }}
                        className="flex items-center gap-1.5 rounded-lg border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-400/80 hover:bg-red-500/10 transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" /> Ban
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">{children}</div>;
}
