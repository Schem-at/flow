/**
 * SwitchNode — selects ONE of N case inputs by a numeric `selector` index.
 *
 * Inputs (left ports):
 *   - `selector` — a number index (0-based) choosing which case to pass through.
 *   - `case0`..`case{n-1}` — the candidate values (add/remove like Bundle fields).
 *   - `default` — optional fallback when the selector matches no case.
 * Output (right port): the selected value (`output`).
 *
 * EAGER-EVAL SEMANTICS: this is a pure dataflow graph — every upstream branch is
 * computed regardless of the selection. The switch does NOT lazily skip
 * branches; it merely SELECTS among already-computed values. The compiler emits
 * a chained ternary `(sel === 0 ? <case0> : … : <default>)` over the bound input
 * expressions. (See the meta-nodes design doc.)
 *
 * Case count lives in `data.caseCount` (defaults to 2).
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { GitFork, Plus, X } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useNodeResizeInternals } from '../../hooks/useNodeResizeInternals';

interface SwitchNodeData {
  label?: string;
  caseCount?: number;
}

const DEFAULT_CASE_COUNT = 2;

const SwitchNode = memo(({ id, data, selected }: NodeProps & { data: SwitchNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  // The single selected-value OUTPUT handle is anchored to the header; re-measure
  // on any height change (cases added/removed) so it stays on its dot.
  useNodeResizeInternals(id, rootRef);

  // Guard caseCount: clamp to a sane positive integer (legacy/pasted flows may
  // carry NaN, Infinity, a string, or a huge number). Cap the upper bound so a
  // bad value can't try to render millions of ports and freeze the canvas.
  const rawCount =
    typeof data?.caseCount === 'number' && Number.isFinite(data.caseCount)
      ? Math.floor(data.caseCount)
      : DEFAULT_CASE_COUNT;
  const caseCount = Math.min(64, Math.max(1, rawCount));

  // The case ports (`case0`..`caseN-1`) are derived from caseCount; re-measure
  // handle bounds whenever the count changes so edges attach correctly.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, caseCount]);

  // Which ports currently have an incoming edge (for handle styling).
  const connected = useFlowStore(
    useShallow((state) =>
      new Set(state.edges.filter((e) => e.target === id).map((e) => e.targetHandle ?? ''))
    )
  );

  const setCount = useCallback(
    (next: number) => updateNodeData(id, { caseCount: Math.max(1, next) }),
    [id, updateNodeData]
  );

  const cases = Array.from({ length: caseCount }, (_, i) => `case${i}`);

  return (
    <div
      className={`
        relative min-w-[190px] max-w-[240px] rounded-xl overflow-visible
        bg-neutral-900/80 backdrop-blur-sm border transition-colors duration-150
        ${selected ? 'border-amber-500 shadow-lg shadow-amber-500/10' : 'border-neutral-700/60'}
      `}
      ref={rootRef}
      onClick={() => selectNode(id)}
    >
      {/* Header — the single OUTPUT handle is anchored to this fixed-height row
          (not 50% of the whole node) so it stays on its dot as cases grow. */}
      <div className="relative flex items-center gap-2 px-3 py-2 border-b border-neutral-800/50">
        <GitFork className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-white truncate flex-1">
          {data?.label || 'Switch'}
        </span>
        <span className="text-[10px] text-amber-400/70 font-mono">sel</span>
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ top: '50%', right: '-6px', transform: 'translateY(-50%)' }}
          className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-amber-400"
          title="selected value"
        />
      </div>

      {/* Selector port */}
      <div className="px-2 pt-2">
        <div
          className={`relative flex items-center gap-1.5 rounded border px-1.5 py-1 ${
            connected.has('selector')
              ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-neutral-700/50 bg-neutral-800/40'
          }`}
        >
          <Handle
            type="target"
            position={Position.Left}
            id="selector"
            style={{ top: '50%', left: '-15px', transform: 'translateY(-50%)' }}
            className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
              connected.has('selector') ? '!bg-amber-500' : '!bg-neutral-600'
            }`}
          />
          <span className="flex-1 text-[11px] font-mono text-amber-300">selector</span>
          <span className="text-[9px] text-neutral-500 font-mono">number</span>
        </div>
      </div>

      {/* Case ports */}
      <div className="px-2 py-2 space-y-1.5">
        {cases.map((name, index) => {
          const isConnected = connected.has(name);
          return (
            <div
              key={name}
              className={`relative flex items-center gap-1.5 rounded border px-1.5 py-1 ${
                isConnected
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-neutral-700/50 bg-neutral-800/40'
              }`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={name}
                style={{ top: '50%', left: '-15px', transform: 'translateY(-50%)' }}
                className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
                  isConnected ? '!bg-amber-500' : '!bg-neutral-600'
                }`}
              />
              <span className="flex-1 min-w-0 text-[11px] font-mono text-white truncate">
                {name}
              </span>
              {index === caseCount - 1 && caseCount > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCount(caseCount - 1);
                  }}
                  title="Remove last case"
                  className="shrink-0 p-0.5 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 nodrag"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setCount(caseCount + 1);
          }}
          className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-neutral-700 text-[10px] text-neutral-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors nodrag"
        >
          <Plus className="w-3 h-3" /> case
        </button>

        {/* Default port */}
        <div
          className={`relative flex items-center gap-1.5 rounded border px-1.5 py-1 ${
            connected.has('default')
              ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-neutral-700/50 bg-neutral-800/40'
          }`}
        >
          <Handle
            type="target"
            position={Position.Left}
            id="default"
            style={{ top: '50%', left: '-15px', transform: 'translateY(-50%)' }}
            className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
              connected.has('default') ? '!bg-amber-500' : '!bg-neutral-600'
            }`}
          />
          <span className="flex-1 text-[11px] font-mono text-neutral-400">default</span>
        </div>
      </div>
    </div>
  );
});

SwitchNode.displayName = 'SwitchNode';

export default SwitchNode;
