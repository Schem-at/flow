/**
 * CodeNode - Synthase script execution node with aligned input/output labels
 */

import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, Code, CheckCircle, Loader2, AlertCircle, Clock, Package, PlusCircle } from 'lucide-react';
import type { IODefinition, BlockContract } from '@flow/core';
import { useFlowStore, type NodeExecutionStatus } from '../../store/flowStore';
import { useShallow } from 'zustand/react/shallow';
import { createInputNodesForNode, missingWidgetableInputs } from '../../lib/createInputNodes';

interface ModuleRef {
  id: string;
  slug: string;
  version: string;
  pinned?: boolean;
}

interface CodeNodeData {
  label?: string;
  code?: string;
  io?: IODefinition;
  /** v2 blocks: the FlowType contract parsed from the source — drives the ports. */
  contract?: BlockContract;
  moduleRef?: ModuleRef;
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
    case 'cached':
      return (
        <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
          <CheckCircle className="w-3 h-3" />
          <span>Cached</span>
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
    case 'stale':
      return (
        <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
          <Clock className="w-3 h-3" />
          <span>Stale</span>
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

const CodeNode = memo(({ id, data, selected }: NodeProps & { data: CodeNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  
  // Optimized selectors to prevent unnecessary re-renders
  const cache = useFlowStore(useShallow((state) => state.nodeCache[id]));
  const isExecuting = useFlowStore((state) => state.executingNodeId === id);
  const connectedInputs = useFlowStore(useShallow((state) => {
    const connected = new Set<string>();
    state.edges.forEach(e => {
      if (e.target === id && e.targetHandle) {
        connected.add(e.targetHandle);
      }
    });
    return connected;
  }));

  const [isHovered, setIsHovered] = useState(false);

  const status = cache?.status || 'idle';
  const progress = useFlowStore(useShallow((state) => state.nodeProgress[id]));
  const missingInputs = missingWidgetableInputs(data.contract, connectedInputs);

  const handleCreateInputs = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      createInputNodesForNode(id);
    },
    [id]
  );

  // Ports derive from the v2 contract when present; legacy io is the fallback.
  const toPorts = (
    flowTypes: Record<string, { kind: string }> | undefined,
    legacy: Record<string, { type: string; description?: string }> | undefined
  ): Array<[string, { type: string; description?: string }]> =>
    flowTypes
      ? Object.entries(flowTypes).map(([k, t]) => [k, { type: t.kind }])
      : Object.entries(legacy || {});

  const inputHandles = toPorts(data.contract?.inputs, data.io?.inputs);
  const outputHandles = toPorts(data.contract?.outputs, data.io?.outputs);
  const isModule = !!data.moduleRef;


  const handleClick = useCallback(() => {
    selectNode(id);
  }, [id, selectNode]);

  // Status-based border colors
  const getStatusBorder = () => {
    if (isExecuting) return 'border-amber-500/70 shadow-lg shadow-amber-500/20';
    switch (status) {
      case 'completed': return 'border-green-500/30';
      case 'cached': return 'border-green-500/30';
      case 'error': return 'border-red-500/50';
      case 'stale': return 'border-amber-500/40 shadow-sm shadow-amber-500/10';
      default: return 'border-neutral-800/50';
    }
  };

  return (
    <div
      className={`
        relative min-w-[280px] rounded-xl overflow-visible
        bg-neutral-900 
        border transition-all duration-200
        ${selected
          ? isModule
            ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
            : 'border-green-500/50 shadow-lg shadow-green-500/10'
          : isHovered
            ? 'border-neutral-600/50'
            : getStatusBorder()
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Execution glow effect */}
      {isExecuting && (
        <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none rounded-xl" />
      )}
      {(status === 'completed' || status === 'cached') && (
        <div className="absolute inset-0 bg-green-500/5 pointer-events-none rounded-xl" />
      )}

      {/* Header */}
      <div className={`px-4 py-3 border-b border-neutral-800/50 rounded-t-xl ${
        isModule
          ? 'bg-gradient-to-r from-cyan-900/30 to-neutral-900/50'
          : 'bg-gradient-to-r from-green-900/30 to-neutral-900/50'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${
              isExecuting ? 'bg-amber-500/30' :
              (status === 'completed' || status === 'cached')
                ? isModule ? 'bg-cyan-500/30' : 'bg-green-500/30'
                : isModule ? 'bg-cyan-500/20' : 'bg-green-500/20'
            }`}>
              {isExecuting ? (
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              ) : isModule ? (
                <Package className={`w-4 h-4 ${(status === 'completed' || status === 'cached') ? 'text-cyan-300' : 'text-cyan-400'}`} />
              ) : (
                <Zap className={`w-4 h-4 ${(status === 'completed' || status === 'cached') ? 'text-green-300' : 'text-green-400'}`} />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sm text-white truncate">
                {data.label || (isModule ? 'Module' : 'Code Node')}
              </span>
              {isModule && data.moduleRef && (
                <span className="text-[9px] font-mono text-cyan-500/60 truncate">
                  {data.moduleRef.slug}@{data.moduleRef.version}
                </span>
              )}
            </div>
          </div>
          <StatusIndicator status={status} />
        </div>

        {/* Live progress while executing (Progress.report from the block) */}
        {isExecuting && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
            {progress?.percent !== undefined ? (
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-200"
                style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-amber-400/60" />
            )}
          </div>
        )}
      </div>

      {/* Content with IO sections */}
      <div className="flex">
        {/* Inputs Section - labels align with handles */}
        {inputHandles.length > 0 && (
          <div className="py-3 pl-3 pr-2 border-r border-neutral-800/30 min-w-[90px]">
            <div className="text-[9px] uppercase tracking-wider text-blue-400/70 font-semibold mb-2">Inputs</div>
            <div className="space-y-2">
              {inputHandles.map(([key, port]) => {
                const isConnected = connectedInputs.has(key);
                return (
                  <div
                    key={key}
                    data-label={key}
                    className={`relative text-[11px] py-1.5 px-2 rounded flex items-center gap-1.5 ${isConnected
                      ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                      : 'text-blue-400/70 bg-blue-500/5 border border-blue-500/10'
                      }`}
                    title={port.description || `${key}: ${port.type}`}
                  >
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={key}
                      style={{
                        top: '50%',
                        left: '-19px',
                        transform: 'translateY(-50%)',
                      }}
                      className={`!w-3 !h-3 !border-2 !border-neutral-900 ${connectedInputs.has(key) ? '!bg-green-500' : '!bg-blue-500'
                        }`}
                    />
                    <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-blue-400/50'}`} />
                    {key}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Code Preview or Module Info */}
        <div className="p-3 flex-1 min-w-0">
          {isModule ? (
            <div className="bg-cyan-950/20 rounded-lg p-3 border border-cyan-800/20 flex items-center gap-3">
              <Package className="w-5 h-5 text-cyan-500/50 shrink-0" />
              <div className="text-[10px] text-cyan-400/60">
                <span className="text-cyan-300/80 font-medium">Shared module</span>
                <span className="text-cyan-600 mx-1">·</span>
                <span className="font-mono">{data.moduleRef?.slug}@{data.moduleRef?.version}</span>
              </div>
            </div>
          ) : (
          <div className="bg-neutral-950/50 rounded-lg p-3 font-mono text-xs text-neutral-400 max-h-32 overflow-hidden border border-neutral-800/30 relative group">
            {data.code ? (
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-[2px] pt-[1px] select-none border-r border-neutral-800/50 pr-2">
                  {data.code.split('\n').slice(0, 8).map((_, i) => (
                    <div key={i} className="text-[9px] text-neutral-700 text-right w-3 leading-relaxed">{i + 1}</div>
                  ))}
                </div>
                <pre className="whitespace-pre-wrap break-all flex-1 text-[10px] leading-relaxed text-neutral-300">
                  {data.code.split('\n').slice(0, 8).map((line, i) => (
                    <div key={i}>
                      {line || <br />}
                    </div>
                  ))}
                  {data.code.split('\n').length > 8 && (
                    <div className="text-neutral-600 mt-1 italic text-[9px] flex items-center gap-1">
                      <span>... {data.code.split('\n').length - 8} more lines</span>
                    </div>
                  )}
                </pre>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-neutral-600 italic text-[10px] py-2 justify-center">
                <Code className="w-3 h-3" />
                <span>Double-click to edit code</span>
              </div>
            )}
            
            {/* Hover overlay to indicate editable */}
            <div className="absolute inset-0 bg-neutral-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            </div>
          </div>
          )}

          {/* IO Summary & Status */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-2 text-[10px]">
              {missingInputs.length > 0 && (
                <button
                  onClick={handleCreateInputs}
                  className="flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-purple-300 transition hover:bg-purple-500/20"
                  title={`Create input nodes for: ${missingInputs.map(([n]) => n).join(', ')}`}
                >
                  <PlusCircle className="h-3 w-3" />
                  {missingInputs.length} input{missingInputs.length > 1 ? 's' : ''}
                </button>
              )}
              {inputHandles.length > 0 && (
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                  {inputHandles.length} in
                </span>
              )}
              {outputHandles.length > 0 && (
                <span className={`px-2 py-0.5 rounded border ${(status === 'completed' || status === 'cached')
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                  {outputHandles.length} out
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {(status === 'completed' || status === 'cached') && cache?.executionTime !== undefined && (
                <div className="flex items-center gap-1 text-[9px] text-neutral-400">
                  <Clock className="w-2.5 h-2.5" />
                  {cache.executionTime < 1000 
                    ? `${cache.executionTime}ms` 
                    : `${(cache.executionTime / 1000).toFixed(1)}s`
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Outputs Section */}
        {outputHandles.length > 0 && (
          <div className="py-3 pr-3 pl-2 border-l border-neutral-800/30 min-w-[90px]">
            <div className="text-[9px] uppercase tracking-wider text-amber-400/70 font-semibold mb-2 text-right">Outputs</div>
            <div className="space-y-2">
              {outputHandles.map(([key, port]) => (
                <div
                  key={key}
                  data-label={key}
                  className={`relative text-[11px] py-1.5 px-2 rounded text-right flex items-center justify-end gap-1.5 ${(status === 'completed' || status === 'cached')
                    ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                    : 'text-amber-400/70 bg-amber-500/5 border border-amber-500/10'
                    }`}
                  title={port.description || `${key}: ${port.type}`}
                >
                  {key}
                  <div className={`w-1.5 h-1.5 rounded-full ${(status === 'completed' || status === 'cached') ? 'bg-green-400' : 'bg-amber-400/50'}`} />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={key}
                    style={{
                      top: '50%',
                      right: '-19px',
                      transform: 'translateY(-50%)',
                    }}
                    className={`!w-3 !h-3 !border-2 !border-neutral-900 ${(status === 'completed' || status === 'cached') ? '!bg-green-500' : '!bg-amber-500'
                      }`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Display - shows when node has an error */}
      {status === 'error' && cache?.error && (
        <div className="px-4 pb-3 pt-1">
          <div 
            className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono cursor-pointer hover:bg-red-500/15 transition-colors"
            title={`${cache.error.message}${cache.error.lineNumber ? ` (Line ${cache.error.lineNumber})` : ''}\n\nDouble-click node to see details`}
          >
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {cache.error.type && (
                    <span className="font-semibold">{cache.error.type}:</span>
                  )}
                  {cache.error.lineNumber && (
                    <span className="px-1.5 py-0.5 bg-red-500/20 rounded text-[9px]">
                      Line {cache.error.lineNumber}
                    </span>
                  )}
                </div>
                <div className="truncate mt-0.5">{cache.error.message}</div>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Default input handle if no IO defined */}
      {inputHandles.length === 0 && (
        <Handle
          type="target"
          position={Position.Left}
          id="default"
          style={{ top: '50%' }}
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-neutral-900"
          title="Input"
        />
      )}



      {/* Default output handle if no IO defined */}
      {outputHandles.length === 0 && (
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          style={{ top: '50%' }}
          className={`!w-3 !h-3 !border-2 !border-neutral-900 ${(status === 'completed' || status === 'cached') ? '!bg-green-500' : '!bg-amber-500'
            }`}
          title="Output"
        />
      )}
    </div>
  );
});

CodeNode.displayName = 'CodeNode';

export default CodeNode;
