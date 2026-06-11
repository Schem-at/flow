/**
 * OutputNode - Universal output node for subflows
 * Marks data that should be exposed as an output when the flow is used as a subflow.
 * Can optionally trigger file download if the data supports it.
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { 
  ArrowRightFromLine, Download, Check, Loader2,
  Box, Image, FileSpreadsheet, FileText, Hash, Type, ToggleLeft
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { 
  type DataFormat,
  type DataValue,
  getDataCategory,
  getExtensionForFormat,
  isDataValue
} from '@flow/core';

interface OutputNodeData {
  label?: string;
  /** Description of this output */
  description?: string;
  /** Whether to show download button for file-like data */
  allowDownload?: boolean;
  /** Custom filename for download (without extension) */
  downloadFileName?: string;
}

// Helper to get icon for data type
const getDataIcon = (value: unknown) => {
  if (!value) return ArrowRightFromLine;
  
  // Check if it's a DataValue
  if (isDataValue(value)) {
    const category = getDataCategory((value as DataValue).format);
    switch (category) {
      case 'schematic': return Box;
      case 'image': return Image;
      case 'data': return FileSpreadsheet;
      case 'text': return FileText;
      default: return ArrowRightFromLine;
    }
  }
  
  // Check primitive types
  if (typeof value === 'number') return Hash;
  if (typeof value === 'string') return Type;
  if (typeof value === 'boolean') return ToggleLeft;
  if (Array.isArray(value)) return FileSpreadsheet;
  
  // Check for schematic wrapper (has blockCount, dimensions, etc.)
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('blockCount' in obj || 'dimensions' in obj || 'palette' in obj) {
      return Box;
    }
  }
  
  return ArrowRightFromLine;
};

