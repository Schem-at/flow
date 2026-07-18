/**
 * Form meta-node expansion.
 *
 * A `form` node is a DENSE input form: it holds many fields in one node instead
 * of N separate `input` nodes. At compile time it expands into exactly those
 * synthetic `input` nodes (one per field) plus an optional `bundle` node (the
 * form's object handle), with edges rewired from the form's per-field / bundled
 * handles to the synthetic producers. The rest of the compiler then handles a
 * plain flow with ZERO form-specific logic — fields become flow inputs, the
 * bundled handle becomes a `{...}` object, exactly like hand-wired input+bundle
 * nodes. Pure; returns the flow unchanged when there are no form nodes.
 */

import type { FlowLike } from './flow-compiler.js';

export interface FormField {
  name: string;
  label?: string;
  dataType?: 'number' | 'string' | 'boolean' | 'enum';
  widgetType?: 'slider' | 'number' | 'text' | 'textarea' | 'toggle' | 'select';
  value?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface FormNodeData {
  label?: string;
  fields: FormField[];
  /** The optional single object output handle (defaults to handle name `values`). */
  bundle?: { enabled?: boolean; name?: string };
}

export function isFormNodeData(data: unknown): data is FormNodeData {
  return !!data && Array.isArray((data as { fields?: unknown }).fields);
}

/** Widget-config keys copied verbatim onto the synthetic input node's data. */
const FIELD_KEYS = ['dataType', 'widgetType', 'value', 'min', 'max', 'step', 'options'] as const;

export function expandFormNodes(flow: FlowLike): FlowLike {
  if (!flow.nodes.some((n) => n.type === 'form')) return flow;

  const nodes: FlowLike['nodes'] = [];
  const extraEdges: FlowLike['edges'] = [];
  // `${formId}::${handle}` -> rewired producer (synthetic input / bundle).
  const remap = new Map<string, { source: string; sourceHandle: string }>();

  for (const node of flow.nodes) {
    if (node.type !== 'form' || !isFormNodeData(node.data)) {
      nodes.push(node);
      continue;
    }
    const fields = node.data.fields ?? [];
    const fieldId = (name: string) => `${node.id}__f_${name}`;

    for (const field of fields) {
      const data: Record<string, unknown> = { label: field.label || field.name };
      for (const k of FIELD_KEYS) {
        if (field[k] !== undefined) data[k] = field[k];
      }
      nodes.push({ id: fieldId(field.name), type: 'input', data });
      remap.set(`${node.id}::${field.name}`, { source: fieldId(field.name), sourceHandle: 'output' });
    }

    if (node.data.bundle?.enabled) {
      const bundleId = `${node.id}__bundle`;
      const bundleHandle = node.data.bundle.name || 'values';
      nodes.push({
        id: bundleId,
        type: 'bundle',
        data: { label: node.data.label || 'form', bundleFields: fields.map((f) => ({ name: f.name })) },
      });
      for (const field of fields) {
        extraEdges.push({
          source: fieldId(field.name),
          target: bundleId,
          sourceHandle: 'output',
          targetHandle: field.name,
        });
      }
      remap.set(`${node.id}::${bundleHandle}`, { source: bundleId, sourceHandle: 'output' });
    }
  }

  const edges: FlowLike['edges'] = [
    ...flow.edges.map((e) => {
      const r = remap.get(`${e.source}::${e.sourceHandle ?? ''}`);
      return r ? { ...e, source: r.source, sourceHandle: r.sourceHandle } : e;
    }),
    ...extraEdges,
  ];

  return { ...flow, nodes, edges };
}
