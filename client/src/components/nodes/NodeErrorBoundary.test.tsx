/**
 * Tests for the per-node error boundary (NodeErrorBoundary / withNodeBoundary).
 *
 * The whole point of the boundary is PRODUCTION SAFETY: a single node component
 * that throws during render must NOT propagate and blank the canvas — it must
 * render a compact fallback card instead. We test the boundary directly with a
 * throwing child (rather than the real nodeTypes map) so the test is small and
 * stable. The fallback renders @xyflow/react <Handle>s, so it must mount inside
 * a <ReactFlowProvider>.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NodeErrorBoundary, withNodeBoundary } from './NodeErrorBoundary';

// React logs caught render errors to console.error; silence it so the test
// output stays clean (and assert nothing leaks past the boundary).
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error('kaboom from a node');
}

function Fine() {
  return <div>i am fine</div>;
}

describe('NodeErrorBoundary', () => {
  it('renders the fallback card (not a crash) when a child throws', () => {
    render(
      <ReactFlowProvider>
        <NodeErrorBoundary nodeId="n-1" nodeType="constant">
          <Boom />
        </NodeErrorBoundary>
      </ReactFlowProvider>
    );

    // Fallback surfaces the error message + the node type/id.
    expect(screen.getByText(/Node failed to render/i)).toBeTruthy();
    expect(screen.getByText(/kaboom from a node/)).toBeTruthy();
    expect(screen.getByText(/constant/)).toBeTruthy();
    expect(screen.getByText(/n-1/)).toBeTruthy();
  });

  it('renders children unchanged when nothing throws', () => {
    render(
      <ReactFlowProvider>
        <NodeErrorBoundary nodeId="n-2" nodeType="comment">
          <Fine />
        </NodeErrorBoundary>
      </ReactFlowProvider>
    );
    expect(screen.getByText('i am fine')).toBeTruthy();
    expect(screen.queryByText(/Node failed to render/i)).toBeNull();
  });
});

describe('withNodeBoundary', () => {
  it('isolates a throwing node component to its own fallback', () => {
    const ThrowingNode = (() => {
      throw new Error('node render exploded');
    }) as unknown as React.ComponentType<NodeProps>;

    const Wrapped = withNodeBoundary(ThrowingNode);

    render(
      <ReactFlowProvider>
        {/* Minimal NodeProps-ish shape; the boundary only reads id/type. */}
        <Wrapped {...({ id: 'bad', type: 'switch' } as unknown as NodeProps)} />
      </ReactFlowProvider>
    );

    expect(screen.getByText(/Node failed to render/i)).toBeTruthy();
    expect(screen.getByText(/node render exploded/)).toBeTruthy();
    expect(screen.getByText(/switch/)).toBeTruthy();
    expect(screen.getByText(/bad/)).toBeTruthy();
  });

  it('preserves a readable displayName', () => {
    const Some = (() => null) as unknown as React.ComponentType<NodeProps>;
    (Some as { displayName?: string }).displayName = 'ConstantNode';
    const Wrapped = withNodeBoundary(Some);
    expect(Wrapped.displayName).toBe('withNodeBoundary(ConstantNode)');
  });
});
