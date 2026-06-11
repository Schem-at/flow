import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { 
  Workflow,
  CheckCircle, Loader2, AlertCircle, Clock,
  Play, FlaskConical
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { 
  type SubflowConfig,
  type SubflowPort 
} from '@flow/core';
import type { NodeExecutionStatus } from '../../store/flowStore';
import { Modal } from '../ui/Modal';

// ============================================================================
// Types
// ============================================================================

interface SubflowNodeData {
  label?: string;
  flowId: string;
  subflowConfig: SubflowConfig;
  expanded?: boolean;
}

// ============================================================================
// Subflow Test Modal
// ============================================================================

interface SubflowTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SubflowConfig;
  nodeLabel: string;
}

function SubflowTestModal({ isOpen, onClose, config, nodeLabel }: SubflowTestModalProps) {
  const [mockInputs, setMockInputs] = useState<Record<string, unknown>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; result?: unknown; error?: string } | null>(null);
  
  const inputs = config?.inputs || [];
  
  // Initialize mock inputs with defaults
  useEffect(() => {
    if (isOpen) {
      const defaults: Record<string, unknown> = {};
      inputs.forEach((port) => {
        switch (port.type) {
          case 'number':
            defaults[port.id] = port.defaultValue ?? 0;
            break;
          case 'string':
            defaults[port.id] = port.defaultValue ?? '';
            break;
          case 'boolean':
            defaults[port.id] = port.defaultValue ?? false;
            break;
          default:
            defaults[port.id] = port.defaultValue ?? null;
        }
      });
      setMockInputs(defaults);
      setTestResult(null);
    }
  }, [isOpen, inputs]);
  
  const handleInputChange = useCallback((portId: string, value: unknown) => {
    setMockInputs(prev => ({ ...prev, [portId]: value }));
  }, []);
  
  const runTest = useCallback(async () => {
    setIsRunning(true);
    setTestResult(null);
    
    // Simulate a test run (in real implementation, this would execute the subflow)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setTestResult({
      success: true,
      result: {
        message: 'Test completed with mock inputs',
        inputs: mockInputs,
      },
    });
    setIsRunning(false);
  }, [mockInputs]);
  
  const getInputWidget = (port: SubflowPort) => {
    const value = mockInputs[port.id];
    
    switch (port.type) {
      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? 0}
            onChange={(e) => handleInputChange(port.id, parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        );
      case 'boolean':
        return (
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-neutral-800/50 transition-colors border border-transparent hover:border-neutral-800">
            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${value ? 'bg-indigo-500 border-indigo-500' : 'bg-neutral-900 border-neutral-700'}`}>
              {Boolean(value) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
            </div>
            <input
              type="checkbox"
              checked={(value as boolean) ?? false}
              onChange={(e) => handleInputChange(port.id, e.target.checked)}
              className="hidden"
            />
            <span className="text-sm text-neutral-300">{value ? 'True' : 'False'}</span>
          </label>
        );
      case 'string':
      default:
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => handleInputChange(port.id, e.target.value)}
            placeholder={port.description || port.name}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        );
    }
  };
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Test: ${nodeLabel}`}
      subtitle="Run subflow with mock inputs"
      icon={<FlaskConical className="w-5 h-5" />}
      iconColor="text-indigo-400"
      size="md"
    >
      <div className="space-y-6">
        {/* Mock Inputs */}
        {inputs.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-300">Input Parameters</h4>
              <span className="text-xs text-neutral-500">{inputs.length} inputs configured</span>
            </div>
            <div className="grid gap-4 p-4 bg-neutral-900/50 rounded-xl border border-neutral-800/50">
              {inputs.map((port) => (
                <div key={port.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-neutral-400">
                      {port.name}
                    </label>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 font-mono">
                      {port.type}
                    </span>
                  </div>
                  {getInputWidget(port)}
                  {port.description && (
                    <p className="text-[10px] text-neutral-500">{port.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 text-center py-8 bg-neutral-900/30 rounded-xl border border-neutral-800/30 border-dashed">
            This subflow has no inputs to configure
          </div>
        )}
        
        {/* Run Button */}
        <button
          onClick={runTest}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-900/20"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running Simulation...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Run Test Simulation
            </>
          )}
        </button>
        
        {/* Results */}
        {testResult && (
          <div className={`p-4 rounded-xl border animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            testResult.success 
              ? 'bg-green-500/5 border-green-500/20' 
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
              <h4 className={`text-sm font-semibold ${
                testResult.success ? 'text-green-400' : 'text-red-400'
              }`}>
                {testResult.success ? 'Test Passed' : 'Test Failed'}
              </h4>
            </div>
            
            {testResult.result !== undefined && (
              <div className="relative">
                <div className="absolute top-2 right-2 text-[10px] text-neutral-500 font-mono">JSON</div>
                <pre className="text-xs font-mono text-neutral-300 bg-neutral-950/50 p-3 rounded-lg overflow-auto max-h-40 border border-neutral-800/50">
                  {JSON.stringify(testResult.result, null, 2)}
                </pre>
              </div>
            )}
            {testResult.error && (
              <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                {testResult.error}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

const StatusIndicator = ({ status }: { status: NodeExecutionStatus }) => {
  switch (status) {
    case 'completed':
      return (
        <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
          <CheckCircle className="w-3 h-3" />
          <span>Ready</span>
        </div>
      );
    case 'running':
      return (
        <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Running</span>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
          <AlertCircle className="w-3 h-3" />
          <span>Error</span>
        </div>
      );
    case 'pending':
      return (
        <div className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
          <Clock className="w-3 h-3" />
          <span>Pending</span>
        </div>
      );
    default:
      return null;
  }
};

// ============================================================================
// Handle Components  
// ============================================================================

interface PortHandleProps {
  port: SubflowPort;
  type: 'source' | 'target';
  position: Position;
  isConnected: boolean;
}

const PortHandle = memo(({ port, type, position, isConnected }: PortHandleProps) => {
  const getTypeColor = (portType: string) => {
    switch (portType) {
      case 'number': return 'bg-blue-500';
      case 'string': return 'bg-green-500';
      case 'boolean': return 'bg-amber-500';
      case 'file': return 'bg-purple-500';
      case 'schematic': return 'bg-pink-500';
      case 'any': return 'bg-neutral-400';
      default: return 'bg-neutral-400';
    }
  };

  const getTypeBorderColor = (portType: string) => {
    switch (portType) {
      case 'number': return 'border-blue-500/20 bg-blue-500/10 text-blue-400';
      case 'string': return 'border-green-500/20 bg-green-500/10 text-green-400';
      case 'boolean': return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
      case 'file': return 'border-purple-500/20 bg-purple-500/10 text-purple-400';
      case 'schematic': return 'border-pink-500/20 bg-pink-500/10 text-pink-400';
      case 'any': return 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400';
      default: return 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400';
    }
  };
  
  const isLeft = position === Position.Left;
  const colorClass = getTypeColor(port.type);
  const containerClass = isConnected 
    ? getTypeBorderColor(port.type)
    : 'text-neutral-400 bg-neutral-800/50 border-neutral-700/50';
  
  return (
    <div 
      className={`
        relative text-[11px] py-1.5 px-2 rounded border flex items-center gap-1.5
        ${isLeft ? 'flex-row' : 'flex-row-reverse text-right'}
        ${containerClass}
      `}
      title={`${port.name} (${port.type})${port.description ? `: ${port.description}` : ''}`}
    >
      <Handle
        type={type}
        position={position}
        id={port.id}
        style={{
          top: '50%',
          [isLeft ? 'left' : 'right']: '-19px',
          transform: 'translateY(-50%)',
        }}
        className={`
          !w-3 !h-3 !border-2 !border-neutral-900
          ${isConnected ? `!${colorClass}` : '!bg-neutral-600'}
          transition-all hover:!scale-125
        `}
      />
      <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? colorClass : 'bg-neutral-600'}`} />
      <span className="font-medium whitespace-nowrap">
        {port.name}
      </span>
    </div>
  );
});

PortHandle.displayName = 'PortHandle';

// ============================================================================
// Main SubflowNode Component
// ============================================================================

const SubflowNode = memo(({ id, data, selected }: NodeProps & { data: SubflowNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const executingNodeId = useFlowStore((state) => state.executingNodeId);
  
  // Standard selector for cache (reference equality is sufficient)
  const cache = useFlowStore((state) => state.nodeCache[id]);
  
  // Optimized selector for connections using a stable string signature
  // This prevents re-renders when unrelated edges change
  const connectionSignature = useFlowStore((state) => {
    const inputHandles: string[] = [];
    const outputHandles: string[] = [];
    
    for (const e of state.edges) {
      if (e.target === id && e.targetHandle) inputHandles.push(e.targetHandle);
      if (e.source === id && e.sourceHandle) outputHandles.push(e.sourceHandle);
    }
    
    return `${inputHandles.sort().join(',')}|${outputHandles.sort().join(',')}`;
  });

  const { connectedInputs, connectedOutputs } = useMemo(() => {
    const [inputs, outputs] = connectionSignature.split('|');
    return {
      connectedInputs: new Set(inputs ? inputs.split(',') : []),
      connectedOutputs: new Set(outputs ? outputs.split(',') : [])
    };
  }, [connectionSignature]);

  const [isHovered, setIsHovered] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  
  const status = cache?.status || 'idle';
  const isExecuting = executingNodeId === id;
  
  const config = data.subflowConfig;
  const inputs = config?.inputs || [];
  const outputs = config?.outputs || [];
  
  const handleClick = useCallback(() => {
    selectNode(id);
  }, [id, selectNode]);

  // Status-based border colors
  const getStatusBorder = () => {
    if (isExecuting) return 'border-amber-500/70 shadow-lg shadow-amber-500/20';
    switch (status) {
      case 'completed': return 'border-green-500/30';
      case 'error': return 'border-red-500/50';
      case 'pending': return 'border-blue-500/30';
      default: return 'border-neutral-800/50';
    }
  };

  return (
    <div
      className={`
        relative rounded-xl bg-gradient-to-br from-neutral-900 to-neutral-950
        border-2 transition-all duration-200
        ${
          selected
            ? 'border-indigo-500 shadow-xl shadow-indigo-500/20 ring-2 ring-indigo-500/30'
            : isHovered
              ? 'border-indigo-500/30 shadow-lg'
              : getStatusBorder()
        }
        hover:shadow-xl
      `}
      style={{ minWidth: 240 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border-b border-neutral-800/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
              <Workflow className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-white truncate">
                {data.label || config?.nodeName || 'Subflow'}
              </div>
              {config?.category && (
                <div className="text-[10px] text-neutral-500 truncate">
                  {config.category}
                </div>
              )}
            </div>
          </div>
          
          {/* Status Badge */}
          <StatusIndicator status={status} />
        </div>
      </div>

      {/* Input/Output Lists */}
      <div className="px-4 py-3 space-y-3">
        {/* Inputs */}
        {inputs.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider px-1">Inputs</div>
            {inputs.map((port) => (
              <PortHandle
                key={`input-${port.id}`}
                port={port}
                type="target"
                position={Position.Left}
                isConnected={connectedInputs.has(port.id)}
              />
            ))}
          </div>
        )}
        
        {/* Outputs */}
        {outputs.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider px-1">Outputs</div>
            {outputs.map((port) => (
              <PortHandle
                key={`output-${port.id}`}
                port={port}
                type="source"
                position={Position.Right}
                isConnected={connectedOutputs.has(port.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {status === 'error' && cache?.error && (
        <div className="px-4 pb-3">
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono">
            {cache.error.message}
          </div>
        </div>
      )}

      {/* Test Button - visible on hover */}
      {isHovered && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTestModal(true);
            }}
            className="p-1.5 bg-indigo-600/80 hover:bg-indigo-500 rounded-md text-white transition-colors"
            title="Test subflow with mock inputs"
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Test Modal */}
      <SubflowTestModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        config={config}
        nodeLabel={data.label || config?.nodeName || 'Subflow'}
      />
    </div>
  );
});

SubflowNode.displayName = 'SubflowNode';

export default SubflowNode;