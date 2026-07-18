/**
 * BundleNode — packs several named inputs into ONE object value.
 *
 * The user adds/removes/renames fields with the inline editor; each field is a
 * left-side INPUT port (handle id = field name). The single right-side OUTPUT
 * port emits `{ kind: 'object' }` whose `fields` are derived from the field
 * names (types inferred from connected sources by the flow-compiler).
 *
 * The compiler resolves the bundle's incoming edges and emits an object literal
 * `const __bundle = { fieldA: <expr>, fieldB: <expr> }`; the output expression
 * is that const. Unconnected fields are omitted (read as `undefined`).
 *
 * Field config lives in `data.bundleFields: { name: string }[]`.
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { Package, Plus, X } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';
import { useNodeResizeInternals } from '../../hooks/useNodeResizeInternals';

interface BundleField {
  name: string;
}

interface BundleNodeData {
  label?: string;
  bundleFields?: BundleField[];
}

const DEFAULT_FIELDS: BundleField[] = [{ name: 'a' }, { name: 'b' }];

/** Make a unique field name like `field`, `field2`, `field3`, … */
function nextFieldName(existing: BundleField[]): string {
  const taken = new Set(existing.map((f) => f.name));
  if (!taken.has('field')) return 'field';
  let i = 2;
  while (taken.has(`field${i}`)) i++;
  return `field${i}`;
}

const BundleNode = memo(({ id, data, selected }: NodeProps & { data: BundleNodeData }) => {
  const selectNode = useFlowStore((state) => state.selectNode);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  // The single object-output handle is anchored to the header; re-measure on any
  // height change (fields added/removed) so it stays on its visible dot.
  useNodeResizeInternals(id, rootRef);

  // Guard: older/pasted/programmatic flows may carry a missing, non-array, or
  // empty `bundleFields` (or entries without a string `name`). Normalise to a
  // safe array so the `.map`/`.filter`/`.findIndex` below can never crash.
  const fields =
    Array.isArray(data?.bundleFields) && data.bundleFields.length
      ? data.bundleFields.map((f) => ({ name: typeof f?.name === 'string' ? f.name : '' }))
      : DEFAULT_FIELDS;

  // The input handle set is derived from the (dynamic) field names — each field
  // is one left-side port. When fields are added/removed/renamed React Flow must
  // re-measure handle bounds, else edges connect to stale positions.
  const fieldsSig = fields.map((f) => f.name).join('|');
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, fieldsSig]);

  // Which field ports currently have an incoming edge (for handle styling).
  const connected = useFlowStore(
    useShallow((state) =>
      new Set(
        state.edges
          .filter((e) => e.target === id)
          .map((e) => e.targetHandle ?? '')
      )
    )
  );

  const setFields = useCallback(
    (next: BundleField[]) => updateNodeData(id, { bundleFields: next }),
    [id, updateNodeData]
  );

  const addField = useCallback(() => {
    setFields([...fields, { name: nextFieldName(fields) }]);
  }, [fields, setFields]);

  const removeField = useCallback(
    (index: number) => setFields(fields.filter((_, i) => i !== index)),
    [fields, setFields]
  );

  const renameField = useCallback(
    (index: number, name: string) =>
      setFields(fields.map((f, i) => (i === index ? { name } : f))),
    [fields, setFields]
  );

  return (
    <div
      className={`
        relative min-w-[190px] max-w-[240px] rounded-xl overflow-visible
        bg-neutral-900/80 backdrop-blur-sm border transition-colors duration-150
        ${selected ? 'border-violet-500 shadow-lg shadow-violet-500/10' : 'border-neutral-700/60'}
      `}
      ref={rootRef}
      onClick={() => selectNode(id)}
    >
      {/* Header — the single object OUTPUT handle is anchored to this fixed-height
          row (not 50% of the whole node) so it stays on its dot as fields grow. */}
      <div className="relative flex items-center gap-2 px-3 py-2 border-b border-neutral-800/50">
        <Package className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-medium text-white truncate flex-1">
          {data?.label || 'Bundle'}
        </span>
        <span className="text-[10px] text-violet-400/70 font-mono">obj</span>
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ top: '50%', right: '-6px', transform: 'translateY(-50%)' }}
          className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-violet-400"
          title="object"
        />
      </div>

      {/* Fields (each an input port) */}
      <div className="px-2 py-2 space-y-1.5">
        {fields.map((field, index) => {
          const isConnected = connected.has(field.name);
          // Blank names are dropped by the compiler; a duplicate name silently
          // overwrites the earlier key (object literal, last-wins). Flag both so
          // the user can make the name unique before it bites.
          const trimmed = field.name.trim();
          const isInvalid =
            trimmed.length === 0 ||
            fields.findIndex((f) => f.name === field.name) !== index;
          return (
            <div
              key={index}
              className={`relative flex items-center gap-1.5 rounded border px-1.5 py-1 ${
                isConnected
                  ? 'border-violet-500/30 bg-violet-500/10'
                  : 'border-neutral-700/50 bg-neutral-800/40'
              }`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={field.name}
                style={{ top: '50%', left: '-15px', transform: 'translateY(-50%)' }}
                className={`!w-3 !h-3 !border-2 !border-neutral-900 ${
                  isConnected ? '!bg-violet-500' : '!bg-neutral-600'
                }`}
              />
              <input
                type="text"
                value={field.name}
                onChange={(e) => renameField(index, e.target.value)}
                placeholder="field"
                title={isInvalid ? 'Field names must be unique and non-empty' : undefined}
                className={`flex-1 min-w-0 px-1 py-0.5 bg-transparent text-[11px] font-mono focus:outline-none nodrag ${
                  isInvalid ? 'text-red-400' : 'text-white'
                }`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeField(index);
                }}
                title="Remove field"
                className="shrink-0 p-0.5 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 nodrag"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <button
          onClick={(e) => {
            e.stopPropagation();
            addField();
          }}
          className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-neutral-700 text-[10px] text-neutral-400 hover:text-violet-300 hover:border-violet-500/40 transition-colors nodrag"
        >
          <Plus className="w-3 h-3" /> field
        </button>
      </div>
    </div>
  );
});

BundleNode.displayName = 'BundleNode';

export default BundleNode;
