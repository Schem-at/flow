/**
 * CodePanel - Monaco editor for code node scripts (Modal version)
 * Includes validation and IO extraction
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Zap, Info, ArrowRight, CheckCircle, XCircle, Loader2, Plus, Save, AlertTriangle, ChevronDown, ChevronRight, Copy, Code, Package, Unplug, Pin, PinOff, Upload, Tag, Code2, LayoutPanelLeft, FlaskConical, Maximize2, Minimize2, Play, Square } from 'lucide-react';
import { useFlowStore, type ExecutionError } from '../../store/flowStore';
import type { IODefinition, BlockContract, ExecutionResult } from '@flow/core';
import { defaultInputsForContract } from '@flow/core';
import { parseBlockSource, type ParsedBlock } from '../../lib/block/parser';
import { contractToTypeScript } from '../../lib/block/codegen';
import { contractToIO } from '../../lib/block/io-compat';
import ContractBuilder from '../blocks/ContractBuilder';
import BlockEditor from '../blocks/BlockEditor';
import { FieldWidget } from '../blocks/widgets';
import OutputView from '../blocks/OutputView';
import { useLocalExecutor } from '../../hooks/useLocalExecutor';


interface CodePanelProps {
  nodeId: string;
  onClose?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

/** One-line description of a flow-provided value for the "from flow" chip. */
function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'empty';
  if (Array.isArray(value)) return `array · ${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('_schematicHandle' in obj) return 'schematic (resident)';
    if ('format' in obj && 'data' in obj) return `schematic (${String(obj.format)})`;
    return 'object';
  }
  return String(value);
}

interface ValidationState {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  io?: IODefinition;
  contract?: BlockContract;
  error?: string;
}

/**
 * Enhanced execution error display component with line numbers, code snippets, and stack traces
 */
function ExecutionErrorDisplay({ error }: { error: ExecutionError }) {
  const [showStack, setShowStack] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyError = useCallback(() => {
    const errorText = [
      `Error: ${error.message}`,
      error.type ? `Type: ${error.type}` : '',
      error.lineNumber ? `Line: ${error.lineNumber}${error.columnNumber ? `:${error.columnNumber}` : ''}` : '',
      error.codeSnippet ? `\nCode:\n${error.codeSnippet}` : '',
      error.stack ? `\nStack trace:\n${error.stack}` : '',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [error]);

  return (
    <div className="border-b border-orange-500/20 bg-orange-950/30">
      {/* Error Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-orange-300">
              {error.type || 'Execution Error'}
            </span>
            {error.lineNumber && (
              <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded-full">
                Line {error.lineNumber}{error.columnNumber ? `:${error.columnNumber}` : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-orange-200/90 break-words">{error.message}</p>
        </div>
        <button
          onClick={copyError}
          className="p-1.5 rounded hover:bg-orange-500/20 text-orange-400 transition-colors shrink-0"
          title="Copy error details"
        >
          {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Code Snippet */}
      {error.codeSnippet && (
        <div className="mx-4 mb-3 rounded-lg bg-neutral-900/60 border border-orange-500/20 overflow-hidden">
          <div className="px-3 py-1.5 text-xs text-orange-300/70 bg-orange-500/10 border-b border-orange-500/20 flex items-center gap-2">
            <Code className="w-3 h-3" />
            Code context
          </div>
          <pre className="p-3 text-xs font-mono overflow-x-auto text-neutral-300">
            {error.codeSnippet.split('\n').map((line, idx) => {
              const isErrorLine = line.startsWith('> ');
              return (
                <div
                  key={idx}
                  className={isErrorLine ? 'bg-orange-500/20 -mx-3 px-3 text-orange-200' : ''}
                >
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      )}

      {/* Stack Trace Toggle */}
      {error.stack && (
        <div className="mx-4 mb-3">
          <button
            onClick={() => setShowStack(!showStack)}
            className="flex items-center gap-1.5 text-xs text-orange-400/70 hover:text-orange-300 transition-colors"
          >
            {showStack ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Stack trace
          </button>
          {showStack && (
            <pre className="mt-2 p-3 text-xs font-mono bg-neutral-900/60 border border-orange-500/20 rounded-lg overflow-x-auto text-neutral-400 max-h-40 overflow-y-auto">
              {error.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function CodePanel({ nodeId, onClose, isFullscreen, onToggleFullscreen }: CodePanelProps) {
  const { nodes, updateNodeData, addNode, edges, setEdges, setNodeOutput, nodeCache, exportFlow, flowId } = useFlowStore();
  const [localCode, setLocalCode] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [publishName, setPublishName] = useState('');
  const [publishDesc, setPublishDesc] = useState('');
  const [publishVisibility, setPublishVisibility] = useState<'public' | 'private'>('public');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSavingModule, setIsSavingModule] = useState(false);
  const [moduleSaved, setModuleSaved] = useState(false);
  const [moduleVersions, setModuleVersions] = useState<{ id: string; versionNumber: string; isLatest: boolean }[]>([]);
  const [showRelease, setShowRelease] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [parsed, setParsed] = useState<ParsedBlock | null>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual');
  // Standalone test bench: run this block in isolation, inputs prefilled from
  // the connected flow where available, manually editable everywhere.
  const [testMode, setTestMode] = useState(false);
  const [testValues, setTestValues] = useState<Record<string, unknown>>({});
  const [flowFed, setFlowFed] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<ExecutionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const { executeScript, getData, workerClient } = useLocalExecutor();
  const [showIO, setShowIO] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const initialValidationDone = useRef(false);
  const lastValidatedCode = useRef<string>('');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const saveCodeRef = useRef<() => void>(() => {});

  // Find the node - check both by ID and look for code nodes
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : null;
  const moduleRef = (node?.data as Record<string, unknown>)?.moduleRef as { id: string; slug: string; version: string; pinned?: boolean } | undefined;
  const isModuleNode = !!moduleRef;
  const isCodeNode = node?.type === 'code';

  // Debug logging if node not found
  if (!node && nodeId) {
    console.warn('[CodePanel] Node not found:', nodeId, 'Available nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
  }

  // Validate script against server - stable reference
  const validateScript = useCallback(async (code: string) => {
    // Skip if code hasn't changed
    if (code === lastValidatedCode.current) {
      return;
    }

    if (!code.trim()) {
      setValidation({ status: 'idle' });
      lastValidatedCode.current = code;
      return;
    }

    setValidation({ status: 'validating' });
    lastValidatedCode.current = code;

    try {
      if (code.includes('export default')) {
        setValidation({
          status: 'invalid',
          error:
            'Legacy script format. Blocks now declare `type Inputs/Outputs` and a `function generate(inputs)` entry — no exports.',
        });
        return;
      }

      // Types ARE the contract: parse Inputs/Outputs into the descriptor tree.
      const parsedBlock = await parseBlockSource(code);
      setParsed(parsedBlock);

      if (!/\bgenerate\b/.test(parsedBlock.bodyText)) {
        setValidation({ status: 'invalid', error: 'Block must define a function named generate(inputs)' });
        return;
      }

      const contract = parsedBlock.contract;
      const io = contractToIO(contract);
      setValidation({ status: 'valid', io, contract });
      updateNodeData(nodeId, { io, contract });
    } catch (error) {
      const err = error as Error;
      setValidation({ status: 'invalid', error: `Parse error: ${err.message}` });
    }
  }, [nodeId, updateNodeData]);

  // Initialize local code when node changes
  useEffect(() => {
    initialValidationDone.current = false;
    lastValidatedCode.current = '';
  }, [nodeId]);

  // Fetch module code + versions for module nodes
  useEffect(() => {
    if (!isModuleNode || !moduleRef?.id) return;
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

    // Fetch code
    const vParam = moduleRef.pinned ? `?version=${moduleRef.version}` : '';
    fetch(`${SERVER_URL}/api/modules/${moduleRef.id}/resolve${vParam}`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setLocalCode(json.code);
          setHasChanges(false);
          if (json.code) validateScript(json.code);
        }
      }).catch(() => {});

    // Fetch versions
    fetch(`${SERVER_URL}/api/modules/${moduleRef.id}/versions`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.success) setModuleVersions(json.versions || []);
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, isModuleNode, moduleRef?.id]);

  useEffect(() => {
    if (isCodeNode && node) {
      const nodeCode = node.data.code || '';
      setLocalCode(nodeCode);
      setHasChanges(false);

      // Only validate on initial mount for this node
      if (!initialValidationDone.current && nodeCode) {
        initialValidationDone.current = true;
        validateScript(nodeCode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, isCodeNode]); // Only re-run when nodeId or isCodeNode changes

  // Manual save function — only saves inline code, not module code
  const saveCode = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // Don't save to node data for module instances — use "Save to Module" instead
    if (isModuleNode) return;
    updateNodeData(nodeId, { code: localCode });
    setHasChanges(false);
    validateScript(localCode);
  }, [nodeId, localCode, updateNodeData, validateScript, isModuleNode]);

  // Keep ref updated for use in Monaco command (avoids stale closure)
  useEffect(() => {
    saveCodeRef.current = saveCode;
  }, [saveCode]);

  // Get execution error for this node (now structured as ExecutionError)
  const executionError = nodeCache[nodeId]?.error;
  const executionErrorMessage = executionError?.message;
  const executionStatus = nodeCache[nodeId]?.status;

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      const code = value || '';
      setLocalCode(code);
      setHasChanges(true);

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Auto-save for inline code only (not module instances)
      if (!isModuleNode) {
        debounceRef.current = setTimeout(() => {
          updateNodeData(nodeId, { code });
          setHasChanges(false);
          validateScript(code);
        }, 30000);
      }
    },
    [nodeId, updateNodeData, validateScript]
  );

  // Handle editor mount to add save keybinding
  const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Add Ctrl/Cmd+S save keybinding - use ref to avoid stale closure
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCodeRef.current();
    });

    // Auto-save on blur (when editor loses focus)
    editor.onDidBlurEditorWidget(() => {
      // Small delay to allow for potential re-focus
      setTimeout(() => {
        if (!editor.hasWidgetFocus()) {
          saveCodeRef.current();
        }
      }, 100);
    });
  }, []);

  // Auto-create input nodes from IO schema
  const createInputNodesFromIO = useCallback(() => {
    if (!validation.io?.inputs || !node) return;

    const existingInputs = edges.filter(e => e.target === nodeId);
    const existingHandles = new Set(existingInputs.map(e => e.targetHandle));

    const inputEntries = Object.entries(validation.io.inputs);
    const newNodes: Parameters<typeof addNode>[0][] = [];
    const newEdges: typeof edges = [];

    inputEntries.forEach(([key, config], index) => {
      // Skip if already has an input connected
      if (existingHandles.has(key)) return;

      const inputNodeId = `input-${nodeId}-${key}-${Date.now()}-${index}`;
      const yOffset = (index - inputEntries.length / 2) * 100;

      // Determine widget type based on input config
      let widgetType: 'number' | 'slider' | 'text' | 'boolean' | 'select' = 'text';
      if (config.type === 'number') {
        widgetType = config.options ? 'select' : 'number';
      } else if (config.type === 'boolean') {
        widgetType = 'boolean';
      } else if (config.type === 'string' && config.options) {
        widgetType = 'select';
      }

      // Prepare the input node
      newNodes.push({
        id: inputNodeId,
        type: 'input',
        position: {
          x: node.position.x - 300,
          y: node.position.y + yOffset,
        },
        data: {
          label: key,
          value: config.default,
          dataType: config.type as 'number' | 'string' | 'boolean',
          widgetType,
          isConstant: false,
          min: config.min,
          max: config.max,
          step: config.step,
          options: config.options,
          description: config.description,
        },
      });

      // Prepare edge connecting input to code node
      newEdges.push({
        id: `edge-${inputNodeId}-${nodeId}-${key}`,
        source: inputNodeId,
        target: nodeId,
        sourceHandle: 'output',
        targetHandle: key,
        type: 'data',
      });
    });

    // Add all nodes and edges at once
    if (newNodes.length > 0) {
      // Add nodes
      newNodes.forEach(n => addNode(n));

      // Set all edges including new ones
      setEdges([...edges, ...newEdges]);

      // Mark all new input nodes as ready with their default values
      setTimeout(() => {
        newNodes.forEach(n => {
          setNodeOutput(n.id, { output: n.data.value });
        });
      }, 50);

      console.log(`Created ${newNodes.length} input node(s) from IO schema`);
    }
  }, [validation.io, node, nodeId, edges, addNode, setEdges, setNodeOutput]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Keep the contract projection in sync while typing (validateScript
  // de-dupes identical code, so this is cheap).
  useEffect(() => {
    if (!localCode) return;
    const timer = setTimeout(() => validateScript(localCode), 300);
    return () => clearTimeout(timer);
  }, [localCode, validateScript]);

  // ── standalone test bench ───────────────────────────────────────────────
  /**
   * Seed test inputs: contract defaults, overridden by values the flow has
   * already produced on connected ports (upstream node caches).
   */
  const seedTestValues = useCallback(() => {
    const contract = validation.contract;
    if (!contract) return;
    const values = defaultInputsForContract(contract);
    const fed: Record<string, boolean> = {};

    for (const name of Object.keys(contract.inputs)) {
      const edge = edges.find((e) => e.target === nodeId && e.targetHandle === name);
      if (!edge) continue;
      const sourceOutput = nodeCache[edge.source]?.output as
        | Record<string, unknown>
        | undefined;
      if (sourceOutput === undefined || sourceOutput === null) continue;

      let val: unknown;
      if (typeof sourceOutput === 'object') {
        const key = edge.sourceHandle || 'default';
        val = sourceOutput[key];
        if (val === undefined) {
          const keys = Object.keys(sourceOutput);
          val = keys.length === 1 ? sourceOutput[keys[0]] : sourceOutput['default'];
        }
      }
      if (val === undefined) val = sourceOutput;
      if (val !== undefined) {
        values[name] = val;
        fed[name] = true;
      }
    }

    setTestValues(values);
    setFlowFed(fed);
  }, [validation.contract, edges, nodeId, nodeCache]);

  const toggleTestMode = useCallback(() => {
    setTestMode((on) => {
      if (!on) seedTestValues();
      return !on;
    });
  }, [seedTestValues]);

  const runTest = useCallback(async () => {
    setTestError(null);
    setTestRunning(true);
    try {
      const result = await executeScript(localCode, testValues, { returnHandles: false });
      setTestResult(result);
      if (!result.success) setTestError(result.error?.message ?? 'Execution failed');
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTestRunning(false);
    }
  }, [executeScript, localCode, testValues]);

  const cancelTest = useCallback(async () => {
    try {
      await workerClient.cancelExecution();
    } finally {
      setTestRunning(false);
    }
  }, [workerClient]);

  // ── visual edits round-trip into the canonical source ──────────────────
  const handleContractChange = useCallback(
    (contract: BlockContract) => {
      const body = parsed?.bodyText ?? '';
      handleCodeChange(`${contractToTypeScript(contract)}\n\n${body}`.trimEnd() + '\n');
    },
    [parsed, handleCodeChange]
  );

  const handleBodyChange = useCallback(
    (body: string) => {
      const contractText = parsed?.contractText ?? '';
      handleCodeChange(`${contractText}\n\n${body}`.trimEnd() + '\n');
    },
    [parsed, handleCodeChange]
  );

  if (!node || !isCodeNode) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 p-8">
        <div className="text-center">
          <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Node not found or not a code node</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'sm:h-[92vh]' : 'sm:h-[80vh]'}`}>
      {/* Header info */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-neutral-800/50 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between bg-neutral-900/50">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={node.data.label || ''}
              onChange={(e) => updateNodeData(nodeId, { label: e.target.value })}
              className="bg-transparent text-white font-semibold focus:outline-none border-b border-transparent focus:border-neutral-600 text-base sm:text-lg w-full"
              placeholder="Node label..."
            />
          </div>
          {/* Mobile Close Button - Visible only on mobile when header is stacked */}
          <button
            onClick={onClose}
            className="sm:hidden p-2 -mr-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {hasChanges && (
            <>
              <span className="text-xs text-amber-400 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/20">
                Unsaved
              </span>
              <button
                onClick={saveCode}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors border border-emerald-500/30"
                title="Save (Ctrl/Cmd+S)"
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            </>
          )}

          {/* Module actions */}
          {(node?.data as Record<string, unknown>)?.moduleRef ? (
            <button
              onClick={() => {
                // Eject: copy module code inline, remove reference
                if (confirm('Eject this module? The code will be copied inline and the module reference removed.')) {
                  updateNodeData(nodeId, {
                    moduleRef: undefined,
                    // code is already in the editor from the resolved module
                  });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/50 rounded-lg hover:bg-neutral-700/50 transition-colors border border-neutral-700/30"
              title="Eject: copy module code inline"
            >
              <Unplug className="w-3 h-3" />
              Eject
            </button>
          ) : (
            <button
              onClick={() => {
                setPublishName(node?.data?.label || 'My Module');
                setPublishDesc('');
                setPublishVisibility('public');
                setPublishError(null);
                setShowPublish(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 rounded-lg hover:bg-cyan-500/20 transition-colors border border-cyan-500/20"
              title="Extract as reusable module"
            >
              <Package className="w-3 h-3" />
              Extract
            </button>
          )}

          {executionStatus === 'error' && (
            <span className="text-xs text-orange-400 px-2 py-1 bg-orange-500/10 rounded border border-orange-500/20 flex items-center gap-1" title={executionErrorMessage}>
              <AlertTriangle className="w-3 h-3" />
              Runtime Error
            </span>
          )}

          {validation.status === 'validating' && (
            <span className="text-xs text-blue-400 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Validating
            </span>
          )}

          {validation.status === 'valid' && !executionErrorMessage && (
            <span className="text-xs text-green-400 px-2 py-1 bg-green-500/10 rounded border border-green-500/20 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Valid
            </span>
          )}

          {validation.status === 'invalid' && (
            <span className="text-xs text-red-400 px-2 py-1 bg-red-500/10 rounded border border-red-500/20 flex items-center gap-1" title={validation.error}>
              <XCircle className="w-3 h-3" />
              Invalid
            </span>
          )}
          
          {/* Fullscreen toggle */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="hidden sm:flex p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {/* Desktop Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="hidden sm:flex p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors ml-2"
              title="Close"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Module controls bar */}
      {isModuleNode && moduleRef && (
        <div className="px-4 py-2 bg-cyan-950/20 border-b border-cyan-800/20 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[10px]">
            <Package className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-cyan-400/70">{moduleRef.slug}</span>

            {/* Version selector */}
            <select
              value={moduleRef.pinned ? moduleRef.version : '__latest__'}
              onChange={(e) => {
                const val = e.target.value;
                const isPinned = val !== '__latest__';
                const version = isPinned ? val : (moduleVersions.find(v => v.isLatest)?.versionNumber || moduleRef.version);
                updateNodeData(nodeId, {
                  moduleRef: { ...moduleRef, version, pinned: isPinned },
                });
                // Re-fetch code for new version
                const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
                const vParam = isPinned ? `?version=${version}` : '';
                fetch(`${SERVER_URL}/api/modules/${moduleRef.id}/resolve${vParam}`, { credentials: 'include' })
                  .then(r => r.json())
                  .then(json => { if (json.success) { setLocalCode(json.code); setHasChanges(false); } })
                  .catch(() => {});
              }}
              className="bg-[#0c0c10] border border-cyan-800/30 rounded px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="__latest__">latest</option>
              {moduleVersions.map(v => (
                <option key={v.id} value={v.versionNumber}>
                  v{v.versionNumber}{v.isLatest ? ' (current)' : ''}
                </option>
              ))}
            </select>

            {moduleRef.pinned ? (
              <span className="flex items-center gap-0.5 text-amber-400/60" title="Pinned to this version">
                <Pin className="w-3 h-3" /> pinned
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-green-400/60" title="Using latest version">
                <PinOff className="w-3 h-3" /> latest
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Save to module */}
            {hasChanges && (
              <button
                onClick={async () => {
                  setIsSavingModule(true);
                  const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
                  try {
                    const res = await fetch(`${SERVER_URL}/api/modules/${moduleRef.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        code: localCode,
                        io_schema: node?.data?.io || { inputs: {}, outputs: {} },
                        change_note: 'Updated from flow editor',
                      }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      setHasChanges(false);
                      setModuleSaved(true);
                      setTimeout(() => setModuleSaved(false), 2000);

                      // Update IO on all nodes in this flow that reference this module
                      const io = node?.data?.io;
                      if (io) {
                        nodes.forEach(n => {
                          const ref = (n.data as Record<string, unknown>)?.moduleRef as { id: string } | undefined;
                          if (ref?.id === moduleRef.id && n.id !== nodeId) {
                            updateNodeData(n.id, { io });
                          }
                        });
                      }

                      // Clear module code cache so execution uses fresh code
                      window.dispatchEvent(new CustomEvent('module-updated', { detail: { moduleId: moduleRef.id } }));

                      // Refresh versions
                      fetch(`${SERVER_URL}/api/modules/${moduleRef.id}/versions`, { credentials: 'include' })
                        .then(r => r.json())
                        .then(j => { if (j.success) setModuleVersions(j.versions || []); });
                    }
                  } catch {} finally { setIsSavingModule(false); }
                }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
              >
                {isSavingModule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Save to Module
              </button>
            )}
            {moduleSaved && (
              <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Saved</span>
            )}

            {/* Release version */}
            <button
              onClick={() => {
                // Suggest next patch version
                const current = moduleRef.version || '1.0.0';
                const parts = current.split('.').map(Number);
                parts[2] = (parts[2] || 0) + 1;
                setReleaseVersion(parts.join('.'));
                setReleaseNote('');
                setShowRelease(true);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-green-400 bg-green-500/10 rounded border border-green-500/20 hover:bg-green-500/20 transition-colors"
            >
              <Tag className="w-3 h-3" /> Release
            </button>

            {/* Eject */}
            <button
              onClick={() => {
                if (confirm('Eject? Code will be copied inline and the module reference removed.')) {
                  updateNodeData(nodeId, { moduleRef: undefined, code: localCode });
                }
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-neutral-500 hover:text-neutral-300 bg-neutral-800/50 rounded border border-neutral-700/30 hover:bg-neutral-700/50 transition-colors"
            >
              <Unplug className="w-3 h-3" /> Eject
            </button>
          </div>
        </div>
      )}

      {/* Release Version dialog */}
      {showRelease && moduleRef && (
        <div className="px-4 py-3 bg-green-950/20 border-b border-green-800/20 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-green-400/70 font-medium">Release as:</span>
          <div className="flex items-center gap-1">
            {['patch', 'minor', 'major'].map((bump) => {
              const current = moduleRef.version || '1.0.0';
              const parts = current.split('.').map(Number);
              const suggested = bump === 'major' ? `${parts[0]+1}.0.0`
                : bump === 'minor' ? `${parts[0]}.${parts[1]+1}.0`
                : `${parts[0]}.${parts[1]}.${(parts[2]||0)+1}`;
              return (
                <button
                  key={bump}
                  onClick={() => setReleaseVersion(suggested)}
                  className={`px-2 py-0.5 text-[9px] font-mono rounded border transition-colors ${
                    releaseVersion === suggested
                      ? 'bg-green-500/15 border-green-500/30 text-green-300'
                      : 'border-neutral-800/40 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {suggested} <span className="text-neutral-600">({bump})</span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={releaseNote}
            onChange={(e) => setReleaseNote(e.target.value)}
            placeholder="Release notes..."
            className="flex-1 min-w-[150px] bg-[#0c0c10] border border-neutral-800/40 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-green-500/30 placeholder:text-neutral-700"
          />
          <button
            onClick={async () => {
              if (!releaseVersion) return;
              setIsReleasing(true);
              const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
              try {
                // First save current code, then update version
                const res = await fetch(`${SERVER_URL}/api/modules/${moduleRef.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    code: localCode,
                    io_schema: node?.data?.io || { inputs: {}, outputs: {} },
                    version: releaseVersion,
                    change_note: releaseNote || `Release v${releaseVersion}`,
                  }),
                });
                const json = await res.json();
                if (json.success) {
                  // Update the node's moduleRef version
                  updateNodeData(nodeId, {
                    moduleRef: { ...moduleRef, version: releaseVersion },
                  });
                  setShowRelease(false);
                  setHasChanges(false);
                  // Refresh versions list
                  fetch(`${SERVER_URL}/api/modules/${moduleRef.id}/versions`, { credentials: 'include' })
                    .then(r => r.json())
                    .then(j => { if (j.success) setModuleVersions(j.versions || []); });
                  window.dispatchEvent(new CustomEvent('module-updated', { detail: { moduleId: moduleRef.id } }));
                }
              } catch {} finally { setIsReleasing(false); }
            }}
            disabled={isReleasing || !releaseVersion}
            className="flex items-center gap-1 px-3 py-1 text-[10px] font-semibold bg-green-500 text-black rounded hover:bg-green-400 transition-colors disabled:opacity-50"
          >
            {isReleasing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
            Release v{releaseVersion}
          </button>
          <button
            onClick={() => setShowRelease(false)}
            className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* View toggle: visual (contract builder + body) is the default; raw types are opt-in */}
      <div className="flex items-center justify-end gap-2 border-b border-neutral-800/50 bg-neutral-900/40 px-4 py-1.5">
        <button
          onClick={toggleTestMode}
          disabled={!validation.contract}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
            testMode
              ? 'border-amber-600 bg-amber-500/15 text-amber-300'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
          }`}
          title="Run this block standalone — inputs prefilled from the flow where connected"
        >
          <FlaskConical className="h-3 w-3" />
          Test
        </button>
        <button
          onClick={() => setViewMode((m) => (m === 'visual' ? 'code' : 'visual'))}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition ${
            viewMode === 'code'
              ? 'border-emerald-700 bg-emerald-600/15 text-emerald-300'
              : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
          }`}
          title={viewMode === 'code' ? 'Back to visual editing' : 'Edit the full source, types included'}
        >
          {viewMode === 'code' ? <LayoutPanelLeft className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
          {viewMode === 'code' ? 'Visual' : 'Code'}
        </button>
      </div>

      {/* Test bench: inputs on top (flow-prefilled or manual), run, outputs */}
      {testMode && validation.contract && (
        <div className="border-b border-amber-900/30 bg-amber-500/[0.03] px-4 py-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {Object.entries(validation.contract.inputs).map(([name, type]) => (
              <div key={name} className="min-w-[150px] max-w-[260px] flex-1">
                <label className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium text-neutral-300">{name}</span>
                  <span className="text-[9px] uppercase tracking-wide text-neutral-600">
                    {type.kind}
                  </span>
                </label>
                {flowFed[name] ? (
                  <button
                    onClick={() => setFlowFed((f) => ({ ...f, [name]: false }))}
                    className="flex w-full items-center gap-1.5 rounded-md border border-cyan-700/40 bg-cyan-500/10 px-2 py-1.5 text-left text-[11px] text-cyan-300 transition hover:border-cyan-500/60"
                    title="Value comes from the connected flow — click to edit manually"
                  >
                    <span className="rounded bg-cyan-500/20 px-1 text-[9px] font-semibold uppercase">
                      flow
                    </span>
                    <span className="truncate">{summarizeValue(testValues[name])}</span>
                  </button>
                ) : (
                  <FieldWidget
                    type={type}
                    value={testValues[name]}
                    onChange={(v) => setTestValues((s) => ({ ...s, [name]: v }))}
                  />
                )}
              </div>
            ))}

            <div className="ml-auto flex items-center gap-2 pb-0.5">
              {testResult?.executionTime != null && !testRunning && (
                <span className="text-[10px] text-neutral-500">{testResult.executionTime} ms</span>
              )}
              {testRunning ? (
                <button
                  onClick={cancelTest}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
                >
                  <Square className="h-3 w-3" /> Cancel
                </button>
              ) : (
                <button
                  onClick={runTest}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
                >
                  <Play className="h-3.5 w-3.5" /> Run block
                </button>
              )}
            </div>
          </div>

          {testError && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-red-500/10 p-2 text-[11px] text-red-300">
              {testError}
            </pre>
          )}

          {testResult?.success && (
            <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-neutral-800/60 bg-neutral-950/50 p-3">
              <OutputView
                contract={validation.contract}
                result={
                  testResult.result && typeof testResult.result === 'object'
                    ? (testResult.result as Record<string, unknown>)
                    : null
                }
                schematics={testResult.schematics as Record<string, unknown> | undefined}
                getData={getData}
              />
            </div>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className="flex min-h-0 flex-1 border-b border-neutral-800/50">
        {viewMode === 'code' ? (
          <div className="min-w-0 flex-1">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={localCode}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
              }}
            />
          </div>
        ) : (
          <>
            <aside className="w-72 flex-none overflow-y-auto border-r border-neutral-800/50 p-3">
              <ContractBuilder
                contract={validation.contract ?? parsed?.contract ?? { inputs: {}, outputs: {} }}
                onChange={handleContractChange}
              />
            </aside>
            <div className="min-w-0 flex-1">
              <BlockEditor
                value={parsed?.bodyText ?? localCode}
                onChange={handleBodyChange}
                contractTypes={parsed?.contractText ?? ''}
                height="100%"
              />
            </div>
          </>
        )}
      </div>

      {/* Enhanced Execution Error display */}
      {executionStatus === 'error' && executionError && (
        <ExecutionErrorDisplay error={executionError} />
      )}

      {/* Validation Error display */}
      {validation.status === 'invalid' && validation.error && (
        <div className="px-6 py-3 bg-red-900/20 border-b border-red-500/20">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium mb-1">Validation Error</div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-red-300/80">{validation.error}</pre>
            </div>
          </div>
        </div>
      )}

      {/* IO Preview */}
      {validation.io && (
        <div className="border-t border-neutral-800/50 bg-neutral-900/50">
          <button 
            onClick={() => setShowIO(!showIO)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-neutral-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">IO Schema</h4>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-500">
                {Object.keys(validation.io.inputs || {}).length} in, {Object.keys(validation.io.outputs || {}).length} out
              </span>
            </div>
            {showIO ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          
          {showIO && (
            <div className="px-4 pb-4 sm:px-6 sm:pb-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-end mb-3">
                {Object.keys(validation.io.inputs || {}).length > 0 && (
                  <button
                    onClick={createInputNodesFromIO}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors border border-blue-500/30"
                  >
                    <Plus className="w-3 h-3" />
                    Create Input Nodes
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Inputs */}
                <div>
                  <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Inputs</h4>
                  {Object.keys(validation.io.inputs || {}).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(validation.io.inputs).map(([key, config]) => (
                        <div key={key} className="text-xs text-neutral-400 flex items-center gap-2 p-2 bg-neutral-800/50 rounded border border-neutral-700/50 overflow-hidden">
                          <span className="font-mono text-blue-300 shrink-0">{key}</span>
                          <span className="text-neutral-600">:</span>
                          <span className="text-neutral-500 truncate">{config.type}</span>
                          {'default' in config && (
                            <span className="text-neutral-600 ml-auto shrink-0">= {String(config.default)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">No inputs defined</p>
                  )}
                </div>

                {/* Outputs */}
                <div>
                  <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Outputs</h4>
                  {Object.keys(validation.io.outputs || {}).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(validation.io.outputs).map(([key, config]) => (
                        <div key={key} className="text-xs text-neutral-400 flex items-center gap-2 p-2 bg-neutral-800/50 rounded border border-neutral-700/50 overflow-hidden">
                          <span className="font-mono text-amber-300 shrink-0">{key}</span>
                          <span className="text-neutral-600">:</span>
                          <span className="text-neutral-500 truncate">{config.type}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-600">No outputs defined</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tips Section */}
      <div className="border-t border-neutral-800/50 bg-neutral-900/50">
        <button 
          onClick={() => setShowTips(!showTips)}
          className="w-full px-4 py-2 flex items-center justify-between hover:bg-neutral-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-neutral-500" />
            <span className="text-xs font-medium text-neutral-400">Tips & Reference</span>
          </div>
          {showTips ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
        </button>
        
        {showTips && (
          <div className="p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="p-4 rounded-xl border border-green-500/20 bg-green-900/10">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-100">Script Format</span>
              </div>
              <div className="space-y-2 text-xs text-green-200/70">
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />
                  <span>Define the contract visually, or as types: <code className="px-1 rounded bg-green-500/20 text-green-300">type Inputs = {'{ … }'}; type Outputs = {'{ … }'}</code></span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />
                  <span>Entry point: <code className="px-1 rounded bg-green-500/20 text-green-300">function generate(inputs) {'{ return outputs }'}</code> — no exports, no imports</span>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />
                  <span>Ambient context: <code className="px-1 rounded bg-green-500/20 text-green-300">Schematic, Logger, Vec, Noise, Math</code> — in scope everywhere</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Publish as Module overlay */}
      {showPublish && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="w-full max-w-md bg-[#0c0c10] border border-neutral-800/60 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800/30 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Package className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Extract as Module</h3>
                <p className="text-[10px] text-neutral-500">Make this code reusable across flows</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  placeholder="e.g. ROM Grid Builder"
                  className="w-full bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/30 placeholder:text-neutral-700"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">Description</label>
                <textarea
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder="What does this module do?"
                  rows={3}
                  className="w-full bg-[#07070a] border border-neutral-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/30 placeholder:text-neutral-700 resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-2">Visibility</label>
                <div className="flex gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setPublishVisibility(v)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        publishVisibility === v
                          ? v === 'public'
                            ? 'border-green-500/30 bg-green-500/[0.05] text-green-400'
                            : 'border-neutral-600/30 bg-neutral-500/[0.05] text-neutral-300'
                          : 'border-neutral-800/40 bg-[#07070a] text-neutral-600 hover:border-neutral-700/60'
                      }`}
                    >
                      {v === 'public' ? '🌐 Public' : '🔒 Private'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#07070a] border border-neutral-800/30 rounded-lg p-3">
                <div className="text-[10px] font-mono text-neutral-600 mb-1">IO Schema (from code)</div>
                <div className="flex items-center gap-4 text-[10px] text-neutral-500">
                  <span>{Object.keys(node?.data?.io?.inputs || {}).length} inputs</span>
                  <span>{Object.keys(node?.data?.io?.outputs || {}).length} outputs</span>
                </div>
              </div>
            </div>

            {publishError && (
              <div className="mx-5 mb-0 p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg text-xs text-red-400">
                {publishError}
              </div>
            )}

            <div className="px-5 py-3 border-t border-neutral-800/30 flex items-center justify-between">
              <button
                onClick={() => setShowPublish(false)}
                className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!publishName.trim()) return;
                  setIsPublishing(true);
                  const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
                  try {
                    const res = await fetch(`${SERVER_URL}/api/modules`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        name: publishName,
                        code: localCode,
                        io_schema: node?.data?.io || { inputs: {}, outputs: {} },
                        description: publishDesc || undefined,
                        visibility: publishVisibility,
                      }),
                    });
                    if (!res.ok) {
                      setPublishError(`Server error: ${res.status}`);
                      return;
                    }
                    const json = await res.json();
                    if (json.success) {
                      updateNodeData(nodeId, {
                        label: publishName,
                        moduleRef: {
                          id: json.module.id,
                          slug: json.module.slug,
                          version: json.module.version,
                          pinned: false,
                        },
                      });
                      setShowPublish(false);

                      // Auto-save the flow so the module reference persists
                      if (flowId) {
                        setTimeout(async () => {
                          try {
                            const flowData = exportFlow();
                            await fetch(`${SERVER_URL}/api/flows/${flowId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify(flowData),
                            });
                          } catch {}
                        }, 100);
                      }
                    } else {
                      setPublishError(json.error || json.errors?.name?.[0] || 'Failed to create module');
                    }
                  } catch (err) {
                    setPublishError(String(err));
                    console.error('Publish failed:', err);
                  } finally {
                    setIsPublishing(false);
                  }
                }}
                disabled={isPublishing || !publishName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] disabled:opacity-50"
              >
                {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
                {isPublishing ? 'Creating...' : 'Create Module'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
