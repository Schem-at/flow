import { memo, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Handle, Position, type NodeProps, NodeResizeControl, useUpdateNodeInternals } from '@xyflow/react';
import {
  Eye, Box, Hash, Type, ToggleLeft, ArrowRight,
  Image, Table, FileJson, List, Binary, AlertCircle
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useShallow } from 'zustand/react/shallow';
import { NodeContextMenu, NodeContextMenuItem } from './NodeContextMenu';
import {
  isSchematicData,
  isImageData,
  isTabularData,
  type SchematicData,
  type ImageData as CoreImageData,
  type TabularData,
  type DataValue,
  type FlowType,
  type BlockContract
} from '@flow/core';

import SchematicRenderer from '../others/SchematicRenderer';
import { FieldViewer } from '../blocks/viewers';
import { getSharedWorkerClient } from '../../hooks/useLocalExecutor';

// ============================================================================
// Types
// ============================================================================

interface ViewerNodeData {
  label?: string;
  passthrough?: boolean;
  width?: number;
  height?: number;
  isResizable?: boolean;
}

type ValueType =
  | 'null'
  | 'number'
  | 'string'
  | 'boolean'
  | 'array'
  | 'object'
  | 'schematic'
  | 'image'
  | 'table'
  | 'json'
  | 'binary';

// ============================================================================
// Memoized Renderers
// ============================================================================

const MemoizedSchematicRenderer = memo(({ schematic }: { schematic: Uint8Array | ArrayBuffer }) => {
  return (
    <div className="w-full h-full bg-neutral-950 rounded border border-neutral-800 overflow-hidden relative">
      <SchematicRenderer schematic={schematic} />
    </div>
  );
});

const MemoizedImageRenderer = memo(({ data, format }: { data: Uint8Array | string; format: string }) => {
  const src = useMemo(() => {
    if (typeof data === 'string') {
      // Already a data URL or URL
      if (data.startsWith('data:') || data.startsWith('http')) return data;
      // Base64
      return `data:image/${format};base64,${data}`;
    }
    // Uint8Array - convert to blob URL
    const blob = new Blob([data as any], { type: `image/${format}` });
    return URL.createObjectURL(blob);
  }, [data, format]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-950 rounded border border-neutral-800 overflow-hidden">
      <img
        src={src}
        alt="Preview"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}, (prev, next) => {
  if (prev.data === next.data && prev.format === next.format) return true;
  return false;
});

// ============================================================================
// Value Type Detection
// ============================================================================

function getValueType(value: unknown): ValueType {
  if (value === null || value === undefined) return 'null';



  // Check for wrapped data types first
  if (isSchematicData(value)) return 'schematic';

  // Fallback check for schematic-like objects (e.g. from stale cache or cross-realm)
  if (typeof value === 'object' && value !== null) {
    const v = value as any;
    if (v.format && (v.data || v.buffer) &&
      ['litematic', 'schematic', 'schem', 'nbt', 'mock'].includes(v.format)) {
      return 'schematic';
    }
  }

  if (isImageData(value)) return 'image';
  if (isTabularData(value)) return 'table';

  // Check if it's a DataValue with format
  if (typeof value === 'object' && 'format' in (value as object) && 'data' in (value as object)) {
    const dv = value as DataValue;
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(dv.format)) return 'image';
    if (['csv', 'json', 'xml', 'yaml'].includes(dv.format)) return 'table';
    if (['text', 'markdown'].includes(dv.format)) return 'string';
    return 'binary';
  }

  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    return 'object';
  }

  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';

  return 'null';
}

