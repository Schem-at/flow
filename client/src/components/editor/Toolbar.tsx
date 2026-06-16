import { uuid } from '../../lib/uuid';
/**
 * Editor Toolbar - Node palette, subflows, and actions
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
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  Package,
  Archive,
  Globe,
} from 'lucide-react';
import { useFlowStore, type FlowNode } from '../../store/flowStore';
import { ModuleBrowser } from './ModuleBrowser';
import { features } from '../../config/features';
import { DEFAULT_BLOCK_SOURCE, DEFAULT_BLOCK_CONTRACT, contractToIO } from '../../lib/block/io-compat';
import { EXAMPLE_BLOCKS, EXAMPLE_BLOCK_CONTRACTS } from '../../lib/block/examples';

interface NodeTemplate {
  type: string;
  label: string;
  Icon: typeof Zap;
  description: string;
  color: string;
  bg: string;
  border: string;
  defaultValue?: unknown;
  dataType?: 'number' | 'string' | 'boolean';
  config?: Record<string, unknown>;
}

const nodeCategories: { name: string; nodes: NodeTemplate[] }[] = [
  {
    name: 'Logic',
    nodes: [
      {
        type: 'code',
        label: 'Code',
        Icon: Zap,
        description: 'Run a code block',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
        config: {
          code: DEFAULT_BLOCK_SOURCE,
          contract: DEFAULT_BLOCK_CONTRACT,
          io: contractToIO(DEFAULT_BLOCK_CONTRACT),
        },
      },
      {
        type: 'viewer',
        label: 'Viewer',
        Icon: Eye,
        description: 'Preview any data type',
        color: 'text-pink-400',
        bg: 'bg-pink-500/10',
        border: 'border-pink-500/20',
      },
    ],
  },
  {
    name: 'Inputs',
    nodes: [
      {
        type: 'input',
        label: 'Number',
        Icon: Hash,
        description: 'Number input (field or slider)',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        dataType: 'number',
        defaultValue: 0,
        config: { widgetType: 'number' },
      },
      {
        type: 'input',
        label: 'Text',
        Icon: Type,
        description: 'Text input (field or textarea)',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        dataType: 'string',
        defaultValue: '',
        config: { widgetType: 'text' },
      },
      {
        type: 'input',
        label: 'Boolean',
        Icon: ToggleLeft,
        description: 'True/False toggle',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        dataType: 'boolean',
        defaultValue: false,
        config: { widgetType: 'boolean' },
      },
      {
        type: 'file_input',
        label: 'File',
        Icon: Upload,
        description: 'Load file (schematic, image, CSV, etc.)',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
      },
      {
        type: 'asset',
        label: 'Asset',
        Icon: Archive,
        description: 'Bundle a schematic/image inside the flow',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
      },
    ],
  },
  {
    name: 'Outputs',
    nodes: [
      {
        type: 'output',
        label: 'Output',
        Icon: ArrowRightFromLine,
        description: 'Flow output with optional download',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
      },
    ],
  },
  {
    // Platform primitives: ready-made blocks that talk to schemati
    // (search / fetch / upload), droppable like any other node.
    name: 'Schemati',
    nodes: EXAMPLE_BLOCKS.filter((b) => b.category === 'platform').map((example) => ({
      type: 'code',
      label: example.name,
      Icon: Globe,
      description: example.description,
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20',
      config: {
        label: `Schemati ${example.name}`,
        code: example.source,
        contract: EXAMPLE_BLOCK_CONTRACTS[example.id],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS[example.id]),
      },
    })),
  },
  {
    // Every example block, droppable as a ready-made node with typed ports.
    name: 'Examples',
    nodes: EXAMPLE_BLOCKS.filter((b) => !b.category).map((example) => ({
      type: 'code',
      label: example.name,
      Icon: Zap,
      description: example.description,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      config: {
        label: example.name,
        code: example.source,
        contract: EXAMPLE_BLOCK_CONTRACTS[example.id],
        io: contractToIO(EXAMPLE_BLOCK_CONTRACTS[example.id]),
      },
    })),
  },
];

// Schemati palette category is gated behind the schematiNodes feature flag.
const visibleCategories = features.schematiNodes
  ? nodeCategories
  : nodeCategories.filter((c) => c.name !== 'Schemati');

// ============================================================================
// Main Toolbar Component
// ============================================================================

export function Toolbar() {
  const addNode = useFlowStore((state) => state.addNode);

  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Logic', 'Inputs', 'Outputs', 'Schemati']);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'nodes' | 'modules'>('nodes');

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleAddNode = useCallback((template: NodeTemplate) => {
    const id = `${template.type}-${uuid().slice(0, 8)}`;
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
  }, [addNode]);

  const onDragStart = (event: React.DragEvent, nodeType: string, template?: NodeTemplate) => {
    event.dataTransfer.setData('application/reactflow', nodeType);

    if (template) {
      event.dataTransfer.setData('application/reactflow-data', JSON.stringify({
        label: template.label,
        value: template.defaultValue,
        dataType: template.dataType,
        ...template.config
      }));
    }

    event.dataTransfer.effectAllowed = 'move';
  };

  if (isCollapsed) {
    return (
      <div className="h-full border-r border-neutral-800/30 bg-[#07070a] flex flex-col items-center py-3 px-1.5 gap-2">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-all"
          title="Expand Toolbar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="w-px flex-1 bg-neutral-800/30" />
        {/* Quick-add icons when collapsed */}
        {visibleCategories.flatMap(c => c.nodes).slice(0, 5).map(node => (
          <button
            key={node.type}
            onClick={() => handleAddNode(node)}
            className={`p-1.5 rounded-lg hover:bg-white/5 transition-all ${node.color}`}
            title={node.label}
          >
            <node.Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="h-full w-60 bg-[#07070a] border-r border-neutral-800/30 flex flex-col shrink-0">
        <div className="px-3 py-2 border-b border-neutral-800/30 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('nodes')}
              className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                activeTab === 'nodes' ? 'bg-white/[0.07] text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Zap className="w-3 h-3 text-green-400" />
              Nodes
            </button>
            {features.modules && (
              <button
                onClick={() => setActiveTab('modules')}
                className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  activeTab === 'modules' ? 'bg-white/[0.07] text-white' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Package className="w-3 h-3 text-cyan-400" />
                Modules
              </button>
            )}
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-white/5 rounded text-neutral-600 hover:text-neutral-300 transition-colors"
            title="Collapse"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {features.modules && activeTab === 'modules' ? (
          <ModuleBrowser />
        ) : (
        /* Categories */
        <div className="p-2 space-y-0.5 flex-1 overflow-y-auto custom-scrollbar">
          {/* Built-in node categories */}
          {visibleCategories.map((category) => (
            <div key={category.name}>
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors rounded-lg hover:bg-white/5"
              >
                <span>{category.name}</span>
                {expandedCategories.includes(category.name) ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {expandedCategories.includes(category.name) && (
                <div className="mt-1 space-y-1 ml-2">
                  {category.nodes.map((node) => (
                    <div
                      key={node.type + node.label}
                      draggable
                      onDragStart={(event) => onDragStart(event, node.type, node)}
                      onClick={() => handleAddNode(node)}
                      className="group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition-all"
                    >
                      <div className={`p-1.5 rounded-md ${node.bg} ${node.border} border`}>
                        <node.Icon className={`w-3.5 h-3.5 ${node.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-neutral-300 group-hover:text-white transition-colors">
                          {node.label}
                        </div>
                        <div className="text-[10px] text-neutral-600 truncate leading-tight">
                          {node.description}
                        </div>
                      </div>
                      <GripVertical className="w-3 h-3 text-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

        </div>
        )}
      </div>
    </>
  );
}
