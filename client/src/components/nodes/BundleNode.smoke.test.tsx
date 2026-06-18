/**
 * Smoke test for BundleNode — renders the node and asserts the duplicate /
 * blank field-name guard surfaces (invalid field inputs get the red text class
 * + the explanatory title). This is the ONLY component render test; the rest of
 * the meta-node behaviour is covered at the compiler level in
 * `@flow/core`'s flow-compiler.test.ts (which exercises the real fold output).
 *
 * The node calls `useFlowStore` and renders `@xyflow/react` <Handle>s, so it
 * must render inside a <ReactFlowProvider>.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import BundleNode from './BundleNode';

function renderNode(bundleFields: { name: string }[]) {
  return render(
    <ReactFlowProvider>
      <BundleNode
        id="b1"
        type="bundle"
        data={{ label: 'cfg', bundleFields }}
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        deletable
        selectable
        draggable
        {...({} as Record<string, unknown>)}
      />
    </ReactFlowProvider>
  );
}

describe('BundleNode (smoke)', () => {
  it('renders one text input per field', () => {
    renderNode([{ name: 'width' }, { name: 'height' }]);
    const inputs = screen.getAllByPlaceholderText('field') as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.value)).toEqual(['width', 'height']);
  });

  it('flags a duplicate field name as invalid (red text + title)', () => {
    renderNode([{ name: 'width' }, { name: 'width' }]);
    const inputs = screen.getAllByPlaceholderText('field') as HTMLInputElement[];
    // First `width` is valid; the SECOND duplicate is flagged.
    expect(inputs[0].className).toContain('text-white');
    expect(inputs[1].className).toContain('text-red-400');
    expect(inputs[1].title).toMatch(/unique/i);
  });

  it('flags a blank field name as invalid', () => {
    renderNode([{ name: 'ok' }, { name: '' }]);
    const inputs = screen.getAllByPlaceholderText('field') as HTMLInputElement[];
    expect(inputs[1].className).toContain('text-red-400');
  });
});
