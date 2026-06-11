/**
 * ExecutionPanel - Shows execution logs, input controls, and schematic download
 * Updates node execution states for visual feedback
 */

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { Play, Trash2, Loader2, CheckCircle, XCircle, AlertTriangle, Terminal, Download, Hash, Type, List } from 'lucide-react';
import { useFlowStore, type FlowNode } from '../../store/flowStore';
import type { IODefinition, IOPort } from '@flow/core';
import { WorkerClient } from '@flow/core/worker';
import { parseExecutionError } from '../../lib/utils';
// @ts-ignore - Import worker directly from source
import Worker from '../../../../packages/core/src/worker/browser.worker.ts?worker';

interface SchematicResult {
  [key: string]: string; // base64 encoded schematic data
}

interface ExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  schematics?: SchematicResult;
  executionTime?: number;
  error?: string;
  logs?: string[];
}

interface ExecutionPanelProps {
  workerClient?: WorkerClient | null;
}

export function ExecutionPanel({ workerClient }: ExecutionPanelProps) {
  const { 
    nodes,
    edges,
    executionLogs, 
    clearExecutionLogs, 
    isExecuting, 
    setIsExecuting,
    addExecutionLog,
    setNodeExecutionStatus,
    setExecutingNodeId,
  } = useFlowStore();

  const [inputValues, setInputValues] = useState<Record<string, unknown>>({});
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const localWorkerClientRef = useRef<WorkerClient | null>(null);

  // Use passed worker client or local one
  const activeWorkerClient = workerClient || localWorkerClientRef.current;

  useEffect(() => {
    // If workerClient is provided via props, we assume the parent handles initialization and listeners
    if (workerClient) return;

    // Initialize local worker if none provided
    const worker = new Worker();
    const client = new WorkerClient({ worker });
    localWorkerClientRef.current = client;

    // Set up event listeners for local worker
    client.on('progress', (payload: any) => {
      if (payload.message) {
        // Clean up log prefix if present
        const message = payload.message.startsWith('Log: ') 
          ? payload.message.substring(5) 
          : payload.message;
        
        // Determine log level/style based on message content or data
        let formattedMessage = message;
        if (payload.data && payload.data.level) {
           // If we have structured log data
           const level = payload.data.level.toUpperCase();
           if (level === 'ERROR') formattedMessage = `[ERROR] ${message}`;
           else if (level === 'WARN') formattedMessage = `[WARN] ${message}`;
           else formattedMessage = `[OK] ${message}`;
        } else if (!message.startsWith('[')) {
           // Add default prefix if none exists
           formattedMessage = `[OK] ${message}`;
        }
        
        addExecutionLog(formattedMessage);
      }
    });

    client.on('error', (error: any) => {
      addExecutionLog(`[ERROR] Worker error: ${error.message || error}`);
    });

    return () => {
      client.destroy();
      localWorkerClientRef.current = null;
    };
  }, [workerClient, addExecutionLog]);

  // Find the first code node to get its IO schema
  const codeNode = useMemo(() => {
    return nodes.find((n): n is FlowNode & { data: { io: IODefinition } } => 
      n.type === 'code' && n.data.io !== undefined
    );
  }, [nodes]);

  // Get input nodes (non-constant ones)
  const inputNodes = useMemo(() => {
    return nodes.filter(n => 
      n.type?.includes('input') && 
      !n.type?.includes('schematic') &&
      !n.data.isConstant
    );
  }, [nodes]);

  const ioSchema = codeNode?.data.io;

  // Initialize default values from schema and input nodes
  useMemo(() => {
    const defaults: Record<string, unknown> = {};
    
    // From IO schema
    if (ioSchema?.inputs) {
      for (const [key, config] of Object.entries(ioSchema.inputs)) {
        if ('default' in config) {
          defaults[key] = config.default;
        }
      }
    }
    
    // Override with connected input nodes' values
    for (const inputNode of inputNodes) {
      const connectedEdge = edges.find(e => e.source === inputNode.id);
      if (connectedEdge?.targetHandle) {
        defaults[connectedEdge.targetHandle] = inputNode.data.value;
      }
    }
    
    setInputValues(prev => ({ ...defaults, ...prev }));
  }, [ioSchema, inputNodes, edges]);

  const handleInputChange = useCallback((key: string, value: unknown) => {
    setInputValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    clearExecutionLogs();
    setLastResult(null);
    addExecutionLog('Starting script execution (local)...');

    try {
      // Find the code node and execute its script directly
      const codeNodes = nodes.filter(n => n.type === 'code');
      
      if (codeNodes.length === 0) {
        addExecutionLog('[ERROR] No code node found');
        setIsExecuting(false);
        return;
      }

      const primaryNode = codeNodes[0];
      const code = primaryNode.data.code;

      if (!code) {
        addExecutionLog('[ERROR] Code node has no script');
        setIsExecuting(false);
        return;
      }

      if (!activeWorkerClient) {
        addExecutionLog('[ERROR] Worker client not initialized');
        setIsExecuting(false);
        return;
      }

      // Mark all nodes as pending
      for (const node of nodes) {
        setNodeExecutionStatus(node.id, 'pending');
      }

      // Mark input nodes as completed immediately
      for (const inputNode of nodes.filter(n => n.type?.includes('input'))) {
        setNodeExecutionStatus(inputNode.id, 'completed', { default: inputNode.data.value });
      }

      // Mark code node as running
      setExecutingNodeId(primaryNode.id);
      setNodeExecutionStatus(primaryNode.id, 'running');

      addExecutionLog(`Executing "${primaryNode.data.label || 'Code'}" with inputs: ${JSON.stringify(inputValues)}`);

      // Execute via worker
      const result = await activeWorkerClient.executeScript(code, inputValues, { timeout: 60000 });
      
      // Process result to match expected format
      const processedSchematics: SchematicResult = {};
      if (result.schematics) {
        for (const [key, value] of Object.entries(result.schematics)) {
           if (value instanceof Uint8Array || (typeof value === 'object' && value !== null && 'buffer' in value)) {
             // Convert Uint8Array to base64
             const bytes = value instanceof Uint8Array ? value : new Uint8Array((value as any).buffer);
             let binary = '';
             const len = bytes.byteLength;
             for (let i = 0; i < len; i++) {
               binary += String.fromCharCode(bytes[i]);
             }
             processedSchematics[key] = btoa(binary);
           } else if (typeof value === 'string') {
             processedSchematics[key] = value;
           }
        }
      }

      const executionResult: ExecutionResult = {
        success: result.success,
        result: result.result,
        schematics: processedSchematics,
        executionTime: result.executionTime,
        error: result.error?.message,
      };

      setLastResult(executionResult);

      if (executionResult.success) {
        // Replace schematic objects with binary data from result.schematics for the node output
        const finalResult = { ...executionResult.result };
        if (result.schematics) {
          for (const [key, value] of Object.entries(result.schematics)) {
            if (value) {
               // Always prefer the binary data from schematics if available
               // value is Uint8Array from worker
               finalResult[key] = value;
            }
          }
        }

        // Mark code node as completed
        setNodeExecutionStatus(primaryNode.id, 'completed', finalResult);
        
        addExecutionLog('[OK] Script executed successfully');
        
        if (executionResult.executionTime) {
          addExecutionLog(`Completed in ${executionResult.executionTime}ms`);
        }

        if (Object.keys(processedSchematics).length > 0) {
          addExecutionLog(`[OK] Generated ${Object.keys(processedSchematics).length} schematic(s)`);
        }

        if (executionResult.result) {
          const resultKeys = Object.keys(executionResult.result);
          addExecutionLog(`Output keys: ${resultKeys.join(', ')}`);
        }
      } else {
        // Mark code node as error
        const execError = executionResult.error 
          ? parseExecutionError({ message: executionResult.error })
          : parseExecutionError({ message: 'Unknown execution error' });
        setNodeExecutionStatus(primaryNode.id, 'error', undefined, execError);
        addExecutionLog(`[ERROR] Execution failed: ${executionResult.error}`);
      }
    } catch (error) {
      const err = error as Error;
      addExecutionLog(`[ERROR] ${err.message}`);
      
      // Mark all code nodes as error with structured error
      const execError = parseExecutionError(err);
      for (const node of nodes.filter(n => n.type === 'code')) {
        setNodeExecutionStatus(node.id, 'error', undefined, execError);
      }
    } finally {
      setIsExecuting(false);
      setExecutingNodeId(null);
    }
  }, [nodes, inputValues, setIsExecuting, clearExecutionLogs, addExecutionLog, setNodeExecutionStatus, setExecutingNodeId]);

  const handleDownloadSchematic = useCallback((name: string, base64Data: string) => {
    try {
      // Decode base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and download
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.litematic`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addExecutionLog(`[OK] Downloaded ${name}.litematic`);
    } catch (error) {
      addExecutionLog(`[ERROR] Failed to download: ${(error as Error).message}`);
    }
  }, [addExecutionLog]);

  const getLogStyle = (log: string) => {
    if (log.includes('[ERROR]')) return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', Icon: XCircle };
    if (log.includes('[OK]')) return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', Icon: CheckCircle };
    if (log.includes('[WARN]')) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', Icon: AlertTriangle };
    return { bg: '', text: 'text-neutral-400', border: 'border-transparent', Icon: null };
  };

  const renderInput = (key: string, config: IOPort | Record<string, unknown>) => {
    const value = inputValues[key];
    const type = config.type as string;
    const options = config.options as string[] | undefined;

    if (options && options.length > 0) {
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => handleInputChange(key, e.target.value)}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    switch (type) {
      case 'number':
        return (
          <input
            type="number"
            value={value as number ?? ''}
            onChange={(e) => handleInputChange(key, parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
        );
      case 'boolean':
        return (
          <button
            onClick={() => handleInputChange(key, !value)}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              value ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400'
            }`}
          >
            {value ? 'True' : 'False'}
          </button>
        );
      default:
        return (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => handleInputChange(key, e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
        );
    }
  };

  const getInputIcon = (type: string) => {
    switch (type) {
      case 'number': return Hash;
      case 'string': return Type;
      default: return List;
    }
  };

  return (
    <div className="flex flex-col h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Terminal className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Execute Script</h3>
            <p className="text-xs text-neutral-500">{executionLogs.length} log entries</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearExecutionLogs}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-neutral-800/50 hover:bg-neutral-700/50 text-neutral-300 rounded-lg transition-colors border border-neutral-700/50"
            disabled={isExecuting}
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className={`
              flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-all
              ${isExecuting 
                ? 'bg-amber-600/80 text-white cursor-wait' 
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
              }
            `}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Execute
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex">
        {/* Input Controls */}
        <div className="w-72 flex-shrink-0 border-r border-neutral-800/50 p-4 overflow-y-auto bg-neutral-900/30">
          <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">Script Inputs</h4>
          
          {ioSchema?.inputs && Object.keys(ioSchema.inputs).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(ioSchema.inputs).map(([key, config]) => {
                const Icon = getInputIcon(config.type);
                return (
                  <div key={key}>
                    <label className="block text-sm text-neutral-300 mb-1.5 flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-blue-400" />
                      {key}
                    </label>
                    {renderInput(key, config)}
                    {config.description && (
                      <p className="text-xs text-neutral-500 mt-1">{config.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              <List className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No inputs defined</p>
              <p className="text-xs mt-1 text-neutral-600">Add a code node with an io schema</p>
            </div>
          )}
        </div>

        {/* Logs and Results */}
        <div className="flex-1 flex flex-col">
          {/* Schematic Downloads */}
          {lastResult?.schematics && Object.keys(lastResult.schematics).length > 0 && (
            <div className="p-4 bg-green-900/20 border-b border-green-500/20">
              <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Generated Schematics</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(lastResult.schematics).map(([name, data]) => (
                  <button
                    key={name}
                    onClick={() => handleDownloadSchematic(name, data)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {name}.litematic
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs">
            {executionLogs.length === 0 ? (
              <div className="text-neutral-500 text-center py-12">
                <Terminal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No execution logs yet</p>
                <p className="mt-1 text-neutral-600">Click "Execute" to run</p>
              </div>
            ) : (
              <div className="space-y-1">
                {executionLogs.map((log, index) => {
                  const style = getLogStyle(log);
                  return (
                    <div
                      key={index}
                      className={`py-2 px-3 rounded-lg flex items-start gap-2 ${style.bg} border ${style.border} ${style.text}`}
                    >
                      {style.Icon && <style.Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                      <span className="flex-1">{log.replace(/^\[(ERROR|OK|WARN)\]\s*/, '')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