// Helper to get color for data type
const getDataColor = (value: unknown): { text: string; bg: string; border: string } => {
  if (!value) return { text: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30' };
  
  if (isDataValue(value)) {
    const category = getDataCategory((value as DataValue).format);
    switch (category) {
      case 'schematic': return { text: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/30' };
      case 'image': return { text: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' };
      case 'data': return { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30' };
      case 'text': return { text: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/30' };
      default: return { text: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30' };
    }
  }
  
  if (typeof value === 'number') return { text: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' };
  if (typeof value === 'string') return { text: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/30' };
  if (typeof value === 'boolean') return { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30' };
  
  // Schematic wrapper
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('blockCount' in obj || 'dimensions' in obj) {
      return { text: 'text-pink-400', bg: 'bg-pink-500/20', border: 'border-pink-500/30' };
    }
  }
  
  return { text: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30' };
};

// Helper to get MIME type
const getMimeType = (format: DataFormat): string => {
  const mimeTypes: Record<string, string> = {
    litematic: 'application/octet-stream',
    schematic: 'application/octet-stream',
    schem: 'application/octet-stream',
    nbt: 'application/octet-stream',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    text: 'text/plain',
    markdown: 'text/markdown',
  };
  return mimeTypes[format] || 'application/octet-stream';
};

// Check if data can be downloaded
const canDownload = (value: unknown): boolean => {
  if (isDataValue(value)) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'object' && value !== null) return true;
  return false;
};

const OutputNode = memo(({ id, data, selected }: NodeProps & { data: OutputNodeData }) => {
  const { selectNode, updateNodeData, nodeCache, edges } = useFlowStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [tempLabel, setTempLabel] = useState(data.label || '');

  // Get input data - prefer our own cache (contains serialized data) over source cache
  const inputEdge = edges.find(e => e.target === id);
  const ownCache = nodeCache[id];
  const sourceCache = inputEdge ? nodeCache[inputEdge.source] : null;
  
  // Get the actual value - prefer our own cache (set by Editor with serialized data)
  let inputValue: unknown = null;
  
  // First try our own cache - this has the serialized SchematicData
  if ((ownCache?.status === 'completed' || ownCache?.status === 'cached') && ownCache?.output) {
    const output = ownCache.output as Record<string, unknown>;
    inputValue = output['default'] ?? output['output'] ?? output[Object.keys(output)[0]];
  }
  
  // Fall back to source cache if we don't have our own data
  if (inputValue === null && sourceCache?.output) {
    const output = sourceCache.output as Record<string, unknown>;
    // Try to get value by handle name, then default, then first key
    const handleKey = inputEdge?.sourceHandle || 'default';
    if (handleKey in output) {
      inputValue = output[handleKey];
    } else if ('default' in output) {
      inputValue = output['default'];
    } else {
      const keys = Object.keys(output);
      if (keys.length === 1) {
        inputValue = output[keys[0]];
      } else {
        inputValue = output;
      }
    }
  }
  
  const ownHasOutput = ownCache?.status === 'completed' || ownCache?.status === 'cached';
  const sourceHasOutput = sourceCache?.status === 'completed' || sourceCache?.status === 'cached';
  const hasInput = (ownHasOutput || (inputEdge && sourceHasOutput)) && inputValue !== null;
  const colors = getDataColor(inputValue);
  const Icon = getDataIcon(inputValue);
  const showDownload = data.allowDownload !== false && hasInput && canDownload(inputValue);

  const handleDownload = useCallback(async () => {
    if (!inputValue) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      let blob: Blob;
      let fileName: string;
      
      if (isDataValue(inputValue)) {
        const dataValue = inputValue as DataValue;
        const baseName = data.downloadFileName || dataValue.metadata?.name?.replace(/\.[^/.]+$/, '') || 'output';
        const extension = getExtensionForFormat(dataValue.format);
        fileName = `${baseName}${extension}`;
        
        if (dataValue.data instanceof Uint8Array) {
          blob = new Blob([dataValue.data as any], { type: getMimeType(dataValue.format) });
        } else if (typeof dataValue.data === 'string') {
          // Check if it's base64-encoded binary data (common for schematics)
          const isBinaryFormat = ['litematic', 'schematic', 'schem', 'nbt', 'binary'].includes(dataValue.format);
          if (isBinaryFormat) {
            // Decode base64 to binary
            const binaryString = atob(dataValue.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            blob = new Blob([bytes], { type: getMimeType(dataValue.format) });
          } else {
            // Text data - use as-is
            blob = new Blob([dataValue.data], { type: getMimeType(dataValue.format) });
          }
        } else {
          throw new Error('Unsupported data type');
        }
      } else if (typeof inputValue === 'string') {
        fileName = `${data.downloadFileName || 'output'}.txt`;
        blob = new Blob([inputValue], { type: 'text/plain' });
      } else {
        // JSON export for objects
        fileName = `${data.downloadFileName || 'output'}.json`;
        blob = new Blob([JSON.stringify(inputValue, null, 2)], { type: 'application/json' });
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  }, [inputValue, data.downloadFileName]);

  const handleLabelSave = useCallback(() => {
    updateNodeData(id, { label: tempLabel || 'Output' });
    setIsEditingLabel(false);
  }, [id, tempLabel, updateNodeData]);

  // Get value preview
  const getValuePreview = (): string => {
    if (!inputValue) return 'No data';
    
    if (isDataValue(inputValue)) {
      const dv = inputValue as DataValue;
      return `${dv.format.toUpperCase()} file`;
    }
    
    if (typeof inputValue === 'number') return inputValue.toString();
    if (typeof inputValue === 'string') return inputValue.length > 30 ? inputValue.slice(0, 30) + '...' : inputValue;
    if (typeof inputValue === 'boolean') return inputValue ? 'true' : 'false';
    
    // Schematic wrapper
    if (typeof inputValue === 'object' && inputValue !== null) {
      const obj = inputValue as Record<string, unknown>;
      if ('blockCount' in obj) {
        return `Schematic (${obj.blockCount} blocks)`;
      }
      if (Array.isArray(inputValue)) {
        return `Array [${inputValue.length}]`;
      }
      return `Object {${Object.keys(obj).length} keys}`;
    }
    
    return 'Data';
  };

  return (
    <div
      className={`
        relative min-w-[180px] max-w-[240px] rounded-xl overflow-hidden
        bg-gradient-to-br from-neutral-900 to-neutral-950
        border-2 transition-all duration-200
        ${selected 
          ? `${colors.border.replace('/30', '')} shadow-xl ring-2 ring-cyan-500/30` 
          : isHovered 
            ? 'border-cyan-500/30 shadow-lg' 
            : hasInput
              ? 'border-green-500/30'
              : 'border-neutral-800/50'
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => selectNode(id)}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className={`
          !w-3 !h-3 !border-2 !border-neutral-900 !-left-1.5
          ${hasInput ? '!bg-green-500' : '!bg-neutral-600'}
          transition-all hover:!scale-125
        `}
        title="Input data"
      />

      {/* Header */}
      <div className={`px-3 py-2.5 ${colors.bg} border-b border-neutral-800/50`}>
        <div className="flex items-center gap-2">
          <div className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg ${colors.bg} border ${colors.border}`}>
            <Icon className={`w-4 h-4 ${colors.text}`} />
          </div>
          
          {isEditingLabel ? (
            <input
              type="text"
              value={tempLabel}
              onChange={(e) => setTempLabel(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLabelSave();
                if (e.key === 'Escape') {
                  setTempLabel(data.label || '');
                  setIsEditingLabel(false);
                }
                e.stopPropagation();
              }}
              className="flex-1 bg-neutral-800 text-white text-sm font-medium px-2 py-0.5 rounded border border-neutral-700 focus:outline-none focus:border-cyan-500"
              autoFocus
              placeholder="Output"
            />
          ) : (
            <span 
              className="flex-1 text-sm font-semibold text-white truncate cursor-pointer hover:text-cyan-300"
              onDoubleClick={() => {
                setTempLabel(data.label || '');
                setIsEditingLabel(true);
              }}
              title="Double-click to rename"
            >
              {data.label || 'Output'}
            </span>
          )}
        </div>
        
        {data.description && (
          <p className="text-[10px] text-neutral-500 mt-1 truncate">
            {data.description}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Value preview */}
        <div className={`
          text-xs px-2 py-1.5 rounded-lg
          ${hasInput 
            ? `${colors.bg} ${colors.text}` 
            : 'bg-neutral-800/50 text-neutral-500'
          }
          font-mono truncate
        `}>
          {getValuePreview()}
        </div>
        
        {/* Download button */}
        {showDownload && (
          <button
            onClick={handleDownload}
            disabled={isSaving}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
              text-xs font-medium transition-all
              ${saveSuccess 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20'
              }
              disabled:opacity-50
            `}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved!
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Subflow indicator */}
      <div className="px-3 pb-2">
        <div className="text-[9px] text-neutral-600 text-center">
          Exposed as subflow output
        </div>
      </div>
    </div>
  );
});

OutputNode.displayName = 'OutputNode';

export default OutputNode;