function unwrapValue(rawOutput: unknown): unknown {
  if (!rawOutput || typeof rawOutput !== 'object') return rawOutput;

  // If it's already a known data type, return it
  if (isSchematicData(rawOutput)) return rawOutput;

  // Fallback check for schematic-like objects
  const v = rawOutput as any;
  if (v && v.format && (v.data || v.buffer) &&
    ['litematic', 'schematic', 'schem', 'nbt', 'mock'].includes(v.format)) {
    return rawOutput;
  }

  if (isImageData(rawOutput)) return rawOutput;
  if (isTabularData(rawOutput)) return rawOutput;

  const record = rawOutput as Record<string, unknown>;
  const entries = Object.entries(record);

  // If there's a 'default' key, prefer that
  if ('default' in record) {
    const defaultVal = record['default'];
    if (defaultVal !== undefined && defaultVal !== null) {
      return defaultVal;
    }
  }

  // Check if it's an object with a single output value
  if (entries.length === 1) {
    const [, value] = entries[0];
    return value;
  }

  // Check for known data types in values (prioritize finding schematic/image/table)
  for (const [, value] of entries) {
    if (isSchematicData(value) || isImageData(value) || isTabularData(value)) {
      return value;
    }
    // Fallback check for schematic-like objects in nested values
    const v = value as any;
    if (v && v.format && (v.data || v.buffer) &&
      ['litematic', 'schematic', 'schem', 'nbt', 'mock'].includes(v.format)) {
      return value;
    }
  }

  return rawOutput;
}

// ============================================================================
// Type Icons
// ============================================================================

function getTypeIcon(valueType: ValueType) {
  switch (valueType) {
    case 'number': return Hash;
    case 'string': return Type;
    case 'boolean': return ToggleLeft;
    case 'schematic': return Box;
    case 'image': return Image;
    case 'table': return Table;
    case 'array': return List;
    case 'object':
    case 'json': return FileJson;
    case 'binary': return Binary;
    default: return Eye;
  }
}

function getTypeColor(valueType: ValueType) {
  switch (valueType) {
    case 'number': return 'text-blue-400';
    case 'string': return 'text-green-400';
    case 'boolean': return 'text-amber-400';
    case 'schematic': return 'text-pink-400';
    case 'image': return 'text-purple-400';
    case 'table': return 'text-cyan-400';
    case 'array': return 'text-orange-400';
    case 'object':
    case 'json': return 'text-yellow-400';
    default: return 'text-neutral-400';
  }
}

// ============================================================================
// Preview Renderers
// ============================================================================

