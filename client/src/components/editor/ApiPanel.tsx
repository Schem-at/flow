/**
 * ApiPanel - View and test flow API
 * Shows the API schema and allows direct testing without publishing
 */

import { useState, useCallback, useEffect } from 'react';
import { 
  Globe, 
  Play, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ChevronDown,
  ChevronRight,
  Code,
  Clock,
  FileJson,
  Send,
  Hash,
  Type,
  ToggleLeft,
  List,
  Box,
  Braces,
} from 'lucide-react';
import type { RunStatus } from 'shared';
import { useFlowStore } from '../../store/flowStore';

// Default to localhost:3001 in development
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface ApiPanelProps {
  flowId: string;
  flowName: string;
  onClose?: () => void;
}

interface InputParam {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
  min?: number;
  max?: number;
  options?: string[];
}

interface TestResult {
  success: boolean;
  runId?: string;
  status?: RunStatus;
  outputs?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
  executionTimeMs?: number;
}

/**
 * Extract input parameters from flow nodes
 */
function extractInputsFromFlow(nodes: any[]): InputParam[] {
  const inputs: InputParam[] = [];
  
  for (const node of nodes) {
    // Check for input nodes
    if (node.type === 'input' || node.type?.includes('input')) {
      const label = node.data?.label || node.id;
      const config = node.data?.config || {};
      
      // Determine type from node type or config
      let type = 'string';
      if (node.type === 'number_input' || config.type === 'number') {
        type = 'number';
      } else if (node.type === 'boolean_input' || config.type === 'boolean') {
        type = 'boolean';
      } else if (config.options?.length > 0) {
        type = 'string';
      }
      
      inputs.push({
        name: label,
        type,
        required: !config.isConstant && node.data?.value === undefined,
        default: node.data?.value,
        description: config.description,
        min: config.min,
        max: config.max,
        options: config.options,
      });
    }
  }
  
  return inputs;
}

