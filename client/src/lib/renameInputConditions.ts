import { expandFormNodes, getToolInputContract, inputName } from '@flow/core';
import type { FlowNode } from '../store/flowStore';

/** API keys may change; graph handles and references to the field remain stable. */
export function renameInputConditions(previous: FlowNode[], next: FlowNode[]): FlowNode[] {
  let before;
  try { before = getToolInputContract({ nodes: previous }); } catch { return next; }
  const expanded = expandFormNodes({ nodes: next as any, edges: [] }).nodes;
  const renames = new Map<string, string>();
  for (const field of before.fields) {
    const updated = expanded.find(n => n.id === field.node.id);
    if (updated?.data.inputName && inputName(updated) !== field.name) renames.set(field.name, inputName(updated));
  }
  if (!renames.size) return next;
  const rename = (field: any) => {
    const when = field.toolField?.when;
    const name = when && renames.get(when.field);
    return name ? { ...field, toolField: { ...field.toolField, when: { ...when, field: name } } } : field;
  };
  return next.map(node => ({ ...node, data: node.type === 'form' ? { ...node.data, fields: (node.data.fields ?? []).map(rename) } : rename(node.data) }));
}
