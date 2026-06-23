/**
 * Regression: changing a value-producing node in LIVE mode must dispatch the
 * `polymerase:liveExecutionTrigger` event (debounced) so the flow re-runs.
 *
 * The bug: only `input`/`*_input` nodes triggered a live re-run. The showcase
 * (and most real flows) drive numbers through `constant` nodes, whose value
 * changes silently did nothing in live mode. See updateNodeData / isValueNode.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFlowStore } from './flowStore';

function seedNode(id: string, type: string, value: unknown) {
  useFlowStore.setState({
    nodes: [{ id, type, position: { x: 0, y: 0 }, data: { value } }] as never,
    edges: [],
  });
}

describe('updateNodeData → live execution trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFlowStore.getState().setExecutionMode('live');
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function fireCountOnValueChange(id: string, type: string): number {
    seedNode(id, type, 0);
    const spy = vi.fn();
    window.addEventListener('polymerase:liveExecutionTrigger', spy);
    useFlowStore.getState().updateNodeData(id, { value: 42 });
    vi.advanceTimersByTime(350); // past the 300ms debounce
    window.removeEventListener('polymerase:liveExecutionTrigger', spy);
    return spy.mock.calls.length;
  }

  it('fires when a CONSTANT value changes (the regression)', () => {
    expect(fireCountOnValueChange('c1', 'constant')).toBe(1);
  });

  it('fires when an INPUT value changes', () => {
    expect(fireCountOnValueChange('i1', 'input')).toBe(1);
  });

  it('fires when a *_input value changes', () => {
    expect(fireCountOnValueChange('n1', 'number_input')).toBe(1);
  });

  it('fires when a FORM field changes (fields, not value)', () => {
    useFlowStore.setState({
      nodes: [{ id: 'f1', type: 'form', position: { x: 0, y: 0 }, data: { fields: [{ name: 'a', value: 0 }] } }] as never,
      edges: [],
    });
    const spy = vi.fn();
    window.addEventListener('polymerase:liveExecutionTrigger', spy);
    useFlowStore.getState().updateNodeData('f1', { fields: [{ name: 'a', value: 7 }] } as never);
    vi.advanceTimersByTime(350);
    window.removeEventListener('polymerase:liveExecutionTrigger', spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire for a non-value node (e.g. viewer)', () => {
    expect(fireCountOnValueChange('v1', 'viewer')).toBe(0);
  });

  it('does NOT fire when execution mode is manual', () => {
    useFlowStore.getState().setExecutionMode('manual');
    expect(fireCountOnValueChange('c2', 'constant')).toBe(0);
  });
});
