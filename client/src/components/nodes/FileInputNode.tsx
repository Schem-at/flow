/**
 * FileInputNode - Universal file input node
 * Supports: schematics, images, CSV, JSON, and other file types
 */

import { memo, useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { 
  Upload, FileUp, Box, Image, FileSpreadsheet, 
  FileText, File, X, Check, Loader2
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { 
  type DataCategory,
  type DataValue,
  detectFormatFromExtension,
  getDataCategory,
  isSchematicData
} from '@flow/core';

interface FileInputNodeData {
  label?: string;
  /** The loaded file data */
  fileData?: DataValue;
  /** Original filename */
  fileName?: string;
  /** Accepted file types filter */
  acceptedTypes?: DataCategory[];
}

// File type configurations
const FILE_CONFIGS: Record<DataCategory, {
  icon: typeof File;
  color: string;
  bg: string;
  accept: string;
  label: string;
}> = {
  schematic: {
    icon: Box,
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    accept: '.litematic,.schematic,.schem,.nbt',
    label: 'Schematic',
  },
  image: {
    icon: Image,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    accept: '.png,.jpg,.jpeg,.gif,.webp,.svg',
    label: 'Image',
  },
  data: {
    icon: FileSpreadsheet,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    accept: '.csv,.json,.xml,.yaml,.yml',
    label: 'Data',
  },
  text: {
    icon: FileText,
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    accept: '.txt,.md',
    label: 'Text',
  },
  binary: {
    icon: File,
    color: 'text-neutral-400',
    bg: 'bg-neutral-500/20',
    accept: '*',
    label: 'File',
  },
};

const FileInputNode = memo(({ id, data, selected }: NodeProps & { data: FileInputNodeData }) => {
  const { selectNode, updateNodeData, setNodeOutput, nodeCache } = useFlowStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cache = nodeCache[id];
  const isReady = cache?.status === 'completed';

  // Determine what types this node accepts
  const acceptedCategories = data.acceptedTypes || ['schematic', 'image', 'data', 'text', 'binary'];
  
  // Get the current file's category
  const fileCategory = data.fileData ? getDataCategory(data.fileData.format) : null;
  const config = fileCategory ? FILE_CONFIGS[fileCategory] : null;

  // Build accept string for file input
  const acceptString = acceptedCategories
    .map(cat => FILE_CONFIGS[cat].accept)
    .join(',');

  const processFile = useCallback(async (file: globalThis.File) => {
    setIsLoading(true);
    
    try {
      const format = detectFormatFromExtension(file.name);
      const category = getDataCategory(format);
      
      // Check if format is accepted
      if (!acceptedCategories.includes(category) && !acceptedCategories.includes('binary')) {
        throw new Error(`File type "${format}" is not accepted by this node`);
      }

      // Read file as appropriate type
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const fileData: DataValue = {
        format,
        data,
        metadata: {
          name: file.name,
          fileSize: file.size,
          mimeType: file.type,
          createdAt: Date.now(),
        },
      };

      updateNodeData(id, { 
        fileData, 
        fileName: file.name 
      });
      
      // Mark node as ready with output
      setNodeOutput(id, { output: fileData });
    } catch (error) {
      console.error('Failed to load file:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, acceptedCategories, updateNodeData, setNodeOutput]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const clearFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, { fileData: undefined, fileName: undefined });
    setNodeOutput(id, { output: undefined, status: 'idle' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [id, updateNodeData, setNodeOutput]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Get appropriate icon
  const Icon = config?.icon || Upload;
  const iconColor = config?.color || 'text-neutral-400';
  const iconBg = config?.bg || 'bg-neutral-500/20';

  return (
    <div
      className={`
        relative min-w-[200px] max-w-[260px] rounded-xl overflow-hidden
        bg-neutral-900/80 backdrop-blur-sm
        border transition-all duration-200
        ${selected 
          ? 'border-orange-500/50 shadow-lg shadow-orange-500/10' 
          : isDragging
            ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
            : isHovered 
              ? 'border-neutral-600/50' 
              : isReady
                ? 'border-green-500/30'
                : 'border-neutral-800/50'
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => selectNode(id)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptString}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-orange-900/30 to-neutral-900/50 border-b border-neutral-800/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${isReady ? 'bg-green-500/20' : iconBg}`}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              ) : isReady ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Icon className={`w-4 h-4 ${iconColor}`} />
              )}
            </div>
            <span className="font-medium text-sm text-white truncate">
              {data.label || 'File Input'}
            </span>
          </div>
          
          {data.fileData && (
            <button
              onClick={clearFile}
              className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Clear file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {data.fileData ? (
          // File loaded - show preview info
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-neutral-800/50 rounded-lg">
              <div className={`p-1.5 rounded ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate font-medium">
                  {data.fileName}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {data.fileData.format} • {formatFileSize(data.fileData.metadata?.fileSize)}
                </div>
              </div>
            </div>
            
            {/* Schematic preview info */}
            {isSchematicData(data.fileData) && data.fileData.metadata?.dimensions && (
              <div className="flex gap-2 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 bg-neutral-800/50 text-neutral-400 rounded border border-neutral-700/30">
                  {data.fileData.metadata.dimensions.x}×{data.fileData.metadata.dimensions.y}×{data.fileData.metadata.dimensions.z}
                </span>
                {data.fileData.metadata.blockCount !== undefined && (
                  <span className="px-2 py-0.5 bg-neutral-800/50 text-neutral-400 rounded border border-neutral-700/30">
                    {data.fileData.metadata.blockCount.toLocaleString()} blocks
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          // No file - show drop zone
          <button
            onClick={openFilePicker}
            className={`
              w-full py-6 px-4 border-2 border-dashed rounded-lg transition-all
              flex flex-col items-center gap-2 nodrag
              ${isDragging 
                ? 'border-blue-500/50 bg-blue-500/10' 
                : 'border-neutral-700/50 hover:border-neutral-600/50 hover:bg-neutral-800/30'
              }
            `}
          >
            <FileUp className={`w-8 h-8 ${isDragging ? 'text-blue-400' : 'text-neutral-500'}`} />
            <div className="text-center">
              <div className="text-xs text-neutral-400">
                {isDragging ? 'Drop file here' : 'Click to upload'}
              </div>
              <div className="text-[10px] text-neutral-600 mt-0.5">
                or drag and drop
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
          isReady ? '!bg-green-500' : '!bg-orange-500'
        }`}
        title="File output"
      />
    </div>
  );
});

FileInputNode.displayName = 'FileInputNode';

// Helper function to format file size
function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default FileInputNode;
