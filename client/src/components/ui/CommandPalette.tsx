import { uuid } from '../../lib/uuid';
/**
 * CommandPalette - Quick node insertion with fuzzy search (Cmd+K)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Zap, 
  Hash, 
  Type, 
  ToggleLeft, 
  Upload,
  ArrowRightFromLine,
  Eye,
  Search,
  Command,
  StickyNote,
  Square,
  Circle,
  Pi,
  Package,
  PackageOpen,
  ScanEye,
  Boxes,
  Ungroup,
  GitFork,
  Repeat,
} from 'lucide-react';
import { useFlowStore, type FlowNode } from '../../store/flowStore';
import { defaultMapData } from '../../lib/makeMap';

interface NodeTemplate {
  type: string;
  label: string;
  Icon: typeof Zap;
  description: string;
  color: string;
  bg: string;
  keywords: string[];
  defaultValue?: unknown;
  dataType?: 'number' | 'string' | 'boolean';
  config?: Record<string, unknown>;
  /** Extra top-level node fields (e.g. zIndex for backdrops). */
  nodeProps?: Record<string, unknown>;
  /** Action commands operate on the current selection instead of adding a node. */
  action?: 'group' | 'ungroup';
}

const nodeTemplates: NodeTemplate[] = [
  {
    type: 'code',
    label: 'Code',
    Icon: Zap,
    description: 'Execute Synthase script',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    keywords: ['code', 'script', 'synthase', 'execute', 'run', 'function', 'logic'],
  },
  {
    type: 'viewer',
    label: 'Viewer',
    Icon: Eye,
    description: 'Preview any data type',
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    keywords: ['viewer', 'preview', 'display', 'show', 'visualize', 'render', 'watch'],
  },
  {
    type: 'input',
    label: 'Number Input',
    Icon: Hash,
    description: 'Number input (field or slider)',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    keywords: ['number', 'input', 'numeric', 'slider', 'value', 'integer', 'float'],
    dataType: 'number',
    defaultValue: 0,
    config: { widgetType: 'number' },
  },
  {
    type: 'input',
    label: 'Text Input',
    Icon: Type,
    description: 'Text input (field or textarea)',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    keywords: ['text', 'input', 'string', 'textarea', 'field', 'name', 'label'],
    dataType: 'string',
    defaultValue: '',
    config: { widgetType: 'text' },
  },
  {
    type: 'input',
    label: 'Boolean Input',
    Icon: ToggleLeft,
    description: 'True/False toggle',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    keywords: ['boolean', 'input', 'toggle', 'switch', 'true', 'false', 'flag', 'checkbox'],
    dataType: 'boolean',
    defaultValue: false,
    config: { widgetType: 'boolean' },
  },
  {
    type: 'file_input',
    label: 'File Input',
    Icon: Upload,
    description: 'Load file (schematic, image, CSV, etc.)',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    keywords: ['file', 'input', 'upload', 'load', 'schematic', 'image', 'csv', 'json'],
  },
  {
    type: 'output',
    label: 'Output',
    Icon: ArrowRightFromLine,
    description: 'Flow output (for subflows) with optional download',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    keywords: ['output', 'export', 'download', 'save', 'return', 'result'],
  },
  {
    type: 'constant',
    label: 'Constant',
    Icon: Pi,
    description: 'Emit a fixed literal value',
    color: 'text-neutral-300',
    bg: 'bg-neutral-500/10',
    keywords: ['constant', 'literal', 'value', 'fixed', 'number', 'string', 'vec3', 'block'],
    defaultValue: 0,
    config: { dataType: 'number' },
  },
  {
    type: 'reroute',
    label: 'Reroute',
    Icon: Circle,
    description: 'Pass-through dot to tidy wires',
    color: 'text-neutral-300',
    bg: 'bg-neutral-500/10',
    keywords: ['reroute', 'wire', 'tidy', 'dot', 'pass', 'through', 'pipe'],
  },
  {
    type: 'bundle',
    label: 'Bundle',
    Icon: Package,
    description: 'Pack named inputs into one object',
    color: 'text-violet-300',
    bg: 'bg-violet-500/10',
    keywords: ['bundle', 'object', 'pack', 'group', 'struct', 'record', 'combine', 'fields'],
    config: { bundleFields: [{ name: 'a' }, { name: 'b' }] },
  },
  {
    type: 'unbundle',
    label: 'Unbundle',
    Icon: PackageOpen,
    description: 'Split an object into named outputs',
    color: 'text-violet-300',
    bg: 'bg-violet-500/10',
    keywords: ['unbundle', 'object', 'unpack', 'destructure', 'split', 'extract', 'fields', 'pluck'],
    config: { bundleFields: [{ name: 'a' }, { name: 'b' }] },
  },
  {
    type: 'inspect',
    label: 'Inspect',
    Icon: ScanEye,
    description: 'Tap a wire to preview its live value',
    color: 'text-teal-300',
    bg: 'bg-teal-500/10',
    keywords: ['inspect', 'preview', 'tap', 'debug', 'peek', 'watch', 'value', 'probe'],
  },
  {
    type: 'comment',
    label: 'Comment',
    Icon: StickyNote,
    description: 'Sticky note (no execution)',
    color: 'text-amber-300',
    bg: 'bg-amber-500/10',
    keywords: ['comment', 'note', 'sticky', 'annotate', 'text', 'label', 'doc'],
    config: { label: '' },
  },
  {
    type: 'frame',
    label: 'Frame',
    Icon: Square,
    description: 'Labeled backdrop behind nodes',
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    keywords: ['frame', 'backdrop', 'group', 'box', 'region', 'container', 'rectangle'],
    config: { label: 'Frame' },
    nodeProps: { zIndex: -1 },
  },
  {
    type: 'group',
    label: 'Group Selection',
    Icon: Boxes,
    description: 'Collapse selected nodes into one group node',
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    keywords: ['group', 'collapse', 'subflow', 'subgraph', 'merge', 'fold', 'combine', 'nest'],
    action: 'group',
  },
  {
    type: 'group',
    label: 'Ungroup',
    Icon: Ungroup,
    description: 'Inline the selected group back into the flow',
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    keywords: ['ungroup', 'expand', 'inline', 'explode', 'unfold', 'flatten', 'subflow'],
    action: 'ungroup',
  },
  {
    type: 'switch',
    label: 'Switch',
    Icon: GitFork,
    description: 'Select one of N inputs by a numeric index',
    color: 'text-amber-300',
    bg: 'bg-amber-500/10',
    keywords: ['switch', 'select', 'case', 'choose', 'branch', 'mux', 'router', 'index', 'pick'],
    config: { caseCount: 2 },
  },
  {
    type: 'map',
    label: 'Map',
    Icon: Repeat,
    description: 'Run a body over every list item → list of results',
    color: 'text-cyan-300',
    bg: 'bg-cyan-500/10',
    keywords: ['map', 'iterate', 'loop', 'foreach', 'list', 'transform', 'each', 'apply', 'collect'],
    config: defaultMapData() as unknown as Record<string, unknown>,
  },
];

