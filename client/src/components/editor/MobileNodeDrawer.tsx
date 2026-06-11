/**
 * MobileNodeDrawer - Bottom drawer for adding nodes on mobile
 * Features horizontal scrolling categories with touch-friendly cards
 */

import { useCallback, useState } from 'react';
import { 
  Zap, 
  Hash, 
  Type, 
  ToggleLeft, 
  Upload,
  ArrowRightFromLine,
  Eye,
  Workflow,
  X,
  Trash2
} from 'lucide-react';
import { useFlowStore, type FlowNode, type SavedSubflow } from '../../store/flowStore';

interface NodeTemplate {
  type: string;
  label: string;
  Icon: typeof Zap;
  description: string;
  color: string;
  bg: string;
  defaultValue?: unknown;
  dataType?: 'number' | 'string' | 'boolean';
  config?: Record<string, unknown>;
}

const nodeCategories: { name: string; color: string; nodes: NodeTemplate[] }[] = [
  {
    name: 'Logic',
    color: 'green',
    nodes: [
      {
        type: 'code',
        label: 'Code',
        Icon: Zap,
        description: 'Execute script',
        color: 'text-green-400',
        bg: 'bg-green-500/20',
      },
      {
        type: 'viewer',
        label: 'Viewer',
        Icon: Eye,
        description: 'Preview data',
        color: 'text-pink-400',
        bg: 'bg-pink-500/20',
      },
    ],
  },
  {
    name: 'Inputs',
    color: 'purple',
    nodes: [
      {
        type: 'input',
        label: 'Number',
        Icon: Hash,
        description: 'Number input',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        dataType: 'number',
        defaultValue: 0,
        config: { widgetType: 'number' },
      },
      {
        type: 'input',
        label: 'Text',
        Icon: Type,
        description: 'Text input',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        dataType: 'string',
        defaultValue: '',
        config: { widgetType: 'text' },
      },
      {
        type: 'input',
        label: 'Boolean',
        Icon: ToggleLeft,
        description: 'True/False',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        dataType: 'boolean',
        defaultValue: false,
        config: { widgetType: 'boolean' },
      },
      {
        type: 'file_input',
        label: 'File',
        Icon: Upload,
        description: 'Load file',
        color: 'text-orange-400',
        bg: 'bg-orange-500/20',
      },
    ],
  },
  {
    name: 'Outputs',
    color: 'cyan',
    nodes: [
      {
        type: 'output',
        label: 'Output',
        Icon: ArrowRightFromLine,
        description: 'Flow output',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/20',
      },
    ],
  },
];

interface MobileNodeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeAdded?: () => void;
}

