/**
 * FileOutputNode - Universal file output/export node
 * Supports: schematics, images, CSV, JSON, and other file types
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { 
  Download, Save, Box, Image, FileSpreadsheet, 
  FileText, File, Check, Loader2, AlertCircle
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { 
  type DataFormat, 
  type DataCategory,
  type DataValue,
  getDataCategory,
  getExtensionForFormat,
  isDataValue
} from '@flow/core';

interface FileOutputNodeData {
  label?: string;
  /** Custom filename (without extension) */
  customFileName?: string;
  /** Override output format */
  outputFormat?: DataFormat;
}

// File type configurations
const FILE_CONFIGS: Record<DataCategory, {
  icon: typeof File;
  color: string;
  bg: string;
  label: string;
}> = {
  schematic: {
    icon: Box,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/20',
    label: 'Schematic',
  },
  image: {
    icon: Image,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Image',
  },
  data: {
    icon: FileSpreadsheet,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    label: 'Data',
  },
  text: {
    icon: FileText,
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    label: 'Text',
  },
  binary: {
    icon: File,
    color: 'text-neutral-400',
    bg: 'bg-neutral-500/20',
    label: 'File',
  },
};

const FileOutputNode = memo(({ id, data, selected }: NodeProps & { data: FileOutputNodeData }) => {
  const { selectNode, updateNodeData, nodeCache, edges } = useFlowStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Get input data from connected node
  const inputEdge = edges.find(e => e.target === id);
  const sourceCache = inputEdge ? nodeCache[inputEdge.source] : null;
  const inputValue = sourceCache?.output;
  const hasInput = inputEdge && (sourceCache?.status === 'completed' || sourceCache?.status === 'cached') && isDataValue(inputValue);

  // Determine the category of input data
  const inputData = hasInput ? (inputValue as DataValue) : null;
  const dataCategory = inputData ? getDataCategory(inputData.format) : null;
  const config = dataCategory ? FILE_CONFIGS[dataCategory] : null;

  const handleSave = useCallback(async () => {
    if (!inputData) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Get filename
      const baseName = data.customFileName || 
        inputData.metadata?.name?.replace(/\.[^/.]+$/, '') || 
        'output';
      const format = data.outputFormat || inputData.format;
      const extension = getExtensionForFormat(format);
      const fileName = `${baseName}${extension}`;

      // Convert data to blob
      let blob: Blob;
      if (inputData.data instanceof Uint8Array) {
        blob = new Blob([inputData.data as any], { type: getMimeType(format) });
      } else if (typeof inputData.data === 'string') {
        blob = new Blob([inputData.data], { type: getMimeType(format) });
      } else {
        throw new Error('Unsupported data type');
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
  }, [inputData, data.customFileName, data.outputFormat]);

  const Icon = config?.icon || Save;
  const iconColor = config?.color || 'text-cyan-400';
  const iconBg = config?.bg || 'bg-cyan-500/20';

  return (
    <div
      className={`
        relative min-w-[200px] max-w-[260px] rounded-xl overflow-hidden
        bg-neutral-900/80 backdrop-blur-sm
        border transition-all duration-200
        ${selected 
          ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10' 
          : isHovered 
            ? 'border-neutral-600/50' 
            : hasInput
              ? 'border-green-500/30'
              : 'border-neutral-800/50'
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => selectNode(id)}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-cyan-900/30 to-neutral-900/50 border-b border-neutral-800/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${hasInput ? 'bg-green-500/20' : iconBg}`}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : hasInput ? (
                <Icon className={`w-4 h-4 ${iconColor}`} />
              ) : (
                <Save className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <span className="font-medium text-sm text-white truncate">
              {data.label || 'File Output'}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Filename input */}
        <div>
          <label className="text-[10px] text-neutral-500 block mb-1">Filename</label>
          <input
            type="text"
            value={data.customFileName || ''}
            onChange={(e) => updateNodeData(id, { customFileName: e.target.value })}
            placeholder={inputData?.metadata?.name?.replace(/\.[^/.]+$/, '') || 'output'}
            className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500 nodrag"
          />
        </div>

        {/* Input status */}
        {hasInput && inputData ? (
          <div className="flex items-center gap-2 p-2 bg-neutral-800/50 rounded-lg">
            <div className={`p-1.5 rounded ${iconBg}`}>
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white truncate">
                {inputData.metadata?.name || 'Data ready'}
              </div>
              <div className="text-[10px] text-neutral-500">
                {inputData.format} • {formatFileSize(getDataSize(inputData))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-neutral-800/30 rounded-lg text-neutral-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">No input connected</span>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!hasInput || isSaving}
          className={`
            w-full py-2 px-3 rounded-lg text-sm font-medium transition-all
            flex items-center justify-center gap-2 nodrag
            ${hasInput && !isSaving
              ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }
          `}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download
            </>
          )}
        </button>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
          hasInput ? '!bg-green-500' : '!bg-blue-500'
        }`}
        title="Data input"
      />
    </div>
  );
});

FileOutputNode.displayName = 'FileOutputNode';

// Helper functions
function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDataSize(data: DataValue): number | undefined {
  if (data.data instanceof Uint8Array) {
    return data.data.byteLength;
  }
  if (typeof data.data === 'string') {
    return new TextEncoder().encode(data.data).length;
  }
  return data.metadata?.fileSize;
}

function getMimeType(format: DataFormat): string {
  const mimeTypes: Partial<Record<DataFormat, string>> = {
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
}

export default FileOutputNode;