export function ApiPanel({ flowId, flowName, onClose }: ApiPanelProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testInputs, setTestInputs] = useState<Record<string, unknown>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showCurl, setShowCurl] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [asyncMode, setAsyncMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    description: true,
    test: true,
    response: false,
  });
  
  // Get current flow from store
  const { nodes } = useFlowStore();
  
  // Extract inputs from current flow
  const inputParams = extractInputsFromFlow(nodes);
  
  // Initialize test inputs with defaults
  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const param of inputParams) {
      if (param.default !== undefined) {
        defaults[param.name] = param.default;
      }
    }
    setTestInputs(defaults);
  }, [nodes]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const generateCurlCommand = useCallback(() => {
    const baseUrl = SERVER_URL || window.location.origin;
    const body = {
      inputs: testInputs,
      options: asyncMode ? { async: true } : undefined,
    };
    
    return `curl -X POST "${baseUrl}/api/v1/flows/${flowId}/run" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
  }, [flowId, testInputs, asyncMode]);

  const generateRequestBody = useCallback(() => {
    return {
      inputs: testInputs,
      ...(asyncMode ? { options: { async: true } } : {}),
    };
  }, [testInputs, asyncMode]);

  const testFlow = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const res = await fetch(`${SERVER_URL}/api/v1/flows/${flowId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(generateRequestBody()),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Request failed',
        },
      });
    } finally {
      setIsTesting(false);
    }
  }, [flowId, generateRequestBody]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderStatusBadge = (status: RunStatus) => {
    const colors: Record<RunStatus, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      running: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
      cancelled: 'bg-neutral-500/20 text-neutral-400',
      timeout: 'bg-orange-500/20 text-orange-400',
      expired: 'bg-neutral-500/20 text-neutral-500',
    };
    
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
        {status}
      </span>
    );
  };

  const getTypeIcon = (type: string, hasOptions: boolean) => {
    if (hasOptions) return List;
    if (type === 'number' || type === 'integer') return Hash;
    if (type === 'boolean') return ToggleLeft;
    return Type;
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-cyan-400" />
          <span className="font-semibold">Flow API</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Endpoint Info */}
        <div className="px-4 py-3 border-b border-neutral-700 bg-neutral-800/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded">POST</span>
            <code className="text-sm text-cyan-400">/api/v1/flows/{flowId}/run</code>
          </div>
          <div className="text-xs text-neutral-500">
            Execute this flow via API. Supports sync and async execution.
          </div>
        </div>

        {/* API Description Section */}
        <div className="border-b border-neutral-700">
          <button
            onClick={() => toggleSection('description')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50"
          >
            <div className="flex items-center gap-2">
              {expandedSections.description ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Box className="w-4 h-4 text-blue-400" />
              <span className="font-medium">Request Schema</span>
              <span className="text-xs text-neutral-500">({inputParams.length} inputs)</span>
            </div>
          </button>
          
          {expandedSections.description && (
            <div className="px-4 pb-4 space-y-3">
              {inputParams.length === 0 ? (
                <div className="text-sm text-neutral-500 italic py-2">
                  No input parameters. This flow runs with default values.
                </div>
              ) : (
                inputParams.map((param) => {
                  const TypeIcon = getTypeIcon(param.type, !!param.options);
                  
                  return (
                    <div 
                      key={param.name}
                      className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4 text-neutral-500" />
                          <span className="font-mono text-sm text-white font-medium">{param.name}</span>
                          {param.required && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                              required
                            </span>
                          )}
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-neutral-700 text-neutral-300 rounded font-mono">
                          {param.type}
                        </span>
                      </div>
                      
                      <div className="mt-2 space-y-1 text-xs">
                        {param.description && (
                          <p className="text-neutral-400">{param.description}</p>
                        )}
                        {param.default !== undefined && (
                          <div>
                            <span className="text-neutral-500">Default: </span>
                            <code className="text-cyan-400">
                              {typeof param.default === 'string' ? `"${param.default}"` : String(param.default)}
                            </code>
                          </div>
                        )}
                        {param.options && (
                          <div>
                            <span className="text-neutral-500">Options: </span>
                            {param.options.map((o, i) => (
                              <span key={o}>
                                <code className="text-purple-400">{o}</code>
                                {i < param.options!.length - 1 && <span className="text-neutral-600">, </span>}
                              </span>
                            ))}
                          </div>
                        )}
                        {(param.min !== undefined || param.max !== undefined) && (
                          <div>
                            <span className="text-neutral-500">Range: </span>
                            <span className="text-neutral-300">
                              {param.min !== undefined && `min: ${param.min}`}
                              {param.min !== undefined && param.max !== undefined && ', '}
                              {param.max !== undefined && `max: ${param.max}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              
              {/* Request body preview */}
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Braces className="w-4 h-4 text-neutral-500" />
                  <span className="text-sm font-medium text-neutral-300">Request Body</span>
                </div>
                <div className="relative">
                  <pre className="p-3 bg-neutral-950 rounded-lg text-xs text-neutral-300 overflow-x-auto">
                    {JSON.stringify(generateRequestBody(), null, 2)}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(generateRequestBody(), null, 2), 'body')}
                    className="absolute top-2 right-2 p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
                  >
                    {copied === 'body' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Test Section */}
        <div className="border-b border-neutral-700">
          <button
            onClick={() => toggleSection('test')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50"
          >
            <div className="flex items-center gap-2">
              {expandedSections.test ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Play className="w-4 h-4 text-green-400" />
              <span className="font-medium">Test API</span>
            </div>
          </button>
          
          {expandedSections.test && (
            <div className="px-4 pb-4 space-y-4">
              {/* Input Fields */}
              {inputParams.length > 0 && (
                <div className="space-y-3">
                  {inputParams.map((param) => (
                    <div key={param.name}>
                      <label className="block text-sm text-neutral-400 mb-1">
                        {param.name}
                        {param.required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {param.options ? (
                        <select
                          value={String(testInputs[param.name] ?? param.default ?? '')}
                          onChange={(e) => setTestInputs(prev => ({ ...prev, [param.name]: e.target.value }))}
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">Select...</option>
                          {param.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : param.type === 'boolean' ? (
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(testInputs[param.name] ?? param.default)}
                            onChange={(e) => setTestInputs(prev => ({ ...prev, [param.name]: e.target.checked }))}
                            className="w-4 h-4 rounded bg-neutral-800 border-neutral-600"
                          />
                          <span className="text-sm text-neutral-300">Enabled</span>
                        </label>
                      ) : param.type === 'number' || param.type === 'integer' ? (
                        <input
                          type="number"
                          value={String(testInputs[param.name] ?? param.default ?? '')}
                          onChange={(e) => setTestInputs(prev => ({ 
                            ...prev, 
                            [param.name]: e.target.value ? Number(e.target.value) : undefined 
                          }))}
                          min={param.min}
                          max={param.max}
                          placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={String(testInputs[param.name] ?? param.default ?? '')}
                          onChange={(e) => setTestInputs(prev => ({ ...prev, [param.name]: e.target.value }))}
                          placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Async toggle */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={asyncMode}
                  onChange={(e) => setAsyncMode(e.target.checked)}
                  className="w-4 h-4 rounded bg-neutral-800 border-neutral-600"
                />
                <span className="text-neutral-300">Async execution</span>
                <span className="text-neutral-500">(returns immediately with run ID)</span>
              </label>

              {/* cURL Toggle */}
              <div>
                <button
                  onClick={() => setShowCurl(!showCurl)}
                  className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-300"
                >
                  {showCurl ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Code className="w-4 h-4" />
                  Show cURL command
                </button>
                
                {showCurl && (
                  <div className="mt-2 relative">
                    <pre className="p-3 bg-neutral-950 rounded-lg text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                      {generateCurlCommand()}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(generateCurlCommand(), 'curl')}
                      className="absolute top-2 right-2 p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
                    >
                      {copied === 'curl' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Run Button */}
              <button
                onClick={testFlow}
                disabled={isTesting}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Request
                  </>
                )}
              </button>

              {/* Test Result */}
              {testResult && (
                <div className={`p-3 rounded-lg ${
                  testResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className={`font-medium ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult.success ? 'Success' : 'Failed'}
                      </span>
                      {testResult.status && renderStatusBadge(testResult.status)}
                    </div>
                    {testResult.executionTimeMs !== undefined && (
                      <span className="text-xs text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {testResult.executionTimeMs}ms
                      </span>
                    )}
                  </div>
                  
                  {testResult.error && (
                    <div className="text-sm text-red-300 mb-2">
                      <span className="font-medium">{testResult.error.code}:</span>{' '}
                      {testResult.error.message}
                    </div>
                  )}
                  
                  {testResult.runId && (
                    <div className="text-xs text-neutral-500 mb-2">
                      Run ID: <code className="text-cyan-400">{testResult.runId}</code>
                    </div>
                  )}
                  
                  {testResult.outputs && Object.keys(testResult.outputs).length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-neutral-400 mb-1">Outputs</h5>
                      <pre className="text-xs text-neutral-300 bg-neutral-900/50 p-2 rounded overflow-x-auto max-h-48">
                        {JSON.stringify(testResult.outputs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Response Schema Section */}
        <div className="border-b border-neutral-700">
          <button
            onClick={() => toggleSection('response')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-800/50"
          >
            <div className="flex items-center gap-2">
              {expandedSections.response ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <FileJson className="w-4 h-4 text-purple-400" />
              <span className="font-medium">Response Schema</span>
            </div>
          </button>
          
          {expandedSections.response && (
            <div className="px-4 pb-4 space-y-3">
              {/* Sync response */}
              <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-bold">200</span>
                  <span className="text-sm text-neutral-300">Sync Execution Success</span>
                </div>
                <pre className="text-xs text-neutral-400 bg-neutral-900/50 p-2 rounded overflow-x-auto">
{`{
  "success": true,
  "runId": "uuid",
  "status": "completed",
  "outputs": {
    "schematic": { ... }  // Output data
  },
  "artifacts": [
    {
      "id": "uuid",
      "name": "output",
      "type": "schematic",
      "format": "schem",
      "size": 1234,
      "downloadUrl": "/api/v1/runs/{runId}/artifacts/{id}"
    }
  ],
  "executionTimeMs": 123
}`}
                </pre>
              </div>
              
              {/* Async response */}
              <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">202</span>
                  <span className="text-sm text-neutral-300">Async Execution Started</span>
                </div>
                <pre className="text-xs text-neutral-400 bg-neutral-900/50 p-2 rounded overflow-x-auto">
{`{
  "success": true,
  "runId": "uuid",
  "status": "pending",
  "statusUrl": "/api/v1/runs/{runId}",
  "resultUrl": "/api/v1/runs/{runId}/result"
}`}
                </pre>
              </div>

              {/* Result endpoint */}
              <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">GET</span>
                  <span className="text-sm text-neutral-300">/api/v1/runs/{'{runId}'}/result</span>
                </div>
                <p className="text-xs text-neutral-500 mb-2">Poll this endpoint to get result when async</p>
                <pre className="text-xs text-neutral-400 bg-neutral-900/50 p-2 rounded overflow-x-auto">
{`{
  "success": true,
  "status": "completed",
  "outputs": { ... },
  "artifacts": [ ... ]
}`}
                </pre>
              </div>

              {/* Artifact download */}
              <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">GET</span>
                  <span className="text-sm text-neutral-300">/api/v1/runs/{'{runId}'}/artifacts/{'{artifactId}'}</span>
                </div>
                <p className="text-xs text-neutral-500">Download schematic or other generated files directly</p>
              </div>
              
              {/* Error response */}
              <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-bold">4xx/5xx</span>
                  <span className="text-sm text-neutral-300">Error Response</span>
                </div>
                <pre className="text-xs text-neutral-400 bg-neutral-900/50 p-2 rounded overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-neutral-700 bg-neutral-800/50">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>Flow: {flowName}</span>
          <span>API v1</span>
        </div>
      </div>
    </div>
  );
}
