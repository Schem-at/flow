/**
 * Group-collapse on input nodes produces a dense FORM node (and ungroup expands
 * it back), rewiring edges to/from the form's per-field handles.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowStore } from './flowStore';
import { getToolInputContract } from '@flow/core';

function seed() {
  useFlowStore.setState({
    nodes: [
      { id: 'a', type: 'input', position: { x: 0, y: 0 }, data: { label: 'alpha', dataType: 'number', value: 5, min: 0, max: 10 } },
      { id: 'b', type: 'input', position: { x: 0, y: 80 }, data: { label: 'beta', dataType: 'string', value: 'hi' } },
      { id: 'code', type: 'code', position: { x: 300, y: 0 }, data: { label: 'C' } },
    ] as never,
    edges: [
      { id: 'e1', source: 'a', target: 'code', sourceHandle: 'output', targetHandle: 'x' },
      { id: 'e2', source: 'b', target: 'code', sourceHandle: 'output', targetHandle: 'y' },
    ] as never,
    selectedNodeId: null,
    nodeCache: {},
  });
}

describe('group-collapse inputs ↔ form', () => {
  beforeEach(seed);

  it('collapses an all-input selection into a form with one field per input', () => {
    const formId = useFlowStore.getState().groupSelected(['a', 'b']);
    const s = useFlowStore.getState();
    expect(formId).toBeTruthy();
    const form = s.nodes.find((n) => n.id === formId)!;
    expect(form.type).toBe('form');
    expect((form.data.fields ?? []).map((f) => f.name)).toEqual(['alpha', 'beta']);
    expect(s.nodes.some((n) => n.id === 'a' || n.id === 'b')).toBe(false);
    // the edge to the code node now comes from the form's per-field handle
    const ex = s.edges.find((e) => e.target === 'code' && e.targetHandle === 'x')!;
    expect(ex.source).toBe(formId);
    expect(ex.sourceHandle).toBe('alpha');
  });

  it('ungroups a form back into input nodes with rewired edges', () => {
    const formId = useFlowStore.getState().groupSelected(['a', 'b'])!;
    useFlowStore.getState().ungroupNode(formId);
    const s = useFlowStore.getState();
    expect(s.nodes.some((n) => n.id === formId)).toBe(false);
    expect(s.nodes.filter((n) => n.type === 'input')).toHaveLength(2);
    const ex = s.edges.find((e) => e.target === 'code' && e.targetHandle === 'x')!;
    const src = s.nodes.find((n) => n.id === ex.source)!;
    expect(src.type).toBe('input');
    expect(ex.sourceHandle).toBe('output');
    expect(src.data.label).toBe('alpha');
  });

  it('does NOT collapse to a form when the selection includes a non-input', () => {
    const formId = useFlowStore.getState().groupSelected(['a', 'code']);
    const s = useFlowStore.getState();
    const made = s.nodes.find((n) => n.id === formId)!;
    expect(made.type).toBe('group'); // falls through to the normal group path
  });
});

it('keeps constants private when inputs become a form and are ungrouped again', () => {
  seed();
  useFlowStore.getState().updateNodeData('a', { isConstant: true });
  const id = useFlowStore.getState().groupSelected(['a', 'b'])!;
  expect(getToolInputContract({ nodes: useFlowStore.getState().nodes }).fields.map(f => f.name)).toEqual(['beta']);
  useFlowStore.getState().ungroupNode(id);
  expect(getToolInputContract({ nodes: useFlowStore.getState().nodes }).fields.map(f => f.name)).toEqual(['beta']);
});

it('preserves native field types and form presentation when grouping and ungrouping', () => {
  seed();
  const fieldType = { kind: 'palette' as const };
  const toolField = { label: 'Building blocks', group: 'Materials', advanced: true };
  useFlowStore.getState().updateNodeData('a', { fieldType, toolField });
  const formId = useFlowStore.getState().groupSelected(['a', 'b'])!;
  expect(useFlowStore.getState().nodes.find(n => n.id === formId)?.data.fields?.[0]).toMatchObject({ fieldType, toolField });
  useFlowStore.getState().ungroupNode(formId);
  expect(useFlowStore.getState().nodes.find(n => n.data.label === 'alpha')?.data).toMatchObject({ fieldType, toolField });
});
