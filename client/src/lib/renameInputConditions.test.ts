import { expect, it } from 'vitest';
import { renameInputConditions } from './renameInputConditions';
import { getToolInputContract } from '@flow/core';
import type { FlowNode } from '../store/flowStore';

it('renames standalone and form visibility references without changing handles or mutating the original', () => {
  const nodes = [
    { id: 'toggle', type: 'input', data: { inputName: 'enabled', value: false } },
    { id: 'a', type: 'input', data: { label: 'detail', toolField: { when: { field: 'enabled', is: true } } } },
    { id: 'form', type: 'form', data: { fields: [{ name: 'handle', inputName: 'extra', toolField: { when: { field: 'enabled', not: false } } }] } },
  ] as FlowNode[];
  const next = renameInputConditions(nodes, nodes.map(n => n.id === 'toggle' ? { ...n, data: { ...n.data, inputName: 'showDetails' } } : n));
  expect(next[1].data.toolField?.when).toEqual({ field: 'showDetails', is: true });
  expect(next[2].data.fields?.[0]).toMatchObject({ name: 'handle', inputName: 'extra', toolField: { when: { field: 'showDetails', not: false } } });
  expect(nodes[1].data.toolField?.when?.field).toBe('enabled');
  expect(() => getToolInputContract({ nodes: next })).not.toThrow();
});

it('tracks public-name changes inside a form by the stable field handle', () => {
  const nodes = [{ id: 'f', type: 'form', data: { fields: [{ name: 'toggle_handle', inputName: 'enabled', value: false }, { name: 'detail_handle', inputName: 'detail', toolField: { when: { field: 'enabled', is: true } } }] } }] as FlowNode[];
  const next = structuredClone(nodes);
  next[0].data.fields![0].inputName = 'showDetails';
  expect(renameInputConditions(nodes, next)[0].data.fields![1].toolField?.when?.field).toBe('showDetails');
});
