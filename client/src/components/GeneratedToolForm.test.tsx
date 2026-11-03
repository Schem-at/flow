import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GeneratedToolForm } from './GeneratedToolForm';
import { getToolInputContract } from '@flow/core';
vi.mock('./blocks/widgets', () => ({ FieldWidget: ({ ariaLabel, value, onChange }: any) => React.createElement('input', { 'aria-label': ariaLabel, value: value ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }) }));
afterEach(cleanup);
const nodes = [
  { id: 'shade', type: 'input', data: { label: 'shading', toolField: { label: 'Lighting', group: 'Appearance' } } },
  { id: 'light', type: 'input', data: { label: 'strength', toolField: { label: 'Light strength', group: 'Appearance', advanced: true, when: { field: 'shading', is: 'directional' } } } },
];
it('uses graph conditions and retains the input name when the display label changes', () => {
  const onChange = vi.fn();
  const view = render(<GeneratedToolForm nodes={nodes} values={{ shading: 'flat' }} onChange={onChange}/>);
  expect(screen.queryByLabelText('Light strength')).toBeNull();
  view.rerender(<GeneratedToolForm nodes={nodes} values={{ shading: 'directional' }} onChange={onChange}/>);
  expect(screen.getByText('Advanced options · 1')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Light strength'), { target: { value: '3' } });
  expect(onChange).toHaveBeenCalledWith('strength', '3');
  expect(screen.getByText('Appearance')).toBeTruthy();
});

it('renders a custom Form node with explicit API keys, ordering and row widths', () => {
  const contract = getToolInputContract({ nodes: [{ id: 'f', type: 'form', data: { label: 'Size', fields: [
    { name: 'h1', inputName: 'width', value: 5, fieldType: { kind: 'number' }, toolField: { label: 'Width', order: 2, width: 'half' } },
    { name: 'h2', inputName: 'height', value: 10, fieldType: { kind: 'number' }, toolField: { label: 'Height', order: 1 } },
  ] } }] });
  const onChange = vi.fn();
  render(<GeneratedToolForm nodes={contract.nodes} values={contract.defaults} onChange={onChange}/>);
  expect(screen.getAllByRole('textbox').map(el => el.getAttribute('aria-label'))).toEqual(['Height', 'Width']);
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '8' } });
  expect(onChange).toHaveBeenCalledWith('width', '8');
  expect(screen.getByText('Size')).toBeTruthy();
});
