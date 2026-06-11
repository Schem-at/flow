/**
 * DataEdge - Custom edge that shows data flow state and type compatibility
 * Green when source has computed data, shows warnings for type mismatches
 * Debug mode shows data preview and serialization indicators
 */

import { memo, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { useFlowStore } from '../../store/flowStore';
import { validateConnection } from '../../lib/utils';
import { AlertTriangle, Zap, Database, X } from 'lucide-react';
import { isSchematicData, isImageData, isTabularData } from '@flow/core';

interface DataEdgeProps extends EdgeProps {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Get a human-readable description of the data type
 */
function getDataTypeLabel(value: unknown): { type: string; serialized: boolean; inWorker?: boolean; size?: string } {
  if (value === null || value === undefined) {
    return { type: 'null', serialized: false };
  }
  
  // Check for worker-internal marker (data stayed in worker, not serialized)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('_workerInternal' in obj && obj._workerInternal === true) {
      return { type: 'in-worker', serialized: false, inWorker: true };
    }
    
    // Check for schematic handle (data stored in worker, only handle in main thread)
    if ('_schematicHandle' in obj && typeof obj._schematicHandle === 'string') {
      const handleId = obj._schematicHandle;
      return { type: `handle: ${handleId.slice(0, 8)}...`, serialized: false, inWorker: true };
    }
  }
  
  // Check for serialized data types (crossed worker boundary)
  if (isSchematicData(value)) {
    const data = (value as { data: unknown }).data;
    const size = data instanceof Uint8Array ? `${(data.byteLength / 1024).toFixed(1)}KB` : 
                 ArrayBuffer.isView(data) ? `${((data as Uint8Array).byteLength / 1024).toFixed(1)}KB` : undefined;
    return { type: 'schematic', serialized: true, size };
  }
  
  if (isImageData(value)) {
    return { type: 'image', serialized: true };
  }
  
  if (isTabularData(value)) {
    return { type: 'table', serialized: true };
  }
  
  // Check for WASM objects (still in worker, not serialized)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('__wbg_ptr' in obj || typeof obj.to_schematic === 'function') {
      return { type: 'schematic (WASM)', serialized: false, inWorker: true };
    }
  }
  
  // Basic types
  if (typeof value === 'number') return { type: 'number', serialized: false };
  if (typeof value === 'string') return { type: `string (${value.length} chars)`, serialized: false };
  if (typeof value === 'boolean') return { type: 'boolean', serialized: false };
  if (Array.isArray(value)) return { type: `array [${value.length}]`, serialized: false };
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return { type: `object {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`, serialized: false };
  }
  
  return { type: typeof value, serialized: false };
}

/**
 * Get a preview of the data value
 */
function getDataPreview(value: unknown, maxLength = 50): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  // Worker internal marker - data stayed in worker
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('_workerInternal' in obj && obj._workerInternal === true) {
      return '⚡ Data in worker (not serialized)';
    }
  }
  
  if (isSchematicData(value)) {
    const meta = (value as { metadata?: { name?: string } }).metadata;
    return meta?.name || 'Schematic';
  }
  
  if (typeof value === 'object' && '__wbg_ptr' in (value as object)) {
    return `WASM ptr: ${(value as { __wbg_ptr: number }).__wbg_ptr}`;
  }
  
  if (typeof value === 'string') {
    return value.length > maxLength ? value.slice(0, maxLength) + '...' : value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (keys.includes('default')) {
      return getDataPreview((value as Record<string, unknown>).default, maxLength);
    }
    return `{${keys.join(', ')}}`;
  }
  
  return String(value);
}