const getDefaultCode = () => `type Inputs = {
  value: Slider<{ min: 0; max: 100; default: 0 }>;
};

type Outputs = {
  result: Schematic;
};

function generate(inputs) {
  const result = new Schematic();
  // Your code here
  return { result };
}`;

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addNode, nodes, groupSelected, ungroupNode, selectedNodeId } = useFlowStore();

  // Calculate next position based on existing nodes
  const getNextPosition = useCallback(() => {
    if (nodes.length === 0) {
      return { x: 100, y: 100 };
    }
    
    // Find center of canvas based on existing nodes
    const avgX = nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length;
    
    // Add new node below center
    return {
      x: avgX,
      y: Math.max(...nodes.map(n => n.position.y)) + 150,
    };
  }, [nodes]);

  // Fuzzy search matching
  const filteredTemplates = useMemo(() => {
    if (!query.trim()) return nodeTemplates;
    
    const lowerQuery = query.toLowerCase();
    
    return nodeTemplates
      .map(template => {
        // Calculate match score
        let score = 0;
        
        // Exact label match
        if (template.label.toLowerCase().includes(lowerQuery)) {
          score += 10;
        }
        
        // Description match
        if (template.description.toLowerCase().includes(lowerQuery)) {
          score += 5;
        }
        
        // Keyword match
        template.keywords.forEach(keyword => {
          if (keyword.includes(lowerQuery) || lowerQuery.includes(keyword)) {
            score += 3;
          }
        });
        
        return { template, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.template);
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredTemplates]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredTemplates.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredTemplates[selectedIndex]) {
          handleSelectTemplate(filteredTemplates[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredTemplates, selectedIndex, onClose]);

  // Handle template selection
  const handleSelectTemplate = useCallback((template: NodeTemplate) => {
    // Action commands operate on the current selection (group / ungroup).
    if (template.action === 'group') {
      const ids = nodes.filter((n) => n.selected).map((n) => n.id);
      const sel = ids.length ? ids : selectedNodeId ? [selectedNodeId] : [];
      if (sel.length) groupSelected(sel);
      onClose();
      return;
    }
    if (template.action === 'ungroup') {
      const grp = nodes.find((n) => n.selected && n.type === 'group') ??
        (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId && n.type === 'group') : undefined);
      if (grp) ungroupNode(grp.id);
      onClose();
      return;
    }
    const position = getNextPosition();
    const nodeId = `${template.type}-${uuid().slice(0, 8)}`;
    
    const nodeData: FlowNode['data'] = {
      label: template.label,
    };

    if (template.type === 'code') {
      nodeData.code = getDefaultCode();
    }

    if (template.dataType) {
      nodeData.dataType = template.dataType;
      nodeData.value = template.defaultValue;
    }

    if (template.config) {
      Object.assign(nodeData, template.config);
    }

    const newNode: FlowNode = {
      id: nodeId,
      type: template.type,
      position,
      data: nodeData,
      ...template.nodeProps,
    };

    addNode(newNode);
    onClose();
  }, [addNode, getNextPosition, onClose, nodes, selectedNodeId, groupSelected, ungroupNode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Palette */}
      <div className="relative w-full max-w-md bg-neutral-900 rounded-xl border border-neutral-700/50 shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-400">
            <Command className="w-4 h-4" />
            <span className="text-xs">K</span>
          </div>
          <Search className="w-4 h-4 text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes..."
            className="flex-1 bg-transparent text-white placeholder:text-neutral-500 outline-none text-sm"
          />
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto p-2">
          {filteredTemplates.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 text-sm">
              No nodes match your search
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTemplates.map((template, index) => {
                const Icon = template.Icon;
                const isSelected = index === selectedIndex;
                
                return (
                  <button
                    key={`${template.type}-${template.label}`}
                    onClick={() => handleSelectTemplate(template)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isSelected 
                        ? 'bg-blue-500/20 border border-blue-500/30' 
                        : 'hover:bg-neutral-800/50 border border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${template.bg}`}>
                      <Icon className={`w-4 h-4 ${template.color}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">{template.label}</div>
                      <div className="text-xs text-neutral-400">{template.description}</div>
                    </div>
                    {isSelected && (
                      <div className="text-xs text-neutral-500">
                        ↵ to add
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            <span>{filteredTemplates.length} result{filteredTemplates.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
