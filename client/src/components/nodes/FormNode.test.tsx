import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import FormNode from './FormNode';
import { useFlowStore } from '../../store/flowStore';
import { getToolInputContract } from '@flow/core';

afterEach(cleanup);
function AuthorForm() {
  const node = useFlowStore(s => s.nodes.find(n => n.id === 'form')!);
  return <FormNode {...({ id: node.id, type: 'form', data: node.data, selected: true } as any)}/>;
}

it('authors typed fields with separate labels and API names, and can reorder and remove them', () => {
  useFlowStore.setState({ nodes: [{ id: 'form', type: 'form', position: { x: 0, y: 0 }, data: { label: 'Settings', fields: [] } }], edges: [] });
  render(<ReactFlowProvider><AuthorForm/></ReactFlowProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  const api = screen.getByLabelText('API name');
  fireEvent.change(api, { target: { value: 'width' } }); fireEvent.blur(api);
  fireEvent.change(screen.getByLabelText('Value type'), { target: { value: 'number' } });
  fireEvent.change(screen.getByLabelText('Display label'), { target: { value: 'Width in blocks' } });
  fireEvent.click(screen.getByLabelText('Required'));
  fireEvent.change(screen.getByLabelText('Field width'), { target: { value: 'half' } });
  let contract = getToolInputContract({ nodes: useFlowStore.getState().nodes });
  expect(contract.fields[0]).toMatchObject({ name: 'width', type: { kind: 'number' }, presentation: { label: 'Width in blocks', required: true, width: 'half' } });
  expect(useFlowStore.getState().nodes[0].data.fields![0].name).toBe('field1');
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
  const secondApi = screen.getByLabelText('API name');
  fireEvent.change(secondApi, { target: { value: 'width' } }); fireEvent.blur(secondApi);
  expect(screen.getByRole('alert').textContent).toContain('already uses');
  fireEvent.click(screen.getByRole('button', { name: 'Move Field 2 up' }));
  contract = getToolInputContract({ nodes: useFlowStore.getState().nodes });
  expect(contract.fields.map(f => f.name)).toEqual(['field2', 'width']);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Field 2' }));
  expect(getToolInputContract({ nodes: useFlowStore.getState().nodes }).fields.map(f => f.name)).toEqual(['width']);
});
