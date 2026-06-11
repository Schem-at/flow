/**
 * SchematicNode - Schematic input/output/viewer nodes
 */

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FolderOpen, Save, Eye, Box } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';

interface SchematicNodeData {
  label?: string;
  schematicType?: 'input' | 'output' | 'viewer';
  fileName?: string;
  dimensions?: { x: number; y: number; z: number };
  blockCount?: number;
}

const SchematicNode = memo(({ id, data, selected, type }: NodeProps & { data: SchematicNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const [isHovered, setIsHovered] = useState(false);
  
  const schematicType = data.schematicType || 
    (type === 'schematic_input' ? 'input' : 
     type === 'schematic_output' ? 'output' : 'viewer');

  const getConfig = () => {
    switch (schematicType) {
      case 'input':
        return {
          gradient: 'from-orange-900/30 to-neutral-900/50',
          borderColor: 'border-orange-500/50',
          shadowColor: 'shadow-orange-500/10',
          iconBg: 'bg-orange-500/20',
          iconColor: 'text-orange-400',
          Icon: FolderOpen,
        };
      case 'output':
        return {
          gradient: 'from-cyan-900/30 to-neutral-900/50',
          borderColor: 'border-cyan-500/50',
          shadowColor: 'shadow-cyan-500/10',
          iconBg: 'bg-cyan-500/20',
          iconColor: 'text-cyan-400',
          Icon: Save,
        };
      default:
        return {
          gradient: 'from-pink-900/30 to-neutral-900/50',
          borderColor: 'border-pink-500/50',
          shadowColor: 'shadow-pink-500/10',
          iconBg: 'bg-pink-500/20',
          iconColor: 'text-pink-400',
          Icon: Eye,
        };
    }
  };

  const config = getConfig();
  const hasInput = schematicType !== 'input';
  const hasOutput = schematicType !== 'viewer';

  return (
    <div
      className={`
        relative min-w-[200px] rounded-xl overflow-hidden
        bg-neutral-900/80 backdrop-blur-sm
        border transition-all duration-200
        ${selected 
          ? `${config.borderColor} shadow-lg ${config.shadowColor}` 
          : isHovered 
            ? 'border-neutral-600/50' 
            : 'border-neutral-800/50'
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => selectNode(id)}
    >
      {/* Header */}
      <div className={`px-4 py-3 bg-gradient-to-r ${config.gradient} border-b border-neutral-800/50`}>
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${config.iconBg}`}>
            <config.Icon className={`w-4 h-4 ${config.iconColor}`} />
          </div>
          <span className="font-medium text-sm text-white truncate">
            {data.label || `${schematicType.charAt(0).toUpperCase() + schematicType.slice(1)}`}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Schematic preview placeholder */}
        <div className="bg-neutral-950/50 rounded-lg aspect-video flex items-center justify-center border border-neutral-800/30">
          <div className="text-center text-neutral-500">
            <Box className="w-8 h-8 mx-auto mb-1 opacity-50" />
            <div className="text-[10px]">
              {data.fileName ? data.fileName : 'No schematic'}
            </div>
          </div>
        </div>

        {/* Metadata */}
        {(data.dimensions || data.blockCount) && (
          <div className="mt-2 flex gap-2 flex-wrap text-[10px]">
            {data.dimensions && (
              <span className="px-2 py-0.5 bg-neutral-800/50 text-neutral-400 rounded border border-neutral-700/30">
                {data.dimensions.x}×{data.dimensions.y}×{data.dimensions.z}
              </span>
            )}
            {data.blockCount !== undefined && (
              <span className="px-2 py-0.5 bg-neutral-800/50 text-neutral-400 rounded border border-neutral-700/30">
                {data.blockCount.toLocaleString()} blocks
              </span>
            )}
          </div>
        )}
      </div>

      {/* Input Handle */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-neutral-900"
          title="Schematic In"
        />
      )}

      {/* Output Handle */}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-amber-500 !border-2 !border-neutral-900"
          title="Schematic Out"
        />
      )}
    </div>
  );
});

SchematicNode.displayName = 'SchematicNode';

export default SchematicNode;
