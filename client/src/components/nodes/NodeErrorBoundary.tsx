/**
 * NodeErrorBoundary + withNodeBoundary — per-node render isolation.
 *
 * WHY: React Flow renders every node component inside one shared React tree.
 * A single node component that throws during render (e.g. a bad map lookup like
 * the old `TYPE_META[dataType]` crash, or destructuring `undefined` data from a
 * legacy/pasted/programmatically-created flow) unwinds the WHOLE tree and blanks
 * the entire canvas — every other node disappears too.
 *
 * FIX: wrap each registered node component in its own error boundary so a
 * throwing node renders a compact, node-shaped FALLBACK card instead of taking
 * down the canvas. Other nodes keep working.
 *
 * FALLBACK + edges tradeoff: React Flow positions a node's incoming/outgoing
 * edges using the handle DOM elements the node renders. When a node throws we no
 * longer know which handles it *would* have rendered, so the fallback renders a
 * single generic source + target handle (so an edge endpoint still has somewhere
 * to anchor and the layout doesn't collapse) inside a stable, fixed-min-size
 * box. Edges to *named* handles that no longer exist will float to the node box
 * (React Flow's default for a missing handle) — acceptable: the node is visibly
 * broken and the rest of the graph survives. See MORNING-REVIEW NEEDS-VISUAL-REVIEW.
 */

import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface BoundaryProps {
  /** The node id (for the fallback label + console log). */
  nodeId?: string;
  /** The node type (for the fallback label + console log). */
  nodeType?: string;
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

export class NodeErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log with node id/type so a broken node is traceable in the console.
    console.error(
      `[NodeErrorBoundary] Node "${this.props.nodeId ?? '?'}" (type "${this.props.nodeType ?? '?'}") failed to render:`,
      error,
      info?.componentStack
    );
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const message = error?.message || String(error);
      return (
        <div
          className="relative flex flex-col gap-1 rounded-lg border border-red-500/60 bg-red-950/80 px-3 py-2 text-red-200 shadow-lg shadow-red-500/10"
          style={{ minWidth: 180, maxWidth: 260 }}
          title={message}
        >
          {/* Generic handles so edges still have an anchor and layout survives. */}
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            style={{ top: '50%', left: -6 }}
            className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-red-400"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            style={{ top: '50%', right: -6 }}
            className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-red-400"
          />

          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span aria-hidden>⚠</span>
            <span className="truncate">Node failed to render</span>
          </div>
          <div className="text-[10px] font-mono text-red-300/80 break-words line-clamp-3">
            {message}
          </div>
          <div className="text-[9px] font-mono text-red-400/60 truncate">
            {this.props.nodeType ?? 'node'} · {this.props.nodeId ?? '?'}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrap a React Flow node component so it can never hard-crash the canvas.
 *
 * Preserves the wrapped component's `displayName` (handy in React DevTools and
 * keeps the error log readable). The wrapper forwards the full `NodeProps`, and
 * passes the node id/type into the boundary for the fallback + console log.
 *
 * NOTE: React Flow does not pass a ref to node components, so no ref forwarding
 * is required here. memo() is applied to the *inner* node components already;
 * this thin functional wrapper re-renders only when React Flow re-renders the
 * node (i.e. when its props change), so it adds no meaningful overhead.
 */
export function withNodeBoundary<P extends NodeProps>(
  Wrapped: ComponentType<P>
): ComponentType<P> {
  const Boundaried = (props: P) => (
    <NodeErrorBoundary nodeId={props.id} nodeType={props.type}>
      <Wrapped {...props} />
    </NodeErrorBoundary>
  );
  const inner =
    (Wrapped as { displayName?: string; name?: string }).displayName ||
    (Wrapped as { name?: string }).name ||
    'Node';
  Boundaried.displayName = `withNodeBoundary(${inner})`;
  return Boundaried;
}