function NumberPreview({ value }: { value: number }) {
  return (
    <div className="text-center py-4">
      <div className="text-3xl font-mono font-bold text-blue-400">
        {value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">number</div>
    </div>
  );
}

function StringPreview({ value }: { value: string }) {
  const lines = value.split('\n');
  const isMultiline = lines.length > 1;

  return (
    <div className="py-2">
      <div className="text-xs font-mono text-green-400 break-all max-h-32 overflow-y-auto whitespace-pre-wrap bg-neutral-900/50 rounded p-2">
        {value.slice(0, 500)}{value.length > 500 ? '...' : ''}
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">
        string • {value.length} chars{isMultiline ? ` • ${lines.length} lines` : ''}
      </div>
    </div>
  );
}

function BooleanPreview({ value }: { value: boolean }) {
  return (
    <div className="text-center py-4">
      <div className={`text-2xl font-mono font-bold ${value ? 'text-green-400' : 'text-red-400'}`}>
        {value ? 'true' : 'false'}
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">boolean</div>
    </div>
  );
}

function ArrayPreview({ value }: { value: unknown[] }) {
  // Check if it's a simple array (numbers, strings) or complex
  const isSimple = value.every(item =>
    typeof item === 'number' || typeof item === 'string' || typeof item === 'boolean'
  );

  // Check if it might be tabular data (array of objects with same keys)
  const isTabular = value.length > 0 &&
    value.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));

  if (isTabular && value.length > 0) {
    const columns = Object.keys(value[0] as object);
    return (
      <div className="py-2 overflow-auto max-h-48">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="border-b border-neutral-700">
              {columns.slice(0, 5).map((col, i) => (
                <th key={i} className="px-2 py-1 text-left text-neutral-400 font-medium">
                  {col}
                </th>
              ))}
              {columns.length > 5 && <th className="px-2 py-1 text-neutral-500">...</th>}
            </tr>
          </thead>
          <tbody>
            {value.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-b border-neutral-800/50">
                {columns.slice(0, 5).map((col, j) => (
                  <td key={j} className="px-2 py-1 text-neutral-300 truncate max-w-[80px]">
                    {String((row as Record<string, unknown>)[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-neutral-500 mt-2 px-2">
          {value.length} rows × {columns.length} columns
        </div>
      </div>
    );
  }

  if (isSimple) {
    return (
      <div className="py-2">
        <div className="text-xs font-mono text-orange-400 bg-neutral-900/50 rounded p-2 max-h-32 overflow-y-auto">
          [{value.slice(0, 20).map((item, i) => (
            <span key={i}>
              <span className={typeof item === 'number' ? 'text-blue-400' : typeof item === 'string' ? 'text-green-400' : 'text-amber-400'}>
                {typeof item === 'string' ? `"${item}"` : String(item)}
              </span>
              {i < Math.min(value.length - 1, 19) ? ', ' : ''}
            </span>
          ))}
          {value.length > 20 && <span className="text-neutral-500">...+{value.length - 20}</span>}]
        </div>
        <div className="text-[10px] text-neutral-500 mt-1">array • {value.length} items</div>
      </div>
    );
  }

  // Complex array
  return (
    <div className="py-2">
      <pre className="text-[10px] text-neutral-300 font-mono bg-neutral-900/50 rounded p-2 max-h-32 overflow-y-auto">
        {JSON.stringify(value.slice(0, 5), null, 2)}
        {value.length > 5 && `\n... +${value.length - 5} more items`}
      </pre>
      <div className="text-[10px] text-neutral-500 mt-1">array • {value.length} items</div>
    </div>
  );
}

function ObjectPreview({ value }: { value: object }) {
  const keys = Object.keys(value);
  const str = JSON.stringify(value, null, 2);

  return (
    <div className="py-2">
      <pre className="text-[10px] text-neutral-300 font-mono bg-neutral-900/50 rounded p-2 max-h-32 overflow-y-auto">
        {str.slice(0, 500)}
        {str.length > 500 && '...'}
      </pre>
      <div className="text-[10px] text-neutral-500 mt-1">object • {keys.length} keys</div>
    </div>
  );
}

function TablePreview({ value }: { value: TabularData | DataValue }) {
  // Parse CSV if needed
  let rows: string[][] = [];
  let headers: string[] = [];

  let content = '';
  if (typeof value.data === 'string') {
    content = value.data;
  } else if (value.data instanceof Uint8Array) {
    content = new TextDecoder().decode(value.data);
  }

  if (content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      // Detect delimiter
      const firstLine = lines[0];
      const delimiters = [',', ';', '\t', '|'];
      let bestDelimiter = ',';
      let maxCount = 0;

      for (const d of delimiters) {
        const count = firstLine.split(d).length;
        if (count > maxCount) {
          maxCount = count;
          bestDelimiter = d;
        }
      }

      headers = firstLine.split(bestDelimiter).map(h => h.trim());
      rows = lines.slice(1).map(line => line.split(bestDelimiter).map(c => c.trim()));
    }
  }

  return (
    <div className="py-2 overflow-auto max-h-48">
      <table className="w-full text-[10px] font-mono border-collapse">
        <thead>
          <tr className="bg-neutral-800/50">
            {headers.slice(0, 6).map((col, i) => (
              <th key={i} className="px-2 py-1 text-left text-cyan-400 font-medium border border-neutral-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-neutral-900/30' : ''}>
              {row.slice(0, 6).map((cell, j) => (
                <td key={j} className="px-2 py-1 text-neutral-300 border border-neutral-800 truncate max-w-[100px]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-neutral-500 mt-2 px-1">
        {String(value.metadata?.rowCount ?? rows.length)} rows × {String(value.metadata?.columnCount ?? headers.length)} columns
        {value.format && ` • ${value.format}`}
      </div>
    </div>
  );
}

function ImagePreview({ value, isExecuting }: { value: CoreImageData; isExecuting: boolean }) {
  const binaryData = value.data instanceof Uint8Array ? value.data : value.data;

  return (
    <div className="flex flex-col h-full w-full relative">
      {isExecuting && (
        <div className="absolute inset-0 bg-neutral-900/60 z-10 flex items-center justify-center rounded">
          <div className="text-xs text-neutral-400 animate-pulse">Updating...</div>
        </div>
      )}
      <div className="flex-1 min-h-0 w-full">
        <MemoizedImageRenderer data={binaryData} format={value.format} />
      </div>
      <div className="text-center mt-2 flex-shrink-0">
        <div className="text-xs text-neutral-300 font-medium">{value.metadata?.name || 'Image'}</div>
        <div className="text-[10px] text-neutral-500">
          {value.format.toUpperCase()}
          {value.metadata?.width && value.metadata?.height && ` • ${value.metadata.width}×${value.metadata.height}`}
        </div>
      </div>
    </div>
  );
}

function SchematicPreview({ value, isExecuting }: { value: SchematicData; isExecuting: boolean }) {
  const binaryData = value.data instanceof Uint8Array
    ? value.data
    : new TextEncoder().encode(value.data as string);

  return (
    <div className="flex flex-col h-full w-full relative">
      {isExecuting && (
        <div className="absolute inset-0 bg-neutral-900/60 z-10 flex items-center justify-center rounded">
          <div className="text-xs text-neutral-400 animate-pulse">Updating...</div>
        </div>
      )}
      <div className="flex-1 min-h-0 w-full">
        <MemoizedSchematicRenderer schematic={binaryData} />
      </div>
      <div className="text-center mt-2 flex-shrink-0">
        <div className="text-xs text-neutral-300 font-medium">{value.metadata?.name || 'Schematic'}</div>
        <div className="text-[10px] text-neutral-500">
          {value.format} • {binaryData.byteLength.toLocaleString()} bytes
        </div>
      </div>
    </div>
  );
}

function BinaryPreview({ value }: { value: DataValue }) {
  const size = value.data instanceof Uint8Array
    ? value.data.byteLength
    : (typeof value.data === 'string' ? value.data.length : 0);

  return (
    <div className="text-center py-4">
      <Binary className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
      <div className="text-xs text-neutral-400">{value.format.toUpperCase()}</div>
      <div className="text-[10px] text-neutral-500 mt-1">{size.toLocaleString()} bytes</div>
    </div>
  );
}

// ============================================================================
// Main ViewerNode Component
// ============================================================================

const ViewerNode = memo(({ id, data, selected, width, height }: NodeProps & { data: ViewerNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const setNodeOutput = useFlowStore((state) => state.setNodeOutput);

  // Optimized selector to only re-render when relevant data changes
  const { viewerCache, sourceCache, inputEdge, upstreamType } = useFlowStore(useShallow((state) => {
    const inputEdge = state.edges.find(e => e.target === id);
    // The upstream port's FlowType drives the typed viewer (lists of
    // schematics → gallery, list of objects → table, image → canvas, …).
    let upstreamType: FlowType | null = null;
    if (inputEdge) {
      const sourceNode = state.nodes.find(n => n.id === inputEdge.source);
      const contract = (sourceNode?.data as { contract?: BlockContract } | undefined)?.contract;
      if (contract) {
        if (inputEdge.sourceHandle && contract.outputs[inputEdge.sourceHandle]) {
          upstreamType = contract.outputs[inputEdge.sourceHandle];
        } else {
          const outputs = Object.values(contract.outputs);
          if (outputs.length === 1) upstreamType = outputs[0];
        }
      }
    }
    const viewerCache = state.nodeCache[id];
    const sourceCache = inputEdge ? state.nodeCache[inputEdge.source] : null;

    return { viewerCache, sourceCache, inputEdge, upstreamType };
  }));

  const [isHovered, setIsHovered] = useState(false);

  // Cache for persistence during re-execution
  const lastValueRef = useRef<unknown>(null);

  const isResized = !!((width && height) || (data.width && data.height));
  const currentWidth = width || data.width;
  const currentHeight = height || data.height;

  // Use viewer's own output if it has been executed (contains serialized data)
  // Otherwise fall back to source cache (for passthrough display before execution)
  // We prefer fresh data, but if everything is stale, we prefer the viewer's unwrapped cache
  const viewerIsFresh = viewerCache?.status === 'completed' || viewerCache?.status === 'cached';
  const sourceIsFresh = sourceCache?.status === 'completed' || sourceCache?.status === 'cached';

  let rawOutput;
  if (viewerIsFresh && viewerCache?.output) {
    rawOutput = viewerCache.output;
  } else if (sourceIsFresh && sourceCache?.output) {
    rawOutput = sourceCache.output;
  } else {
    // Both are stale or missing - prefer viewer cache as it's already unwrapped
    // If we have a lastValueRef, use that to prevent flickering during re-execution
    rawOutput = viewerCache?.output ?? sourceCache?.output ?? lastValueRef.current;
  }

  const viewerHasOutput = !!viewerCache?.output;
  const sourceHasOutput = !!sourceCache?.output;
  const hasInput = !!inputEdge && (viewerHasOutput || sourceHasOutput || !!lastValueRef.current);
  const isExecuting = sourceCache?.status === 'running' || sourceCache?.status === 'pending' || viewerCache?.status === 'running';

  // Unwrap and process the value
  const inputValue = useMemo(() => unwrapValue(rawOutput), [rawOutput]);

  // Update cache ref when we have valid input
  if (inputValue !== undefined && inputValue !== null) {
    // Don't cache handles as valid values
    const isHandle = typeof inputValue === 'object' && '_schematicHandle' in (inputValue as any);
    if (!isHandle) {
      lastValueRef.current = inputValue;
    }
  }

  // Display value (use cached if current is undefined)
  // During execution, we want to keep showing the last valid value until new data arrives
  // We also check if the new value is "null" or "undefined" which might happen during transition
  // We also check if it's a handle (intermediate state)
  const isHandle = inputValue && typeof inputValue === 'object' && '_schematicHandle' in (inputValue as any);
  const displayValue = (isExecuting || inputValue === undefined || inputValue === null || isHandle) 
    ? lastValueRef.current 
    : inputValue;
    
  const valueType = displayValue !== null && displayValue !== undefined
    ? getValueType(displayValue)
    : 'null';

  const passthrough = data.passthrough ?? false;

  // Update viewer's output cache when passthrough is enabled and we have input
  // This makes the output available to downstream nodes
  useEffect(() => {
    if (passthrough && hasInput && inputValue !== undefined) {
      // Store the output in the viewer's cache so downstream nodes can access it
      setNodeOutput(id, { output: inputValue });
    }
  }, [passthrough, hasInput, inputValue, id, setNodeOutput]);

  const togglePassthrough = useCallback(() => {
    updateNodeData(id, { passthrough: !passthrough });
  }, [id, passthrough, updateNodeData]);

  const handleResizeEnd = useCallback((_event: any, params: { width: number; height: number }) => {
    updateNodeData(id, { width: params.width, height: params.height });
  }, [id, updateNodeData]);

  // Re-anchor edges/handles after the node's dimensions change. Measure after
  // layout has applied (double rAF), or React Flow caches the old position.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => updateNodeInternals(id));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [id, currentWidth, currentHeight, updateNodeInternals]);

  const TypeIcon = getTypeIcon(valueType);
  const typeColor = getTypeColor(valueType);

  // Resolves resident-schematic handles against the shared worker.
  const getHandleData = useCallback(
    (handleId: string) => getSharedWorkerClient().getData(handleId),
    []
  );

  const renderPreview = () => {
    // No input connected and no cached value
    if (!hasInput && displayValue === null) {
      return (
        <div className="text-center text-neutral-500 py-6">
          <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div className="text-xs">No input connected</div>
        </div>
      );
    }

    // Waiting for data
    if (displayValue === undefined || displayValue === null) {
      return (
        <div className="text-center text-neutral-500 py-6">
          <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div className="text-xs">Waiting for data...</div>
        </div>
      );
    }

    // Typed rendering: when the upstream port declares a FlowType, recurse
    // through the registry viewers (schematic gallery, table, image, tree…).
    // Plain schematics keep the node's own resizable preview path below.
    if (usingTypedViewer && upstreamType) {
      return (
        <div
          className={`nowheel nodrag overflow-auto pr-1 ${
            isResized ? 'h-full' : 'max-h-[360px]'
          }`}
        >
          <FieldViewer type={upstreamType} value={displayValue} getData={getHandleData} />
        </div>
      );
    }

    // Render based on type
    switch (valueType) {
      case 'number':
        return <NumberPreview value={displayValue as number} />;

      case 'string':
        return <StringPreview value={displayValue as string} />;

      case 'boolean':
        return <BooleanPreview value={displayValue as boolean} />;

      case 'array':
        return <ArrayPreview value={displayValue as unknown[]} />;

      case 'object':
        return <ObjectPreview value={displayValue as object} />;

      case 'schematic':
        return <SchematicPreview value={displayValue as SchematicData} isExecuting={isExecuting} />;

      case 'image':
        return <ImagePreview value={displayValue as CoreImageData} isExecuting={isExecuting} />;

      case 'table':
        return <TablePreview value={displayValue as TabularData} />;

      case 'binary':
        return <BinaryPreview value={displayValue as DataValue} />;

      default:
        return (
          <div className="text-center py-4 text-neutral-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-1" />
            <div className="text-xs">Unknown type</div>
          </div>
        );
    }
  };

  // Check if this is a "full height" type that needs special container
  const isFullHeightType = valueType === 'schematic' || valueType === 'image';

  // Typed registry rendering applies to everything except plain schematics
  // (which keep the node's dedicated preview) and unknown.
  const usingTypedViewer = !!(
    upstreamType &&
    upstreamType.kind !== 'schematic' &&
    upstreamType.kind !== 'unknown'
  );

  return (
    <>
      {/* Always-available bottom-right resize grabber */}
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
        onResize={() => updateNodeInternals(id)}
        onResizeEnd={handleResizeEnd}
        style={{ background: 'transparent', border: 'none' }}
      >
        <div
          className={`pointer-events-none absolute bottom-1 right-1 h-3 w-3 rounded-br border-b-2 border-r-2 transition-colors ${
            selected || isHovered ? 'border-pink-400' : 'border-neutral-600'
          }`}
        />
      </NodeResizeControl>
      <div
        className={`
          relative rounded-xl overflow-visible
          bg-neutral-900 flex flex-col
          border transition-colors duration-200 group
          ${isResized
            ? 'w-full h-full'
            : upstreamType && upstreamType.kind === 'list'
              ? 'min-w-[320px] max-w-[440px]'
              : 'min-w-[180px] max-w-[280px]'}
          ${selected
            ? 'border-pink-500/50 shadow-lg shadow-pink-500/10'
            : isHovered
              ? 'border-neutral-600/50'
              : hasInput
                ? 'border-green-500/30'
                : 'border-neutral-800/50'
          }
        `}
        style={isResized ? { width: currentWidth, height: currentHeight } : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => selectNode(id)}
      >
        {/* Header */}
        <div className="px-3 py-2.5 bg-gradient-to-r from-pink-900/30 to-neutral-900/50 border-b border-neutral-800/50 rounded-t-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex items-center justify-center w-6 h-6 rounded-lg ${hasInput ? 'bg-green-500/20' : 'bg-pink-500/20'
                }`}>
                {hasInput ? (
                  <TypeIcon className={`w-3.5 h-3.5 ${typeColor}`} />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-pink-400" />
                )}
              </div>
              <span className="font-medium text-xs text-white truncate">
                {data.label || 'Viewer'}
              </span>
              {hasInput && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${typeColor} bg-neutral-800/50`}>
                  {valueType}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Passthrough toggle */}
              <button
                onClick={togglePassthrough}
                className={`
                  p-1 rounded transition-colors flex items-center gap-1
                  ${passthrough
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                  }
                `}
                title={passthrough ? 'Output enabled (click to disable)' : 'Click to enable output relay'}
              >
                <ArrowRight className="w-3 h-3" />
              </button>

              {/* Context Menu */}
              <NodeContextMenu>
                <NodeContextMenuItem
                  icon={ArrowRight}
                  onClick={togglePassthrough}
                  checked={passthrough}
                >
                  Passthrough
                </NodeContextMenuItem>
              </NodeContextMenu>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className={`${
            isResized || isFullHeightType
              ? 'flex-1 min-h-0 p-0'
              : usingTypedViewer
                ? 'flex-1 min-h-0 p-2'
                : 'p-3'
          }`}
        >
          {renderPreview()}
        </div>

        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{ left: '-11px', top: '50%', transform: 'translateY(-50%)' }}
          className={`!w-3 !h-3 !border-2 !border-neutral-900 ${hasInput ? '!bg-green-500' : '!bg-blue-500'
            }`}
          title="Data input"
        />

        {/* Output Handle (only if passthrough enabled) */}
        {passthrough && (
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            style={{ right: '-11px', top: '50%', transform: 'translateY(-50%)' }}
            className={`!w-3 !h-3 !border-2 !border-neutral-900 ${hasInput ? '!bg-green-500' : '!bg-amber-500'
              }`}
            title="Data output (passthrough)"
          />
        )}
      </div>
    </>
  );
});

ViewerNode.displayName = 'ViewerNode';

export default ViewerNode;
