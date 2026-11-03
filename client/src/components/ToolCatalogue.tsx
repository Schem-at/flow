import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search, Star, Workflow } from 'lucide-react';
import { Navbar } from './layout/Navbar';
import { toolApi } from '../lib/toolApi';
interface Tool {
  id: string; name: string; description: string; official: boolean; version: string;
  tags: { id: string; name: string }[]; runUrl: string; editorUrl: string;
  owner: string; remixedFrom: string | null; favourites: number; favourited: boolean;
}
export function ToolCatalogue() {
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [filter, setFilter] = useState<'all' | 'community' | 'favourites'>('all');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['tool-catalogue'], queryFn: () => toolApi<{ tools: Tool[] }>('tools/catalogue') });
  const tags = useMemo(() => [...new Map(query.data?.tools.flatMap(t => t.tags).map(t => [t.id, t]) ?? []).values()].sort((a, b) => a.name.localeCompare(b.name)), [query.data]);
  const tools = query.data?.tools.filter(t => (filter !== 'community' || !t.official) && (filter !== 'favourites' || t.favourited) && (!tag || t.tags.some(x => x.id === tag)) && `${t.name} ${t.description} ${t.owner ?? ''} ${t.tags.map(x => x.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <div className="tools-catalogue min-h-screen bg-[#0a0a0b] text-neutral-200">
    <Navbar/>
    <main className="tools-rails mx-auto min-h-[calc(100vh-3.5rem)] px-5 pb-16 sm:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 py-12 sm:py-16">
        <div><p className="tools-eyebrow mb-4">The builder’s workbench</p><h1 className="tools-heading">Tools for your next build.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-neutral-400">Turn images into blocks. Shape terrain. Test a circuit.<br className="hidden sm:block"/>Open a tool, make it yours, and build something new.</p></div>
        <Link to="/mine" className="tool-secondary-action">My tools <ArrowUpRight size={14}/></Link>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-white/10 py-4">
        <div className="flex gap-1" aria-label="Tool collection">{(['all','community','favourites'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`px-3 py-2 text-xs transition-colors ${filter === value ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}>{value === 'all' ? 'All tools' : value === 'community' ? 'Community' : 'Favourites'}</button>)}</div>
        <div className="flex min-w-0 flex-wrap gap-3"><label className="flex items-center gap-2 border border-white/10 bg-white/[.02] px-3 text-neutral-500"><Search size={14}/><input aria-label="Search tools" placeholder="Find a tool…" className="min-w-0 bg-transparent py-2 text-sm text-neutral-200 outline-none" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Filter by tag" className="border border-white/10 bg-neutral-950 px-3 py-2 text-xs text-neutral-400" value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>
      {(query.error || error) && <p role="alert" className="my-5 text-sm text-red-400">{error || String(query.error)} <button onClick={() => { setError(''); void query.refetch(); }} className="underline">Try again</button></p>}
      {query.isLoading ? <p role="status" className="py-12 text-sm text-neutral-500">Loading tools…</p> : <p className="py-5 font-mono text-[10px] uppercase tracking-wider text-neutral-600">{tools.length} tools · Runs in your browser</p>}
      <div className="grid border-l border-t border-white/10 md:grid-cols-2 xl:grid-cols-3">
        {tools.map(t => <article key={t.id} className="group flex min-w-0 flex-col border-b border-r border-white/10 bg-white/[.01] p-6 transition-colors hover:bg-white/[.035]">
          <div className="mb-6 flex items-center justify-between"><Workflow size={22} strokeWidth={1} className="text-neutral-500 group-hover:text-brand-400"/><button aria-label={`${t.favourited ? 'Unfavourite' : 'Favourite'} ${t.name}`} aria-pressed={t.favourited} className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-300" onClick={async () => { try { await toolApi(`tools/${t.id}/favourite`, 'POST'); await cache.invalidateQueries({ queryKey: ['tool-catalogue'] }); } catch (e) { setError(String(e)); } }}><Star size={14} className={t.favourited ? 'fill-brand-400 text-brand-400' : ''}/>{t.favourites > 0 && t.favourites}</button></div>
          <a href={t.runUrl} className="flex items-center justify-between gap-3 text-lg font-semibold tracking-tight text-neutral-100 hover:text-brand-300">{t.name}<ArrowUpRight size={16} className="shrink-0 text-neutral-600"/></a>
          <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-neutral-500">{t.description}</p>
          {!!t.tags.length && <div className="mb-5 flex flex-wrap gap-2">{t.tags.map(x => <button key={x.id} onClick={() => setTag(x.id)} className="text-[11px] text-neutral-500 hover:text-neutral-200">#{x.name}</button>)}</div>}
          {t.remixedFrom && <a href={`/run/${t.remixedFrom}`} className="mb-3 text-xs text-neutral-500 hover:text-white">View original tool ↗</a>}
          <footer className="flex items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px]"><span className="truncate text-neutral-600">{t.official ? 'Schemat.io' : t.owner || 'Community'} · v{t.version}</span><a href={t.editorUrl} className="shrink-0 text-neutral-400 hover:text-white">View graph ↗</a></footer>
        </article>)}
      </div>
      {!query.isLoading && !query.error && !tools.length && <div className="py-16 text-center"><p className="text-sm text-neutral-400">No tools match these filters.</p><button className="mt-4 text-xs text-neutral-300 underline" onClick={() => { setSearch(''); setTag(''); setFilter('all'); }}>Clear filters</button></div>}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-y border-white/10 py-6"><div><p className="text-sm text-neutral-200">Every tool starts with a graph.</p><p className="mt-1 text-xs text-neutral-500">Open one to see how it works, then remix it into your own.</p></div><Link to="/editor" className="tool-secondary-action">Open editor <ArrowUpRight size={14}/></Link></div>
    </main>
  </div>;
}