export function MobileNodeDrawer({ isOpen, onClose, onNodeAdded }: MobileNodeDrawerProps) {
  const addNode = useFlowStore((state) => state.addNode);
  const savedSubflows = useFlowStore((state) => state.savedSubflows);
  const deleteSubflow = useFlowStore((state) => state.deleteSubflow);
  const [activeCategory, setActiveCategory] = useState(0);

  const handleAddNode = useCallback((template: NodeTemplate) => {
    const id = `${template.type}-${crypto.randomUUID().slice(0, 8)}`;
    const newNode: FlowNode = {
      id,
      type: template.type,
      position: { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: { 
        label: template.label,
        value: template.defaultValue,
        dataType: template.dataType,
        ...template.config
      },
    };
    addNode(newNode);
    onNodeAdded?.();
  }, [addNode, onNodeAdded]);

  const handleAddSubflow = useCallback((subflow: SavedSubflow) => {
    const id = `subflow-${crypto.randomUUID().slice(0, 8)}`;
    const newNode: FlowNode = {
      id,
      type: 'subflow',
      position: { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: { 
        label: subflow.name,
        flowId: subflow.id,
        subflowConfig: subflow.config
      },
    };
    addNode(newNode);
    onNodeAdded?.();
  }, [addNode, onNodeAdded]);

  // Add subflows as a category if there are any
  const allCategories = savedSubflows.length > 0 
    ? [...nodeCategories, { name: 'Subflows', color: 'indigo', nodes: [] as NodeTemplate[] }]
    : nodeCategories;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />
      
      {/* Drawer */}
      <div 
        className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-xl border-t border-white/10 rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-white/10 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            Add Node
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Category tabs - horizontal scroll */}
        <div className="flex gap-2 px-4 pb-4 overflow-x-auto no-scrollbar">
          {allCategories.map((category, idx) => (
            <button
              key={category.name}
              onClick={() => setActiveCategory(idx)}
              className={`
                shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all
                ${activeCategory === idx 
                  ? `bg-${category.color}-500/20 text-${category.color}-400 border border-${category.color}-500/30 shadow-[0_0_10px_-3px_rgba(var(--${category.color}-500-rgb),0.3)]` 
                  : 'bg-white/5 text-neutral-400 border border-transparent hover:bg-white/10'
                }
              `}
              style={activeCategory === idx ? {
                backgroundColor: category.color === 'green' ? 'rgba(34, 197, 94, 0.2)' :
                                 category.color === 'purple' ? 'rgba(168, 85, 247, 0.2)' :
                                 category.color === 'cyan' ? 'rgba(6, 182, 212, 0.2)' :
                                 category.color === 'indigo' ? 'rgba(99, 102, 241, 0.2)' : undefined,
                color: category.color === 'green' ? '#4ade80' :
                       category.color === 'purple' ? '#c084fc' :
                       category.color === 'cyan' ? '#22d3ee' :
                       category.color === 'indigo' ? '#818cf8' : undefined,
                borderColor: category.color === 'green' ? 'rgba(34, 197, 94, 0.3)' :
                             category.color === 'purple' ? 'rgba(168, 85, 247, 0.3)' :
                             category.color === 'cyan' ? 'rgba(6, 182, 212, 0.3)' :
                             category.color === 'indigo' ? 'rgba(99, 102, 241, 0.3)' : undefined,
              } : {}}
            >
              {category.name}
            </button>
          ))}
        </div>
        
        {/* Node cards - horizontal scroll */}
        <div className="px-4 pb-8 overflow-x-auto no-scrollbar">
          <div className="flex gap-3 min-w-min">
            {/* Regular node templates */}
            {activeCategory < nodeCategories.length && 
              nodeCategories[activeCategory].nodes.map((node) => (
                <button
                  key={node.type + node.label}
                  onClick={() => handleAddNode(node)}
                  className={`
                    shrink-0 w-32 p-4 rounded-xl border border-white/5 
                    hover:border-white/10 bg-white/5 hover:bg-white/10 
                    transition-all active:scale-95 flex flex-col items-center
                  `}
                >
                  <div className={`w-12 h-12 rounded-xl ${node.bg} flex items-center justify-center mb-3 shadow-lg`}>
                    <node.Icon className={`w-6 h-6 ${node.color}`} />
                  </div>
                  <div className="text-sm font-medium text-white text-center w-full truncate">{node.label}</div>
                  <div className="text-[10px] text-neutral-500 text-center mt-1 line-clamp-2 w-full">{node.description}</div>
                </button>
              ))
            }
            
            {/* Subflows */}
            {activeCategory === allCategories.length - 1 && savedSubflows.length > 0 && 
              savedSubflows.map((subflow) => (
                <div
                  key={subflow.id}
                  className="shrink-0 w-32 p-4 rounded-xl border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 transition-all relative group flex flex-col items-center"
                >
                  <button
                    onClick={() => handleAddSubflow(subflow)}
                    className="w-full flex flex-col items-center"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-3 shadow-lg">
                      <Workflow className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="text-sm font-medium text-white text-center w-full truncate">{subflow.name}</div>
                    <div className="text-[10px] text-neutral-500 text-center mt-1 w-full truncate">{subflow.category}</div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubflow(subflow.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-neutral-900/80 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            }
          </div>
        </div>
        
        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  );
}