const DataEdge = memo(({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: DataEdgeProps) => {
  const nodeCache = useFlowStore((state) => state.nodeCache);
  const nodes = useFlowStore((state) => state.nodes);
  const debugMode = useFlowStore((state) => state.debugMode);
  const sourceCache = nodeCache[source];
  const [showPopup, setShowPopup] = useState(false);

  const isReady = sourceCache?.status === 'completed' || sourceCache?.status === 'cached';
  const isStale = sourceCache?.status === 'stale';
  const isRunning = sourceCache?.status === 'running';
  const isError = sourceCache?.status === 'error';

  // Get the actual data flowing through this edge
  const edgeData = useMemo(() => {
    if (!sourceCache?.output) return null;
    
    const output = sourceCache.output as Record<string, unknown>;
    const handleKey = sourceHandle || 'default';
    
    // Try to get the specific handle's data
    let value = output[handleKey];
    if (value === undefined && Object.keys(output).length === 1) {
      value = output[Object.keys(output)[0]];
    }
    if (value === undefined) {
      value = output['default'] ?? output;
    }
    
    return value;
  }, [sourceCache?.output, sourceHandle]);

  const dataInfo = useMemo(() => {
    if (!edgeData) return null;
    return getDataTypeLabel(edgeData);
  }, [edgeData]);

  // Get type compatibility between source and target
  const typeValidation = useMemo(() => {
    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);
    
    const sourceIO = sourceNode?.data?.io;
    const targetIO = targetNode?.data?.io;
    
    const sourcePort = sourceIO?.outputs?.[sourceHandle || 'default'];
    const targetPort = targetIO?.inputs?.[targetHandle || 'default'];
    
    return validateConnection(sourcePort, targetPort);
  }, [nodes, source, target, sourceHandle, targetHandle]);

  const hasTypeWarning = typeValidation.compatibility === 'coercible';
  const hasTypeError = typeValidation.compatibility === 'incompatible';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  // Determine edge color based on state and type compatibility
  let strokeColor = '#525252';
  let strokeWidth = 2;
  let animated = false;
  let dashArray = '';

  if (hasTypeError) {
    strokeColor = '#ef4444';
    strokeWidth = 2;
    dashArray = '5,5';
  } else if (hasTypeWarning) {
    strokeColor = '#eab308';
    strokeWidth = 2;
    dashArray = '8,4';
  } else if (isReady) {
    strokeColor = '#22c55e';
    strokeWidth = 2.5;
  } else if (isRunning) {
    strokeColor = '#f59e0b';
    strokeWidth = 2.5;
    animated = true;
  } else if (isStale) {
    strokeColor = '#6b7280';
    strokeWidth = 2;
  } else if (isError) {
    strokeColor = '#ef4444';
    strokeWidth = 2;
  }

  if (selected) {
    strokeWidth = 3;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: dashArray,
          transition: 'stroke 0.3s ease, stroke-width 0.2s ease',
        }}
        className={animated ? 'animated-edge' : ''}
      />

      {/* Debug mode: Data info label */}
      {debugMode && isReady && dataInfo && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="cursor-pointer"
            onClick={() => setShowPopup(!showPopup)}
          >
            <div className={`
              flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono
              border border-neutral-700 bg-neutral-900/95 backdrop-blur-sm
              hover:border-neutral-500 transition-colors
              ${dataInfo.serialized ? 'text-cyan-400' : dataInfo.inWorker ? 'text-purple-400' : 'text-green-400'}
            `}>
              {dataInfo.serialized ? (
                <Database className="w-2.5 h-2.5" />
              ) : dataInfo.inWorker ? (
                <Zap className="w-2.5 h-2.5 text-purple-400" />
              ) : (
                <Zap className="w-2.5 h-2.5" />
              )}
              <span className="max-w-[80px] truncate">{dataInfo.type}</span>
              {dataInfo.size && <span className="text-neutral-500">({dataInfo.size})</span>}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Detailed popup when clicked in debug mode */}
      {debugMode && showPopup && edgeData && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, 0) translate(${labelX}px,${labelY + 20}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
            }}
          >
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-2 shadow-xl min-w-[200px] max-w-[300px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-neutral-300">Edge Data</span>
                <button 
                  onClick={() => setShowPopup(false)}
                  className="p-0.5 hover:bg-neutral-800 rounded"
                >
                  <X className="w-3 h-3 text-neutral-500" />
                </button>
              </div>
              
              <div className="space-y-1.5 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">Type:</span>
                  <span className={dataInfo?.serialized ? 'text-cyan-400' : dataInfo?.inWorker ? 'text-purple-400' : 'text-green-400'}>
                    {dataInfo?.type}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">Location:</span>
                  <span className={
                    dataInfo?.inWorker ? 'text-purple-400' : 
                    dataInfo?.serialized ? 'text-cyan-400' : 'text-green-400'
                  }>
                    {dataInfo?.inWorker ? '⚡ Worker (no serialization)' : 
                     dataInfo?.serialized ? '📦 Serialized (crossed boundary)' : 
                     '💾 Main thread'}
                  </span>
                </div>
                
                {dataInfo?.size && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">Size:</span>
                    <span className="text-neutral-300">{dataInfo.size}</span>
                  </div>
                )}
                
                <div className="pt-1 border-t border-neutral-800">
                  <span className="text-neutral-500">Preview:</span>
                  <pre className="mt-1 p-1.5 bg-neutral-950 rounded text-[9px] text-neutral-400 overflow-auto max-h-[100px]">
                    {getDataPreview(edgeData, 200)}
                  </pre>
                </div>
                
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-neutral-500">Handle:</span>
                  <span className="text-neutral-400 font-mono">{sourceHandle || 'default'} → {targetHandle || 'default'}</span>
                </div>
              </div>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Type warning/error indicator */}
      {(hasTypeWarning || hasTypeError) && !debugMode && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="flex items-center justify-center cursor-help"
            title={typeValidation.message}
          >
            <div className={`
              p-1 rounded-full border-2 border-neutral-900
              ${hasTypeError ? 'bg-red-500' : 'bg-yellow-500'}
            `}>
              <AlertTriangle className="w-2.5 h-2.5 text-neutral-900" />
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Status indicator at midpoint - only show if no type issues and not in debug mode */}
      {!debugMode && !hasTypeWarning && !hasTypeError && (isReady || isRunning || isError) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="flex items-center justify-center"
          >
            <div
              className={`
                w-3 h-3 rounded-full border-2 border-neutral-900
                transition-all duration-300
                ${isReady ? 'bg-green-500 shadow-lg shadow-green-500/50' : ''}
                ${isRunning ? 'bg-amber-500 animate-pulse shadow-lg shadow-amber-500/50' : ''}
                ${isError ? 'bg-red-500 shadow-lg shadow-red-500/50' : ''}
              `}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

DataEdge.displayName = 'DataEdge';

export default DataEdge;
