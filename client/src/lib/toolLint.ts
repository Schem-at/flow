import { lintTool, hasLintErrors, type ToolLintIssue } from '@flow/core';
import { loadBrowserBlockTypechecker } from './block/typecheck';

/**
 * The publish gate: structural tool checks plus the editor's own TypeScript
 * view of every code block. Publishing (submit for review / approve) is
 * refused while any issue has severity "error".
 */
export async function lintToolForPublish(graph: { nodes: unknown[]; edges: unknown[]; metadata?: unknown }): Promise<ToolLintIssue[]> {
  const typecheck = await loadBrowserBlockTypechecker();
  return lintTool(graph, { typecheck: (source) => typecheck(source) });
}

export { hasLintErrors };
export type { ToolLintIssue };
