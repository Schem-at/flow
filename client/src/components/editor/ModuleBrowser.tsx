/**
 * ModuleBrowser — Browse and insert modules from the code library
 * Shown as a tab in the editor Toolbar sidebar
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Star, Loader2, Package, Zap,
  GripVertical
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { parseBlockSource } from '../../lib/block/parser';
import { ioToContract } from '../../lib/block/io-compat';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface ModuleItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  isStarred: boolean;
  owner?: { username: string; avatar: string } | null;
  stats: { uses: number; stars: number; forks: number };
  tags: { id: string; name: string; color?: string }[];
}

export function ModuleBrowser() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const { addNode, nodes } = useFlowStore();
  const queryClient = useQueryClient();

  const { data: modules, isLoading } = useQuery<ModuleItem[]>({
    queryKey: ['modules', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (filter === 'starred') params.set('starred', '1');
      params.set('sort', 'popular');
      const res = await fetch(`${SERVER_URL}/api/modules?${params}`, { credentials: 'include' });
      const json = await res.json();
      return (json.modules || []) as ModuleItem[];
    },
    staleTime: 30000,
  });

  const starMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      const res = await fetch(`${SERVER_URL}/api/modules/${moduleId}/star`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  const handleInsertModule = useCallback(async (module: ModuleItem) => {
    // Fetch IO schema + contract from the module. The code is the source of
    // truth (folded sources carry type declarations); legacy modules without
    // parseable types fall back to the stored io schema.
    let io = null;
    let contract = null;
    try {
      const res = await fetch(`${SERVER_URL}/api/modules/${module.id}/resolve`, { credentials: 'include' });
      const json = await res.json();
      if (json.success && json.ioSchema) {
        io = json.ioSchema;
      }
      if (json.success && json.code) {
        try {
          const parsed = await parseBlockSource(json.code);
          if (Object.keys(parsed.contract.inputs).length || Object.keys(parsed.contract.outputs).length) {
            contract = parsed.contract;
          }
        } catch {}
      }
      if (!contract && io) contract = ioToContract(io);
    } catch {}

    const maxX = nodes.reduce((max, n) => Math.max(max, (n.position?.x || 0)), 0);
    const centerY = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + (n.position?.y || 0), 0) / nodes.length
      : 200;

    addNode({
      id: `module-${module.slug}-${Date.now()}`,
      type: 'code',
      position: { x: maxX + 300, y: centerY },
      data: {
        label: module.name,
        code: undefined,
        moduleRef: {
          id: module.id,
          slug: module.slug,
          version: module.version,
          pinned: false,
        },
        io,
        contract,
      },
    });
  }, [addNode, nodes]);

  const handleDragStart = useCallback((event: React.DragEvent, module: ModuleItem) => {
    event.dataTransfer.setData('application/reactflow', 'code');
    event.dataTransfer.setData('application/reactflow-data', JSON.stringify({
      label: module.name,
      code: undefined,
      moduleRef: {
        id: module.id,
        slug: module.slug,
        version: module.version,
        pinned: false,
      },
    }));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules..."
            className="w-full bg-[#0c0c10] border border-neutral-800/40 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-green-500/30 placeholder:text-neutral-700"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-3 pb-2 flex items-center gap-1">
        <button
          onClick={() => setFilter('all')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
            filter === 'all' ? 'bg-white/[0.07] text-white' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('starred')}
          className={`px-2 py-1 text-[10px] font-medium rounded transition-colors flex items-center gap-1 ${
            filter === 'starred' ? 'bg-amber-500/10 text-amber-400' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Star className="w-2.5 h-2.5" /> Starred
        </button>
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 custom-scrollbar">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
          </div>
        )}

        {!isLoading && modules?.length === 0 && (
          <div className="flex flex-col items-center py-8 text-neutral-600">
            <Package className="w-5 h-5 mb-2" />
            <p className="text-[10px]">{search ? 'No matches' : 'No modules yet'}</p>
          </div>
        )}

        {modules?.map((module) => (
          <div
            key={module.id}
            draggable
            onDragStart={(e) => handleDragStart(e, module)}
            onClick={() => handleInsertModule(module)}
            className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition-all"
          >
            <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 shrink-0 mt-0.5">
              <Package className="w-3.5 h-3.5 text-cyan-400" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-neutral-300 group-hover:text-white truncate transition-colors">
                  {module.name}
                </span>
                <span className="text-[9px] font-mono text-neutral-700">v{module.version}</span>
              </div>

              {module.description && (
                <p className="text-[10px] text-neutral-600 truncate leading-tight mt-0.5">
                  {module.description}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                {module.owner && (
                  <div className="flex items-center gap-1">
                    <img src={module.owner.avatar} alt="" className="w-3 h-3 rounded" />
                    <span className="text-[9px] text-neutral-600">{module.owner.username}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[9px] text-neutral-700 font-mono">
                  {module.stats.stars > 0 && (
                    <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5" />{module.stats.stars}</span>
                  )}
                  {module.stats.uses > 0 && (
                    <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{module.stats.uses}</span>
                  )}
                </div>
              </div>

              {(module.tags?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {module.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag.id}
                      className="text-[8px] px-1 py-px rounded bg-white/[0.03] border border-neutral-800/30 text-neutral-600"
                      style={tag.color ? { borderColor: `${tag.color}30`, color: tag.color } : undefined}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  starMutation.mutate(module.id);
                }}
                className={`p-1 rounded transition-colors ${
                  module.isStarred ? 'text-amber-400' : 'text-neutral-700 hover:text-amber-400'
                }`}
              >
                <Star className={`w-3 h-3 ${module.isStarred ? 'fill-current' : ''}`} />
              </button>
              <GripVertical className="w-3 h-3 text-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
