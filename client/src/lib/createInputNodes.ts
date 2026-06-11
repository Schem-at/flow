/**
 * Create input nodes (with the right widgets) for a code node's unconnected
 * primitive inputs, wired straight to the typed ports. Used by the node's
 * inline "create inputs" button and the code panel.
 */

import { uuid } from './uuid';
import { useFlowStore, type FlowNode } from '../store/flowStore';
import type { FlowType } from '@flow/core';
import { defaultValueForType } from '@flow/core';

const WIDGETABLE_KINDS = ['number', 'string', 'boolean', 'enum', 'block'];

export function missingWidgetableInputs(
  contract: { inputs: Record<string, FlowType> } | undefined,
  connected: Set<string | null | undefined>
): Array<[string, FlowType]> {
  if (!contract) return [];
  return Object.entries(contract.inputs).filter(
    ([name, type]) => !connected.has(name) && WIDGETABLE_KINDS.includes(type.kind)
  );
}

export function createInputNodesForNode(nodeId: string): number {
  const { nodes, edges, addNode, setEdges, setNodeOutput } = useFlowStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  const contract = node?.data.contract;
  if (!node || !contract) return 0;

  const connected = new Set(
    edges.filter((e) => e.target === nodeId).map((e) => e.targetHandle)
  );
  const missing = missingWidgetableInputs(contract, connected);
  if (!missing.length) return 0;

  const newEdges = [...edges];
  missing.forEach(([name, type], index) => {
    const inputId = `input-${nodeId}-${name}-${uuid().slice(0, 8)}`;
    const value = defaultValueForType(type);

    let dataType: 'number' | 'string' | 'boolean' = 'string';
    let widgetType = 'text';
    const extra: Record<string, unknown> = {};
    if (type.kind === 'number') {
      dataType = 'number';
      widgetType = type.widget === 'slider' ? 'slider' : 'number';
      extra.min = type.min;
      extra.max = type.max;
      extra.step = type.step;
    } else if (type.kind === 'boolean') {
      dataType = 'boolean';
      widgetType = 'boolean';
    } else if (type.kind === 'enum') {
      widgetType = 'select';
      extra.options = type.options.map(String);
    }

    addNode({
      id: inputId,
      type: 'input',
      position: {
        x: node.position.x - 320,
        y: node.position.y + (index - (missing.length - 1) / 2) * 120,
      },
      data: { label: name, value, dataType, widgetType, ...extra },
    } as FlowNode);

    newEdges.push({
      id: `edge-${inputId}-${nodeId}`,
      source: inputId,
      target: nodeId,
      sourceHandle: 'output',
      targetHandle: name,
      type: 'data',
    });
    // Mark the new input as ready with its default value.
    setTimeout(() => setNodeOutput(inputId, { output: value }), 50);
  });

  setEdges(newEdges);
  return missing.length;
}
