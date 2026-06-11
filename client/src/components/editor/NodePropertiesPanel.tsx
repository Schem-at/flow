/**
 * NodePropertiesPanel - Edit node properties in a modal
 * Supports unified input node with data type and widget settings
 */

import { Hash, Type, ToggleLeft, FolderOpen, Save, Eye, Info, Lock, Unlock, Sliders, List } from 'lucide-react';
import { useFlowStore, type InputWidgetType } from '../../store/flowStore';
import type { DataType } from '../nodes/InputNode';

interface NodePropertiesPanelProps {
  nodeId: string;
}

// Widget options per data type
const widgetOptionsForType: Record<DataType, { value: InputWidgetType; label: string; icon: typeof Hash }[]> = {
  number: [
    { value: 'number', label: 'Number Field', icon: Hash },
    { value: 'slider', label: 'Range Slider', icon: Sliders },
  ],
  string: [
    { value: 'text', label: 'Text Field', icon: Type },
    { value: 'textarea', label: 'Text Area', icon: Type },
    { value: 'select', label: 'Dropdown', icon: List },
  ],
  boolean: [
    { value: 'boolean', label: 'Toggle', icon: ToggleLeft },
  ],
};

export function NodePropertiesPanel({ nodeId }: NodePropertiesPanelProps) {
  const { nodes, updateNodeData, setNodeOutput } = useFlowStore();
  const node = nodes.find((n) => n.id === nodeId);

  if (!node) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 p-8">
        <div className="text-center">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Node not found</p>
        </div>
      </div>
    );
  }

  // Determine if this is an input node
  const isInputNode = node.type === 'input' || 
    node.type?.includes('_input') && !node.type?.includes('schematic');

  // Determine data type
  const dataType: DataType = node.data.dataType || 
    (node.type === 'number_input' ? 'number' : 
     node.type === 'boolean_input' ? 'boolean' : 'string');

  // Determine widget type
  const widgetType: InputWidgetType = node.data.widgetType || 
    (dataType === 'number' ? 'number' : 
     dataType === 'boolean' ? 'boolean' : 'text');

  const isConstant = node.data.isConstant ?? false;
  const availableWidgets = widgetOptionsForType[dataType] || [];

  const getNodeIcon = () => {
    if (isInputNode) {
      switch (widgetType) {
        case 'slider': return Sliders;
        case 'number': return Hash;
        case 'boolean': return ToggleLeft;
        case 'select': return List;
        default: return Type;
      }
    }
    switch (node.type) {
      case 'schematic_input': return FolderOpen;
      case 'schematic_output': return Save;
      case 'schematic_viewer': return Eye;
      default: return Info;
    }
  };

  const getNodeColor = () => {
    if (isInputNode) {
      return { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' };
    }
    switch (node.type) {
      case 'schematic_input':
        return { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' };
      case 'schematic_output':
        return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' };
      case 'schematic_viewer':
        return { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-400' };
      default:
        return { bg: 'bg-neutral-500/10', border: 'border-neutral-500/20', text: 'text-neutral-400' };
    }
  };

  const Icon = getNodeIcon();
  const colors = getNodeColor();

  const handleValueChange = (value: unknown) => {
    updateNodeData(nodeId, { value });
    // Update cached output
    setNodeOutput(nodeId, { output: value });
  };

  const getNodeTitle = () => {
    if (isInputNode) {
      return `${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Input`;
    }
    return node.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Node';
  };

  return (
    <div className="p-6 max-h-[60vh] overflow-y-auto">
      {/* Node Type Header */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-neutral-800/50">
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${colors.bg} border ${colors.border}`}>
          <Icon className={`w-6 h-6 ${colors.text}`} />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-white text-lg">
            {getNodeTitle()}
          </div>
          <div className="text-sm text-neutral-500">
            Node ID: <code className="text-neutral-400">{node.id.slice(0, 20)}...</code>
          </div>
        </div>
        
        {/* Constant Toggle (for input nodes) */}
        {isInputNode && (
          <button
            onClick={() => updateNodeData(nodeId, { isConstant: !isConstant })}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${isConstant 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                : 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/50 hover:text-white'
              }
            `}
            title={isConstant ? 'Constant (not exposed in API)' : 'Exposed (visible in API)'}
          >
            {isConstant ? (
              <>
                <Lock className="w-4 h-4" />
                Constant
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                Exposed
              </>
            )}
          </button>
        )}
      </div>

      {/* Properties */}
      <div className="space-y-5">
        {/* Label */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">Label</label>
          <input
            type="text"
            value={node.data.label || ''}
            onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
            placeholder="Enter node label..."
          />
        </div>

        {/* Widget Type Selection (for input nodes with multiple options) */}
        {isInputNode && availableWidgets.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Input Method</label>
            <div className="grid grid-cols-2 gap-2">
              {availableWidgets.map((widget) => {
                const isSelected = widgetType === widget.value;
                return (
                  <button
                    key={widget.value}
                    onClick={() => updateNodeData(nodeId, { widgetType: widget.value })}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                      ${isSelected 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                        : 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/50 hover:text-white'
                      }
                    `}
                  >
                    <widget.icon className="w-4 h-4" />
                    {widget.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Value for input nodes */}
        {isInputNode && (
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Value</label>
            
            {/* Boolean toggle */}
            {dataType === 'boolean' && (
              <button
                onClick={() => handleValueChange(!node.data.value)}
                className={`
                  w-full px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${node.data.value 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/50'
                  }
                `}
              >
                {node.data.value ? 'True' : 'False'}
              </button>
            )}
            
            {/* Slider widget */}
            {dataType === 'number' && widgetType === 'slider' && (
              <div className="space-y-3">
                <input
                  type="range"
                  value={Number(node.data.value) || 0}
                  min={node.data.min ?? 0}
                  max={node.data.max ?? 100}
                  step={node.data.step ?? 1}
                  onChange={(e) => handleValueChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">{node.data.min ?? 0}</span>
                  <span className="text-sm font-mono text-purple-400">{String(node.data.value ?? 0)}</span>
                  <span className="text-xs text-neutral-500">{node.data.max ?? 100}</span>
                </div>
                
                {/* Slider range config */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/50">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Min</label>
                    <input
                      type="number"
                      value={node.data.min ?? 0}
                      onChange={(e) => updateNodeData(nodeId, { min: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Max</label>
                    <input
                      type="number"
                      value={node.data.max ?? 100}
                      onChange={(e) => updateNodeData(nodeId, { max: parseFloat(e.target.value) || 100 })}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1">Step</label>
                    <input
                      type="number"
                      value={node.data.step ?? 1}
                      onChange={(e) => updateNodeData(nodeId, { step: parseFloat(e.target.value) || 1 })}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Number input */}
            {dataType === 'number' && widgetType !== 'slider' && (
              <input
                type="number"
                value={node.data.value as number ?? ''}
                onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                placeholder="0"
              />
            )}
            
            {/* Text input */}
            {dataType === 'string' && widgetType === 'text' && (
              <input
                type="text"
                value={node.data.value as string ?? ''}
                onChange={(e) => handleValueChange(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                placeholder="Enter value..."
              />
            )}
            
            {/* Textarea */}
            {dataType === 'string' && widgetType === 'textarea' && (
              <textarea
                value={node.data.value as string ?? ''}
                onChange={(e) => handleValueChange(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                rows={4}
                placeholder="Enter text..."
              />
            )}
            
            {/* Select options */}
            {dataType === 'string' && widgetType === 'select' && (
              <div className="space-y-3">
                <select
                  value={String(node.data.value ?? '')}
                  onChange={(e) => handleValueChange(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  {(node.data.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Options (one per line)</label>
                  <textarea
                    value={(node.data.options || []).join('\n')}
                    onChange={(e) => updateNodeData(nodeId, { 
                      options: e.target.value.split('\n').filter(Boolean) 
                    })}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-purple-500 resize-none"
                    rows={3}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {isInputNode && (
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Description</label>
            <input
              type="text"
              value={node.data.description || ''}
              onChange={(e) => updateNodeData(nodeId, { description: e.target.value })}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              placeholder="Optional description..."
            />
          </div>
        )}

        {/* Constant explanation */}
        {isInputNode && (
          <div className={`p-3 rounded-lg border ${isConstant ? 'bg-amber-500/5 border-amber-500/20' : 'bg-neutral-800/30 border-neutral-700/30'}`}>
            <div className="flex items-start gap-2 text-xs">
              {isConstant ? (
                <>
                  <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-amber-400">Constant Mode</span>
                    <p className="text-neutral-500 mt-0.5">
                      This value is fixed and won't appear in the API or execution inputs.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-neutral-300">Exposed Mode</span>
                    <p className="text-neutral-500 mt-0.5">
                      This input will be visible when executing the flow and available via API.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Position info */}
        <div className="pt-5 border-t border-neutral-800/50">
          <label className="block text-sm font-medium text-neutral-300 mb-3">Position</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">X</label>
              <div className="px-3 py-2 bg-neutral-900/50 border border-neutral-800/50 rounded-lg text-sm text-neutral-400 font-mono">
                {Math.round(node.position.x)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Y</label>
              <div className="px-3 py-2 bg-neutral-900/50 border border-neutral-800/50 rounded-lg text-sm text-neutral-400 font-mono">
                {Math.round(node.position.y)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
