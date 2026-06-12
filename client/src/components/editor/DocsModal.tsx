/**
 * DocsModal — searchable API reference for block authors. Content is parsed
 * from the same ambient declarations Monaco uses (nucleation .d.ts + standard
 * providers), so it always matches what actually autocompletes.
 *
 * Open from anywhere: window.dispatchEvent(new CustomEvent('flow:open-docs'))
 * (TopBar Help menu, CodePanel header) or Cmd/Ctrl+Shift+D.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { getApiDocs, searchApiDocs, type ApiGroup } from '../../lib/block/apiDocs';

const SOURCE_BADGE: Record<ApiGroup['source'], { label: string; cls: string }> = {
  nucleation: { label: 'wasm', cls: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20' },
  runtime: { label: 'runtime', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
  types: { label: 'types', cls: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20' },
};

export function DocsModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('flow:open-docs', openHandler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('flow:open-docs', openHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const groups = useMemo(() => (query ? searchApiDocs(query) : getApiDocs()), [query]);
  const active = groups.find((g) => g.name === selected) ?? groups[0];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-[78vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101014] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-fuchsia-500/15">
            <BookOpen className="h-4 w-4 text-fuchsia-400" />
          </div>
          <span className="text-sm font-medium text-white">API Reference</span>
          <div className="relative ml-4 flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search methods, e.g. set_block, noise, upload…"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-fuchsia-500/40"
            />
          </div>
          <span className="hidden text-[10px] text-neutral-600 md:block">⌘⇧D</span>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Group list */}
          <div className="w-56 shrink-0 overflow-y-auto border-r border-white/[0.06] p-2 custom-scrollbar">
            {groups.map((group) => (
              <button
                key={group.name}
                onClick={() => setSelected(group.name)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                  active?.name === group.name
                    ? 'bg-white/[0.07] text-white'
                    : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                }`}
              >
                <span className="truncate font-mono">{group.name}</span>
                <span className="ml-2 text-[10px] text-neutral-600">{group.members.length}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-neutral-600">No matches</div>
            )}
          </div>

          {/* Members */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {active && (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="font-mono text-base text-white">{active.name}</h2>
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] ${SOURCE_BADGE[active.source].cls}`}>
                    {SOURCE_BADGE[active.source].label}
                  </span>
                </div>
                {active.doc && <p className="mb-4 max-w-3xl text-xs leading-relaxed text-neutral-400">{active.doc}</p>}
                <div className="space-y-2">
                  {active.members.map((member, idx) => (
                    <div
                      key={`${member.name}-${idx}`}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <code className="block whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-sky-300">
                        {member.signature}
                      </code>
                      {member.doc && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">{member.doc}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function openDocs() {
  window.dispatchEvent(new CustomEvent('flow:open-docs'));
}
