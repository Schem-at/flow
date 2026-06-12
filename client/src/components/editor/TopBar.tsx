import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Play, 
  Zap, 
  Save, 
  FolderOpen, 
  ChevronDown, 
  Menu, 
  Undo2, 
  Redo2, 
  Maximize2, 
  Grid3X3, 
  Eye, 
  Trash2, 
  RefreshCw,
  Terminal,
  Globe,
  Loader2,
  Download,
  Search,
  Settings,
  ExternalLink,
  Package,
} from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

interface FlowListItem {
  id: string;
  name: string;
  updatedAt: number;
}

interface TopBarProps {
  isMobile: boolean;
  onRun: () => void;
  onRunStale: () => void;
  isExecuting: boolean;
  hasStaleNodes: boolean;
  staleCount: number;
  completedCount: number;
  totalNodes: number;
  onClearCache: () => void;
  onShowFlowManager: () => void;
  onShowExecution: () => void;
  onShowApiPanel: () => void;
  onShowShortcuts: () => void;
  onShowSettings: () => void;
  snapToGrid: boolean;
  setSnapToGrid: (snap: boolean) => void;
  onZoomToFit: () => void;
  onToggleMobileMenu?: () => void;
}

export function TopBar({
  isMobile,
  onRun,
  onRunStale,
  isExecuting,
  hasStaleNodes,
  staleCount,
  completedCount,
  totalNodes,
  onClearCache,
  onShowFlowManager,
  onShowExecution,
  onShowApiPanel,
  onShowShortcuts,
  onShowSettings,
  snapToGrid,
  setSnapToGrid,
  onZoomToFit,
  onToggleMobileMenu,
}: TopBarProps) {
  const { 
    flowName, 
    setFlowName, 
    flowId, 
    setFlowId, 
    exportFlow, 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    debugMode, 
    toggleDebugMode,
    executionSettings,
    setExecutionMode
  } = useFlowStore();

  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(flowName);
  const [showRunMenu, setShowRunMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setTempName(flowName);
  }, [flowName]);

  const handleNameSubmit = () => {
    if (tempName.trim()) {
      setFlowName(tempName.trim());
    } else {
      setTempName(flowName);
    }
    setIsEditingName(false);
  };

  // Fetch flows for the menu
  const { data: flowsData } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => {
      const res = await fetch(`${SERVER_URL}/api/flows`, { credentials: 'include' });
      const json = await res.json();
      return (json.flows || []) as FlowListItem[];
    },
    enabled: showFileMenu,
  });

  const filteredFlows = useMemo(() => {
    if (!flowsData) return [];
    if (!searchQuery) return flowsData;
    return flowsData.filter(flow => 
      flow.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [flowsData, searchQuery]);

  // Save mutation with safety check
  const saveMutation = useMutation({
    mutationFn: async () => {
      const flowData = exportFlow();
      
      // Safety check: Don't overwrite existing flow with empty nodes
      if (flowId && flowData.nodes.length === 0) {
         console.warn("Attempting to save empty flow over existing flow. Aborting to prevent data loss.");
         throw new Error("Safety Lock: Cannot save empty flow over existing flow. Please refresh and try again.");
      }

      const method = flowId ? 'PUT' : 'POST';
      const url = flowId 
        ? `${SERVER_URL}/api/flows/${flowId}`
        : `${SERVER_URL}/api/flows`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(flowData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.flow;
    },
    onSuccess: (flow) => {
      setFlowId(flow.id);
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveMutation.mutate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveMutation]);

  /**
   * Fold the whole flow into a single typed block and publish it as a module
   * — it then drops into other flows as one node with the flow's inputs as
   * ports.
   */
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle');
  const handlePublishAsModule = async () => {
    setShowFileMenu(false);
    setPublishState('publishing');
    try {
      const { compileFlow } = await import('@flow/core');
      const { contractToIO } = await import('../../lib/block/io-compat');
      const flowData = exportFlow();
      const folded = compileFlow(flowData as Parameters<typeof compileFlow>[0]);
      const res = await fetch(`${SERVER_URL}/api/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: flowData.name || 'Folded flow',
          code: folded.source,
          io_schema: contractToIO(folded.contract),
          description: `Folded flow (${folded.nodeOrder.length} blocks: ${folded.nodeOrder.join(' → ')})`,
          visibility: 'private',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Module creation failed');
      setPublishState('done');
      setTimeout(() => setPublishState('idle'), 2500);
    } catch (error) {
      console.error('Publish flow as module failed:', error);
      setPublishState('error');
      setTimeout(() => setPublishState('idle'), 4000);
    }
  };

  const handleExportToFile = () => {
    const flowData = exportFlow();
    const json = JSON.stringify(flowData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.polyflow.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowFileMenu(false);
  };

  return (
    <div className="h-14 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between px-4 z-50 relative select-none">
      {/* Publish-as-module status */}
      {publishState !== 'idle' && (
        <div
          className={`absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border px-3 py-1.5 text-xs shadow-lg ${
            publishState === 'error'
              ? 'border-red-500/40 bg-red-950/90 text-red-300'
              : 'border-cyan-500/40 bg-neutral-900/95 text-cyan-300'
          }`}
        >
          {publishState === 'publishing' && 'Folding flow & publishing module…'}
          {publishState === 'done' && '✓ Published as module — find it in the Modules tab'}
          {publishState === 'error' && 'Publishing failed — see console'}
        </div>
      )}

      {/* Left: Logo & Flow Info */}
      <div className="flex items-center gap-4">
        {isMobile && (
          <button
            onClick={onToggleMobileMenu}
            className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <Link 
          to="/" 
          className="flex items-center gap-2 group focus:outline-none mr-2"
          aria-label="Go to homepage"
        >
          <div className="relative w-7 h-7 flex items-center justify-center">
            <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full relative z-10">
              <rect x="24" y="24" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="24" y="48" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="48" y="24" width="16" height="16" rx="4" className="fill-neutral-800" />
              <rect x="72" y="24" width="16" height="16" rx="4" className="fill-green-500/20 stroke-green-500" strokeWidth="1.5" />
              <path d="M40 32 H48 M64 32 H72 M40 56 H48 M32 40 V48" className="stroke-neutral-700" strokeWidth="2" />
            </svg>
          </div>
        </Link>

        <div className="h-5 w-px bg-white/10" />

        {/* Flow Name & Menus */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                className="bg-transparent text-sm font-medium text-white focus:outline-none border-b border-green-500 min-w-[150px]"
                autoFocus
              />
            ) : (
              <button 
                onClick={() => setIsEditingName(true)}
                className="text-sm font-medium text-white hover:text-green-400 transition-colors text-left truncate max-w-[200px]"
              >
                {flowName}
              </button>
            )}
          </div>
          
          {/* Menu Bar */}
          <div className="flex items-center gap-1 -ml-2">
            {/* File Menu */}
            <div className="relative group">
              <button 
                onClick={() => setShowFileMenu(!showFileMenu)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${showFileMenu ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
              >
                File
              </button>
              {showFileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowFileMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-72 bg-[#0a0a0a] border border-neutral-800 rounded-lg shadow-2xl z-50 py-1 overflow-hidden">
                    <div className="px-3 py-2 border-b border-neutral-800 mb-1">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          placeholder="Search flows..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 pl-7 text-xs text-white focus:outline-none focus:border-neutral-700 placeholder:text-neutral-600"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredFlows.length > 0 ? (
                        <>
                          <div className="px-3 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Recent Flows</div>
                          {filteredFlows.map(flow => (
                            <button
                              key={flow.id}
                              onClick={() => {
                                navigate(`/editor/${flow.id}`);
                                setShowFileMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center justify-between group/item transition-colors"
                            >
                              <div className="flex flex-col overflow-hidden">
                                <span className="truncate">{flow.name}</span>
                                <span className="text-[10px] text-neutral-600 truncate">
                                  Updated {new Date(flow.updatedAt || Date.now()).toLocaleDateString()}
                                </span>
                              </div>
                              {flow.id === flowId && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 ml-2" />}
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="px-3 py-4 text-center text-xs text-neutral-500">
                          {searchQuery ? 'No flows found' : 'No saved flows'}
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-neutral-800 my-1" />
                    
                    <button onClick={() => { onShowFlowManager(); setShowFileMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors">
                      <FolderOpen className="w-4 h-4" /> Manage Flows...
                    </button>
                    <button onClick={() => { saveMutation.mutate(); setShowFileMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 justify-between transition-colors">
                      <span className="flex items-center gap-2"><Save className="w-4 h-4" /> Save</span>
                      <span className="text-xs text-neutral-600 font-mono">⌘S</span>
                    </button>
                    <button onClick={handleExportToFile} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors">
                      <Download className="w-4 h-4" /> Export JSON
                    </button>
                    <button
                      onClick={handlePublishAsModule}
                      className="w-full text-left px-3 py-2 text-sm text-cyan-300 hover:bg-neutral-800 hover:text-cyan-200 flex items-center gap-2 transition-colors"
                      title="Fold the whole flow into one typed block and publish it as a reusable module"
                    >
                      <Package className="w-4 h-4" /> Publish flow as module
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* View Menu */}
            <div className="relative">
              <button 
                onClick={() => setShowViewMenu(!showViewMenu)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${showViewMenu ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
              >
                View
              </button>
              {showViewMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowViewMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-48 bg-[#0a0a0a] border border-neutral-800 rounded-lg shadow-xl z-50 py-1">
                    <button onClick={() => { onZoomToFit(); setShowViewMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors">
                      <Maximize2 className="w-4 h-4" /> Zoom to Fit
                    </button>
                    <button onClick={() => { setSnapToGrid(!snapToGrid); setShowViewMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors">
                      <Grid3X3 className={`w-4 h-4 ${snapToGrid ? 'text-green-400' : ''}`} /> Snap to Grid
                    </button>
                    <button onClick={() => { toggleDebugMode(); setShowViewMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors">
                      <Eye className={`w-4 h-4 ${debugMode ? 'text-green-400' : ''}`} /> Debug Mode
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <button onClick={onShowShortcuts} className="px-3 py-1 text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              Help
            </button>
          </div>
        </div>
      </div>

      {/* Center: Toolbar Actions (Undo/Redo/etc) - Desktop Only */}
      {!isMobile && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-neutral-900/50 p-1 rounded-lg border border-white/5">
          <button onClick={undo} disabled={!canUndo()} className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 transition-colors" title="Undo">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={!canRedo()} className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 transition-colors" title="Redo">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={() => setExecutionMode(executionSettings.mode === 'live' ? 'manual' : 'live')} className={`p-1.5 rounded hover:bg-white/10 transition-colors ${executionSettings.mode === 'live' ? 'text-amber-400 bg-amber-500/10' : 'text-neutral-400 hover:text-white'}`} title="Live Mode">
            <Zap className="w-4 h-4" />
          </button>
          <button onClick={onShowExecution} className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors" title="Console">
            <Terminal className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Right: Run & Save Actions */}
      <div className="flex items-center gap-3">
        {/* Status Indicator */}
        {!isMobile && totalNodes > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/50 border border-white/5 text-xs">
            <div className={`w-2 h-2 rounded-full ${hasStaleNodes ? 'bg-amber-500' : completedCount === totalNodes ? 'bg-green-500' : 'bg-neutral-500'}`} />
            <span className="text-neutral-400">
              {completedCount}/{totalNodes}
              {hasStaleNodes && <span className="text-amber-500 ml-1">({staleCount} stale)</span>}
            </span>
            {completedCount > 0 && (
              <button onClick={onClearCache} className="ml-1 hover:text-white transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Settings Button */}
        {/* Tool View */}
        {flowId && (
          <Link
            to={`/run/${flowId}`}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Open as tool"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Tool</span>
          </Link>
        )}

        <button
          onClick={onShowSettings}
          className="hidden sm:flex p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          title="Flow Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Save Button */}
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          title="Save Flow (⌘S)"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Save</span>
        </button>

        {/* Run Button Group */}
        <div className="flex items-center rounded-lg bg-green-600 p-0.5">
          <button
            onClick={onRun}
            disabled={isExecuting}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 rounded-md transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>
          <div className="w-px h-4 bg-green-700 mx-0.5" />
          <div className="relative">
            <button
              onClick={() => setShowRunMenu(!showRunMenu)}
              disabled={isExecuting}
              className="p-1.5 text-white hover:bg-green-500 rounded-md transition-colors disabled:opacity-50"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            
            {showRunMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowRunMenu(false)} />
                <div className="absolute top-full right-0 mt-2 w-56 bg-[#0a0a0a] border border-neutral-800 rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => { onRun(); setShowRunMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                  >
                    <Play className="w-4 h-4 text-green-400" />
                    <div className="text-left">
                      <div className="font-medium">Run All</div>
                      <div className="text-xs text-neutral-500">Execute entire flow</div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => { onRunStale(); setShowRunMenu(false); }}
                    disabled={!hasStaleNodes}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                    <div className="text-left">
                      <div className="font-medium">Run Stale Only</div>
                      <div className="text-xs text-neutral-500">
                        {hasStaleNodes ? `${staleCount} node(s) need update` : 'All nodes up to date'}
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* API Button */}
        {!isMobile && flowId && (
          <button
            onClick={onShowApiPanel}
            className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            title="API Settings"
          >
            <Globe className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
