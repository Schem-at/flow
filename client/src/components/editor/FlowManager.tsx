/**
 * FlowManager - Manage flows from database
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  Clock, 
  FileCode, 
  Loader2, 
  AlertCircle, 
  Upload,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { Modal } from '../ui/Modal';

// Use empty string for dev (Vite proxy handles /api), or VITE_SERVER_URL for production
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface FlowListItem {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

interface FlowManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FlowManager({ isOpen, onClose }: FlowManagerProps) {
  const navigate = useNavigate();
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  
  const { loadFlow, clearFlow, flowId } = useFlowStore();

  // Import flow from file
  const handleImportFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const flowData = JSON.parse(content);
        
        // Validate basic structure
        if (!flowData.nodes || !flowData.edges) {
          throw new Error('Invalid flow file: missing nodes or edges');
        }
        
        // Generate new IDs to avoid conflicts
        const idMap = new Map<string, string>();
        
        // Map old node IDs to new ones
        flowData.nodes.forEach((node: { id: string; type?: string }) => {
          const newId = `${node.type || 'node'}-${crypto.randomUUID().slice(0, 8)}`;
          idMap.set(node.id, newId);
        });
        
        // Update node IDs
        const newNodes = flowData.nodes.map((node: { id: string; [key: string]: unknown }) => ({
          ...node,
          id: idMap.get(node.id) || node.id,
        }));
        
        // Update edge source/target IDs
        const newEdges = flowData.edges.map((edge: { id: string; source: string; target: string; [key: string]: unknown }) => ({
          ...edge,
          id: `edge-${crypto.randomUUID().slice(0, 8)}`,
          source: idMap.get(edge.source) || edge.source,
          target: idMap.get(edge.target) || edge.target,
        }));
        
        // Load the flow with new IDs
        loadFlow({
          ...flowData,
          id: crypto.randomUUID(),
          name: flowData.name || 'Imported Flow',
          version: flowData.version || '1.0.0',
          createdAt: flowData.createdAt || Date.now(),
          nodes: newNodes,
          edges: newEdges,
        });
        
        // Set flowId to null so it's treated as unsaved
        useFlowStore.getState().setFlowId(null);
        
        onClose();
      } catch (err) {
        console.error('Failed to import flow:', err);
        alert('Failed to import flow: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Fetch all flows
  const { data, isLoading, error } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flows as FlowListItem[];
    },
    enabled: isOpen,
  });

  // Create new flow
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          jsonContent: { nodes: [], edges: [] },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      setNewFlowName('');
      setShowNewFlow(false);
      // Load the new flow
      loadFlow({
        id: flow.id,
        name: flow.name,
        version: flow.version || '1.0.0',
        nodes: [],
        edges: [],
        createdAt: new Date(flow.createdAt).getTime(),
        updatedAt: new Date(flow.updatedAt).getTime(),
      });
      useFlowStore.getState().setFlowId(flow.id);
      useFlowStore.getState().setFlowName(flow.name);
      navigate(`/flow/${flow.id}`);
      onClose();
    },
  });

  // Delete a flow
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${SERVER_URL}/api/flows/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return id;
    },
    onSuccess: (id) => {
      if (flowId === id) {
        clearFlow();
      }
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Flow Manager"
      subtitle="Create, load, and manage your flows"
      icon={<FolderOpen className="w-5 h-5" />}
      iconColor="text-blue-400"
      size="lg"
    >
      <div className="p-6">
        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportFromFile}
          accept=".json,.polyflow.json"
          className="hidden"
        />

        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowNewFlow(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
            >
              <Plus className="w-4 h-4" />
              New Flow
            </button>
            
            <div className="h-8 w-px bg-neutral-800 mx-2 hidden sm:block" />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-300 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition-all"
              title="Import from file"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          </div>

          {/* Search / Filter could go here */}
        </div>

        {/* New Flow Input */}
        {showNewFlow && (
          <div className="mb-6 p-4 rounded-xl bg-neutral-900 border border-blue-500/30 animate-in slide-in-from-top-2 duration-200">
            <h3 className="text-sm font-medium text-blue-400 mb-3">Create New Flow</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFlowName}
                onChange={(e) => setNewFlowName(e.target.value)}
                placeholder="Enter flow name..."
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFlowName.trim()) {
                    createMutation.mutate(newFlowName.trim());
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newFlowName.trim()) createMutation.mutate(newFlowName.trim());
                }}
                disabled={!newFlowName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowNewFlow(false);
                  setNewFlowName('');
                }}
                className="px-4 py-2 bg-neutral-800 text-neutral-400 text-sm font-medium rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Flow List */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500/50" />
              <p className="text-sm">Loading flows...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-red-400 gap-3 bg-red-500/5 rounded-xl border border-red-500/10">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">Failed to load flows</p>
            </div>
          ) : data?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-500 gap-4 border-2 border-dashed border-neutral-800 rounded-xl">
              <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center">
                <FolderOpen className="w-8 h-8 opacity-50" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-neutral-300">No flows found</p>
                <p className="text-sm mt-1">Create a new flow to get started</p>
              </div>
              <button
                onClick={() => setShowNewFlow(true)}
                className="mt-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create Flow
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {data?.map((flow) => (
                <div
                  key={flow.id}
                  className={`
                    group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-200
                    ${flow.id === flowId 
                      ? 'bg-blue-500/10 border-blue-500/30 shadow-[0_0_15px_-5px_rgba(59,130,246,0.2)]' 
                      : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/50'
                    }
                  `}
                >
                  <div 
                    className="flex-1 cursor-pointer min-w-0"
                    onClick={() => {
                      if (flow.id !== flowId) {
                        useFlowStore.getState().setFlowId(flow.id);
                        useFlowStore.getState().setFlowName(flow.name);
                        navigate(`/flow/${flow.id}`);
                        onClose();
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className={`font-medium truncate ${flow.id === flowId ? 'text-blue-400' : 'text-neutral-200 group-hover:text-white'}`}>
                        {flow.name}
                      </h3>
                      {flow.id === flowId && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/20">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {formatDate(flow.updatedAt || flow.createdAt)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileCode className="w-3 h-3" />
                        v{flow.version}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete this flow?')) {
                          deleteMutation.mutate(flow.id);
                        }
                      }}
                      className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete flow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

