import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FileWidget } from './ToolWidgets';
import { validateToolInputs } from '@flow/core';

afterEach(cleanup);
it('stores uploads as a JSON-safe asset that survives saving and loading a graph', async () => {
  const onChange = vi.fn();
  render(<FileWidget type={{ kind: 'file', accept: ['.png'], maxBytes: 10 }} value={null} onChange={onChange}/>);
  const file = new File([new Uint8Array([1, 2])], 'skin.png', { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2]).buffer });
  fireEvent.change(screen.getByLabelText('Input file'), { target: { files: [file] } });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const saved = JSON.parse(JSON.stringify(onChange.mock.calls[0][0]));
  expect(saved).toMatchObject({ format: 'png', metadata: { name: 'skin.png', mimeType: 'image/png' } });
  const inputs = validateToolInputs({ nodes: [{ id: 'file', type: 'input', data: { fieldType: { kind: 'file' } } }] }, { file: saved });
  expect(inputs.file).toMatchObject({ data: new Uint8Array([1, 2]) });
});

it('rejects oversized uploads before reading or committing their contents', () => {
  const onChange = vi.fn();
  render(<FileWidget type={{ kind: 'file', maxBytes: 1 }} value={null} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText('Input file'), { target: { files: [new File(['too big'], 'input.bin')] } });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('exceeds');
});
