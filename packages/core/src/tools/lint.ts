/**
 * lintTool — the publish gate for tool graphs. Structural checks live here so
 * the editor, the server and tests agree; type checking is injected because
 * the editor's TypeScript view (ambient Nucleation typings + lib files) lives
 * in the client.
 */
import { compileFlow } from '../compile/flow-compiler.js';
import { expandFormNodes } from '../compile/form.js';
import { inputFieldType, toolFieldPresentation } from './fields.js';
import { TOOL_INPUT_TYPES, inputName } from './input-contract.js';
import { toolOutputPorts } from './outputs.js';

export const TOOL_RUNTIMES = ['any', 'server', 'browser'] as const;
export type ToolRuntime = (typeof TOOL_RUNTIMES)[number];
export const MAX_TOOL_TIMEOUT_SECONDS = 300;

/** FlowType kinds a remote caller (HTTP / mod / plugin) can supply as JSON. */
export const REMOTE_INPUT_KINDS = new Set(['string', 'number', 'boolean', 'enum', 'set', 'block', 'username', 'file', 'palette', 'vec3']);

/** Implicit-any diagnostics, as errors (noImplicitAny) or suggestions (7044…). */
export const IMPLICIT_ANY_CODES = new Set([7005, 7006, 7008, 7010, 7011, 7019, 7031, 7034, 7043, 7044, 7045, 7046, 7047, 7048, 7049, 7050]);

export interface ToolLintIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  input?: string;
  line?: number;
}

export interface CodeDiagnostic {
  line: number;
  code: number;
  message: string;
  category: 'error' | 'warning' | 'suggestion' | 'message';
}

export interface LintToolOptions {
  /** Type-check one code node's source in the editor's TypeScript view. */
  typecheck?: (source: string, node: { id: string; data?: Record<string, any> }) => CodeDiagnostic[];
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function toolRuntime(graph: { metadata?: any }): ToolRuntime {
  const runtime = graph?.metadata?.tool?.runtime;
  return (TOOL_RUNTIMES as readonly string[]).includes(runtime) ? runtime : 'any';
}

export function hasLintErrors(issues: ToolLintIssue[]): boolean {
  return issues.some(i => i.severity === 'error');
}

function codeNodes(nodes: any[]): any[] {
  return nodes.flatMap(n => [
    ...(n.type === 'code' && typeof n.data?.code === 'string' ? [n] : []),
    ...(Array.isArray(n.data?.subgraph?.nodes) ? codeNodes(n.data.subgraph.nodes) : []),
  ]);
}

export function lintTool(graph: any, options: LintToolOptions = {}): ToolLintIssue[] {
  const issues: ToolLintIssue[] = [];
  const add = (issue: ToolLintIssue) => issues.push(issue);
  const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const tool = graph?.metadata?.tool ?? {};

  // ── metadata ──
  if (tool.timeout == null || tool.timeout === '') add({ severity: 'error', code: 'timeout_missing', message: 'Set a timeout (seconds, at most 300) for this tool.' });
  else if (typeof tool.timeout !== 'number' || !Number.isFinite(tool.timeout) || tool.timeout < 1 || tool.timeout > MAX_TOOL_TIMEOUT_SECONDS)
    add({ severity: 'error', code: 'timeout_invalid', message: `The timeout must be between 1 and ${MAX_TOOL_TIMEOUT_SECONDS} seconds.` });
  if (tool.runtime == null) add({ severity: 'warning', code: 'runtime_missing', message: 'Declare where this tool runs (any, server or browser). It defaults to any.' });
  else if (!(TOOL_RUNTIMES as readonly string[]).includes(tool.runtime))
    add({ severity: 'error', code: 'runtime_invalid', message: `Runtime must be one of: ${TOOL_RUNTIMES.join(', ')}.` });

  // ── inputs ──
  let expanded = nodes;
  try { expanded = expandFormNodes({ nodes: nodes.map(n => ({ ...n, type: n.type ?? 'unknown', data: n.data ?? {} })), edges }).nodes; } catch { /* reported by compile below */ }
  const seen = new Map<string, string>();
  for (const node of expanded) {
    if (!TOOL_INPUT_TYPES.has(node.type) || node.data?.isConstant) continue;
    const data = node.data ?? {};
    const name = inputName(node);
    const label = data.toolField?.label ?? data.label ?? node.id;
    if (!data.inputName && !data.label) {
      add({ severity: 'error', code: 'input_name_missing', nodeId: node.id, message: `Input “${label}” needs a stable API name.` });
    } else if (!NAME_RE.test(name)) {
      add({ severity: 'error', code: 'input_name_invalid', nodeId: node.id, input: name, message: `Input name “${name}” must be letters, digits and underscores (for example block_size).` });
    } else if (seen.has(name)) {
      add({ severity: 'error', code: 'input_name_duplicate', nodeId: node.id, input: name, message: `Two inputs are named “${name}”. Input names must be unique.` });
    }
    seen.set(name, node.id);
    const kind = inputFieldType(node).kind;
    if (!REMOTE_INPUT_KINDS.has(kind))
      add({ severity: 'error', code: 'input_kind_unsupported', nodeId: node.id, input: name, message: `Input “${label}” has type ${kind}, which callers cannot supply. Use text, number, boolean, select, block, file or palette.` });
    const presentation = toolFieldPresentation(node);
    if (!presentation.label) add({ severity: 'warning', code: 'input_label_missing', nodeId: node.id, input: name, message: `Give input “${name}” a human-readable label.` });
    if (!presentation.help) add({ severity: 'warning', code: 'input_description_missing', nodeId: node.id, input: name, message: `Describe input “${name}” so callers know what it does.` });
  }

  // ── outputs ──
  if (toolOutputPorts({ nodes, edges }).length === 0)
    add({ severity: 'error', code: 'output_missing', message: 'Connect at least one output node.' });

  // ── compile ──
  try { compileFlow({ nodes, edges }); }
  catch (error) { add({ severity: 'error', code: 'compile_failed', message: (error as Error).message }); }

  // ── code ──
  if (options.typecheck) {
    for (const node of codeNodes(nodes)) {
      const where = node.data?.label || node.id;
      for (const d of options.typecheck(node.data.code, node)) {
        if (d.category === 'error') add({ severity: 'error', code: 'code_type_error', nodeId: node.id, line: d.line, message: `${where}, line ${d.line}: ${d.message}` });
        else if (IMPLICIT_ANY_CODES.has(d.code)) add({ severity: 'warning', code: 'code_implicit_any', nodeId: node.id, line: d.line, message: `${where}, line ${d.line}: ${d.message}` });
      }
    }
  }
  return issues;
}
