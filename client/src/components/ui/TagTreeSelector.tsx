/**
 * TagTreeSelector — Hierarchical tag tree with expand/collapse and checkboxes
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Loader2, Tag, Search } from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface TagNode {
  id: string;
  name: string;
  color?: string | null;
  children: TagNode[];
  community?: boolean;
  selectable?: boolean;
}

interface SelectedTag {
  id: string;
  name: string;
  color?: string | null;
}

interface TagTreeSelectorProps {
  selected: SelectedTag[];
  onChange: (tags: SelectedTag[]) => void;
  disabled?: boolean;
}

function TagTreeItem({
  tag,
  depth,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelect,
  searchTerm,
}: {
  tag: TagNode;
  depth: number;
  selected: Set<string>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (tag: TagNode) => void;
  searchTerm: string;
}) {
  const isSelected = selected.has(tag.id);
  const isExpanded = expanded.has(tag.id);
  const hasChildren = tag.children.length > 0;

  // Filter by search — show if this tag or any descendant matches
  const matchesSelf = !searchTerm || tag.name.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesDescendant = tag.children.some(function check(c): boolean {
    if (c.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
    return c.children.some(check);
  });

  if (searchTerm && !matchesSelf && !matchesDescendant) return null;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-1 px-1 rounded transition-colors cursor-pointer hover:bg-white/[0.04] ${
          isSelected ? 'bg-green-500/[0.05]' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(tag.id); }}
            className="p-0.5 text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <div className="w-4" />
        )}

        {/* Checkbox + label */}
        <button
          onClick={() => onToggleSelect(tag)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
            isSelected
              ? 'bg-green-500 border-green-500'
              : 'border-neutral-700 hover:border-neutral-500'
          }`}>
            {isSelected && (
              <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>

          {tag.color && (
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
          )}

          <span className={`text-[11px] truncate ${
            isSelected ? 'text-white font-medium' : 'text-neutral-400'
          } ${matchesSelf && searchTerm ? 'text-green-300' : ''}`}>
            {tag.name}
          </span>
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && tag.children.map(child => (
        <TagTreeItem
          key={child.id}
          tag={child}
          depth={depth + 1}
          selected={selected}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onToggleSelect={onToggleSelect}
          searchTerm={searchTerm}
        />
      ))}
    </>
  );
}

export function TagTreeSelector({ selected, onChange, disabled }: TagTreeSelectorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const selectedIds = new Set(selected.map(t => t.id));

  const { data: tree, isLoading } = useQuery<TagNode[]>({
    queryKey: ['tag-tree'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/tags/tree`, { credentials: 'include' });
      const json = await res.json();
      return json.tree || [];
    },
    staleTime: 60000,
  });

  // Auto-expand top-level sections + categories with selected children
  useEffect(() => {
    if (!tree) return;
    const newExpanded = new Set(expanded);
    // Always expand top-level sections
    tree.forEach(section => newExpanded.add(section.id));
    const checkAndExpand = (nodes: TagNode[], parentId?: string) => {
      for (const node of nodes) {
        const hasSelectedChild = node.children.some(c => selectedIds.has(c.id));
        const hasSelectedDescendant = node.children.some(function check(c): boolean {
          if (selectedIds.has(c.id)) return true;
          return c.children.some(check);
        });
        if (hasSelectedChild || hasSelectedDescendant) {
          newExpanded.add(node.id);
        }
        if (node.children.length > 0) {
          checkAndExpand(node.children, node.id);
        }
      }
    };
    checkAndExpand(tree);
    setExpanded(newExpanded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  // Auto-expand all when searching
  useEffect(() => {
    if (search && tree) {
      const all = new Set<string>();
      const collect = (nodes: TagNode[]) => {
        nodes.forEach(n => { all.add(n.id); collect(n.children); });
      };
      collect(tree);
      setExpanded(all);
    }
  }, [search, tree]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelect = (tag: TagNode) => {
    if (disabled) return;
    if (selectedIds.has(tag.id)) {
      onChange(selected.filter(t => t.id !== tag.id));
    } else {
      onChange([...selected, { id: tag.id, name: tag.name, color: tag.color }]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-4 h-4 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#0c0c10] border border-neutral-800/60 rounded-lg overflow-hidden">
      {/* Search */}
      <div className="px-2 py-1.5 border-b border-neutral-800/30">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tags..."
            className="w-full bg-transparent pl-6 pr-2 py-1 text-[10px] text-white focus:outline-none placeholder:text-neutral-700"
          />
        </div>
      </div>

      {/* Selected summary */}
      {selected.length > 0 && (
        <div className="px-2 py-1.5 border-b border-neutral-800/30 flex flex-wrap gap-1">
          {selected.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20"
            >
              {tag.color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />}
              {tag.name}
              {!disabled && (
                <button onClick={() => toggleSelect(tag as TagNode & { children: TagNode[] })} className="hover:text-white">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Tree */}
      <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
        {tree && tree.length > 0 ? (
          tree.map(section => (
            <div key={section.id}>
              {/* Section header */}
              <div
                className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-white/[0.02]"
              >
                <button
                  onClick={() => toggleExpand(section.id)}
                  className="p-0.5 text-neutral-600 hover:text-neutral-300 transition-colors shrink-0"
                >
                  {expanded.has(section.id) ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>

                {/* Selectable sections get a checkbox */}
                {section.selectable ? (
                  <button
                    onClick={() => !disabled && toggleSelect(section)}
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                      selectedIds.has(section.id) ? 'bg-green-500 border-green-500' : 'border-neutral-700 hover:border-neutral-500'
                    }`}>
                      {selectedIds.has(section.id) && (
                        <svg className="w-2.5 h-2.5 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    {section.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: section.color }} />}
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      selectedIds.has(section.id) ? 'text-white' : 'text-neutral-500'
                    }`}>{section.name}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 flex-1" onClick={() => toggleExpand(section.id)}>
                    {section.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: section.color }} />}
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      {section.name}
                    </span>
                  </span>
                )}

                {section.community && (
                  <span className="text-[8px] px-1 py-px rounded bg-indigo-500/10 text-indigo-400/70 border border-indigo-500/15 font-mono">
                    community
                  </span>
                )}
              </div>

              {/* Children — these are selectable */}
              {expanded.has(section.id) && section.children.map(child => (
                <TagTreeItem
                  key={child.id}
                  tag={child}
                  depth={1}
                  selected={selectedIds}
                  expanded={expanded}
                  onToggleExpand={toggleExpand}
                  onToggleSelect={toggleSelect}
                  searchTerm={search}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="py-4 text-center text-[10px] text-neutral-600">
            <Tag className="w-4 h-4 mx-auto mb-1" />
            No tags available
          </div>
        )}
      </div>
    </div>
  );
}
