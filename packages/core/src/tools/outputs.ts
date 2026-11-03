/**
 * Output ports of a tool graph, named exactly as compileFlow names the keys of
 * the compiled `generate()` result (label, de-duplicated with _2, _3 …; only
 * output nodes with an incoming edge count).
 */
const OUTPUT_TYPES = new Set(['output', 'file_output', 'schematic_output']);

export type ToolOutputKind = 'schematic' | 'image' | 'text' | 'json';

export interface ToolOutputPort {
  name: string;
  nodeId: string;
  /** The editor's declared value type for the port (dataType / fieldType.kind). */
  dataType?: string;
  /** Explicit serialization format for schematic ports ('schem' | 'litematic'). */
  format?: string;
}

export function toolOutputPorts(graph: { nodes?: any[]; edges?: any[] }): ToolOutputPort[] {
  const used = new Set<string>();
  const ports: ToolOutputPort[] = [];
  for (const node of graph.nodes ?? []) {
    if (!OUTPUT_TYPES.has(node.type)) continue;
    if (!(graph.edges ?? []).some((e: any) => e.target === node.id)) continue;
    const base = node.data?.label || 'output';
    let name = base, i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    const dataType = node.data?.fieldType?.kind ?? node.data?.dataType ?? (node.type === 'schematic_output' ? 'schematic' : node.type === 'file_output' ? 'file' : undefined);
    ports.push({ name, nodeId: node.id, dataType, ...(node.data?.format ? { format: String(node.data.format) } : {}) });
  }
  return ports;
}
