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
} from 'lucide-react';
import { useFlowStore, type FlowNode } from '../../store/flowStore';

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
];

const getDefaultCode = () => `export const io = {
    inputs: {
        value: { type: 'number', default: 0, description: 'Input value' },
    },
    outputs: {
        result: { type: 'schematic', description: 'Output schematic' },
    },
};

export function main({ value }) {
    // Your code here
    return {};
}`;

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addNode, nodes } = useFlowStore();

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
    const position = getNextPosition();
    const nodeId = `${template.type}-${crypto.randomUUID().slice(0, 8)}`;
    
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
    };

    addNode(newNode);
    onClose();
  }, [addNode, getNextPosition, onClose]);

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
