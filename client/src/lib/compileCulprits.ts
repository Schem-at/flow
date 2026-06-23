/**
 * When a FOLDED flow run fails at compile/type-strip time, the error has no
 * per-node attribution (the whole graph is one script). To avoid flagging every
 * code node, re-compile each code node's source individually and return the
 * one(s) that actually fail — those are the real culprits.
 */

export interface CodeNodeLike {
  id: string;
  type?: string;
  data: { code?: string };
}

export interface CompileCulprit {
  id: string;
  error: Error;
}

export function compileCulprits(
  nodes: CodeNodeLike[],
  compile: (source: string) => unknown
): CompileCulprit[] {
  const culprits: CompileCulprit[] = [];
  for (const node of nodes) {
    if (node.type !== 'code' || !node.data.code) continue;
    try {
      compile(node.data.code);
    } catch (err) {
      culprits.push({ id: node.id, error: err as Error });
    }
  }
  return culprits;
}
