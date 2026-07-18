/**
 * useNodeResizeInternals — keep React Flow's measured handle bounds in sync with
 * a node whose HEIGHT changes at runtime.
 *
 * The meta-nodes (Map/Group/Bundle/Unbundle/Switch/Inspect/Reroute) anchor each
 * `<Handle>` to the DOM element of the port ROW it represents (mirroring
 * CodeNode), so the visible dot IS the real handle. But React Flow only
 * re-measures handle positions when it's told to. A node's height can change
 * WITHOUT any prop/data change React Flow observes — e.g. an Inspect body grows
 * when a value populates ("no value yet" → multi-line data), or a collapsible
 * body expands. When that happens the row a handle is anchored to moves, so we
 * must call `updateNodeInternals(id)` to make edges re-attach to the new bounds.
 *
 * This hook wires a ResizeObserver to the node root `ref` and calls
 * `updateNodeInternals(id)` on every size change. It complements (does not
 * replace) the existing data-driven `updateNodeInternals` effects in each node
 * — those handle add/remove-of-ports; this handles pure height changes.
 */
import { useEffect } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';

export function useNodeResizeInternals(
  id: string,
  ref: React.RefObject<HTMLElement | null>
): void {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    // Skip the very first synchronous observation (it fires on observe() with
    // the initial size); React Flow already measures on mount. We still want to
    // re-measure on the first REAL resize.
    let primed = false;
    const ro = new ResizeObserver(() => {
      if (!primed) {
        primed = true;
        return;
      }
      updateNodeInternals(id);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, ref, updateNodeInternals]);
}
