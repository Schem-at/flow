/**
 * Bug #29: the group "Subgraph" hover peek says "drag to pan · scroll to zoom",
 * but its wrapper carried React Flow's `nowheel` class. React Flow's own zoom
 * filter rejects wheel events whose target is inside `.nowheel`
 * (`event.target.closest('.nowheel')`), so the preview could never zoom.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GroupSubgraphPreview } from './GroupSubgraphPreview';

beforeAll(() => {
  // jsdom has no ResizeObserver; React Flow needs one to mount.
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NODES = [
  { id: 'a', type: 'default', data: { label: 'A' }, position: { x: 0, y: 0 } },
  { id: 'b', type: 'default', data: { label: 'B' }, position: { x: 200, y: 0 } },
];
const EDGES = [{ source: 'a', target: 'b' }];

function renderPreview() {
  const outerWheel = vi.fn();
  const utils = render(
    <div data-testid="outer-canvas" className="react-flow">
      <GroupSubgraphPreview nodes={NODES} edges={EDGES} />
    </div>
  );
  const outer = utils.getByTestId('outer-canvas');
  outer.addEventListener('wheel', outerWheel);
  // The element React Flow's d3-zoom listens on and tests the filter against.
  const inner = outer.querySelector('.react-flow .react-flow__renderer, .react-flow .react-flow__pane') as HTMLElement | null;
  return { outer, inner, outerWheel };
}

describe('GroupSubgraphPreview wheel handling', () => {
  it('renders an inner React Flow', () => {
    const { inner } = renderPreview();
    expect(inner).not.toBeNull();
  });

  it('wheel events inside the preview are not filtered out by a nowheel ancestor', () => {
    const { inner } = renderPreview();
    // Exactly the check React Flow's zoom filter makes for wheel events.
    expect(inner!.closest('.nowheel')).toBeNull();
  });

  it('wheel events inside the preview do not reach (scroll/zoom) the outer canvas', () => {
    const { inner, outerWheel } = renderPreview();
    inner!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
    expect(outerWheel).not.toHaveBeenCalled();
  });
});
