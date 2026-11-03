import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import OutputNode from './OutputNode';
import { useFlowStore } from '../../store/flowStore';
import { getSharedWorkerClient } from '../../hooks/useLocalExecutor';

vi.mock('../blocks/viewers', () => ({ SchematicViewer: ({ value }: any) => <div role="img" aria-label="Shared schematic renderer">{value.format}</div> }));
vi.mock('../../hooks/useLocalExecutor', () => ({ getSharedWorkerClient: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(value: unknown, data: Record<string, unknown> = {}) {
  useFlowStore.setState({ nodes: [], edges: [], nodeCache: { out: { status: 'completed', output: { default: value } } } });
  return render(<ReactFlowProvider><OutputNode {...({ id: 'out', data: { label: 'result', ...data } } as any)}/></ReactFlowProvider>);
}
it('renders schematic outputs through the shared schematic viewer', () => {
  mount({ format: 'schematic', data: new Uint8Array([1, 2]) }, { dataType: 'schematic' });
  expect(screen.getByRole('img', { name: 'Shared schematic renderer' })).toBeTruthy();
});
it('uses the connected source handle when an output has not received its own trace yet', () => {
  mount(null, { dataType: 'schematic' }); cleanup();
  useFlowStore.setState({ edges: [{ id: 'e', source: 'build', sourceHandle: 'schematic', target: 'out', targetHandle: 'input' }], nodeCache: { build: { status: 'completed', output: { schematic: { format: 'schematic', data: new Uint8Array([1]) } } } } });
  render(<ReactFlowProvider><OutputNode {...({ id: 'out', data: { label: 'schematic' } } as any)}/></ReactFlowProvider>);
  expect(screen.getByRole('img', { name: 'Shared schematic renderer' })).toBeTruthy();
});
it('downloads the graph’s encoded file as bytes with its selected extension', async () => {
  const create = vi.fn((_blob: Blob) => 'blob:test');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('statue.litematic'); });
  mount({ base64: 'AQID', format: 'litematic', metadata: { name: 'statue.litematic' } }, { preview: false });
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(create.mock.calls[0][0]).toMatchObject({ size: 3, type: 'application/octet-stream' });
});
it('shows false and zero as actual output values', () => {
  mount(0); expect(screen.getByText('0')).toBeTruthy(); cleanup();
  mount(false); expect(screen.getByText('false')).toBeTruthy();
});
it('resolves a resident schematic before downloading its bytes', async () => {
  const getData = vi.fn().mockResolvedValue({ format: 'schem', data: new Uint8Array([1, 2, 3]) });
  vi.mocked(getSharedWorkerClient).mockReturnValue({ getData } as any);
  const create = vi.fn((_blob: Blob) => 'blob:test');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('output.schem'); });
  mount({ _schematicHandle: 'resident-statue' }, { dataType: 'schematic' });
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(getData).toHaveBeenCalledWith('resident-statue');
  expect(create.mock.calls[0][0].size).toBe(3);
});
