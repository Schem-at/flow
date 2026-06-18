/**
 * ConstantNode - emits a fixed literal value (no inputs, one typed output).
 *
 * Unlike an InputNode, a constant is NOT exposed as a flow-level input: the
 * compiler bakes its `value` directly as a literal. Supports number, string,
 * boolean, vec3 and block (minecraft id) via a compact inline widget.
 */

import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Hash, Type, ToggleLeft, Box, Move3d, List, Braces } from 'lucide-react';
import { useFlowStore } from '../../store/flowStore';

type ConstantType = 'number' | 'string' | 'boolean' | 'vec3' | 'block' | 'list' | 'object';

interface ConstantNodeData {
  label?: string;
  dataType?: ConstantType;
  value?: unknown;
}

const TYPE_META: Record<ConstantType, { Icon: typeof Hash; color: string }> = {
  number: { Icon: Hash, color: 'text-blue-400' },
  string: { Icon: Type, color: 'text-green-400' },
  boolean: { Icon: ToggleLeft, color: 'text-amber-400' },
  vec3: { Icon: Move3d, color: 'text-pink-400' },
  block: { Icon: Box, color: 'text-orange-400' },
  list: { Icon: List, color: 'text-cyan-400' },
  object: { Icon: Braces, color: 'text-violet-400' },
};

function defaultFor(t: ConstantType): unknown {
  switch (t) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'vec3': return [0, 0, 0];
    case 'block': return 'minecraft:stone';
    case 'list': return [];
    case 'object': return {};
    default: return '';
  }
}

/** Inline JSON editor for `list`/`object` constants — keeps raw text while typing,
 *  only commits the parsed value when it's valid (red border otherwise). */
const JsonWidget = ({
  value,
  onChange,
  kind,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  kind: 'list' | 'object';
}) => {
  const [text, setText] = useState(() => {
    try {
      return JSON.stringify(value ?? (kind === 'list' ? [] : {}));
    } catch {
      return '';
    }
  });
  const [err, setErr] = useState(false);
  return (
    <textarea
      value={text}
      rows={2}
      placeholder={kind === 'list' ? '[1, 2, 3]' : '{ "key": 1 }'}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        try {
          onChange(JSON.parse(t));
          setErr(false);
        } catch {
          setErr(true);
        }
      }}
      className={`w-full px-2 py-1 bg-neutral-800 border rounded text-white text-xs font-mono focus:outline-none nodrag resize-y ${
        err ? 'border-red-500' : 'border-neutral-700 focus:border-cyan-500'
      }`}
    />
  );
};

const ConstantNode = memo(({ id, data, selected }: NodeProps & { data: ConstantNodeData }) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const selectNode = useFlowStore((state) => state.selectNode);

  // Guard against an unexpected/legacy dataType (any value not in TYPE_META) so a
  // bad/missing dataType can never hard-crash the render.
  const dataType: ConstantType =
    data.dataType && data.dataType in TYPE_META ? data.dataType : 'number';
  const { Icon, color } = TYPE_META[dataType] ?? TYPE_META.number;

  const setValue = useCallback(
    (value: unknown) => updateNodeData(id, { value }),
    [id, updateNodeData]
  );

  const setType = useCallback(
    // Constant supports vec3/block beyond the store's narrowed dataType union;
    // the value is still a plain literal, so cast just the dataType field.
    (t: ConstantType) =>
      updateNodeData(id, { dataType: t as 'number' | 'string' | 'boolean', value: defaultFor(t) }),
    [id, updateNodeData]
  );

  const vec = Array.isArray(data.value) ? (data.value as number[]) : [0, 0, 0];

  const renderWidget = () => {
    switch (dataType) {
      case 'number':
        return (
          <input
            type="number"
            value={typeof data.value === 'number' ? data.value : 0}
            onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500 nodrag"
          />
        );
      case 'boolean':
        return (
          <button
            onClick={() => setValue(!data.value)}
            className={`w-full py-1.5 rounded text-xs font-medium transition-colors nodrag ${
              data.value ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400'
            }`}
          >
            {data.value ? 'True' : 'False'}
          </button>
        );
      case 'vec3':
        return (
          <div className="flex gap-1 nodrag">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                type="number"
                value={typeof vec[i] === 'number' ? vec[i] : 0}
                onChange={(e) => {
                  const next = [...vec];
                  next[i] = parseFloat(e.target.value) || 0;
                  setValue(next);
                }}
                className="w-full min-w-0 px-1.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs font-mono focus:outline-none focus:border-pink-500"
              />
            ))}
          </div>
        );
      case 'list':
      case 'object':
        return <JsonWidget value={data.value} onChange={setValue} kind={dataType} />;
      case 'block':
      default:
        return (
          <input
            type="text"
            value={String(data.value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dataType === 'block' ? 'minecraft:stone' : 'value'}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs font-mono focus:outline-none focus:border-green-500 nodrag"
          />
        );
    }
  };

  return (
    <div
      className={`
        relative min-w-[170px] max-w-[220px] rounded-xl overflow-visible
        bg-neutral-900/80 backdrop-blur-sm border transition-colors duration-150
        ${selected ? 'border-neutral-500 shadow-lg' : 'border-neutral-700/60'}
      `}
      onClick={() => selectNode(id)}
    >
      {/* Header with type selector */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800/50">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-xs font-medium text-white truncate flex-1">
          {data.label || 'Constant'}
        </span>
        <select
          value={dataType}
          onChange={(e) => setType(e.target.value as ConstantType)}
          className="text-[10px] bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-neutral-300 focus:outline-none nodrag"
        >
          <option value="number">num</option>
          <option value="string">str</option>
          <option value="boolean">bool</option>
          <option value="vec3">vec3</option>
          <option value="block">block</option>
          <option value="list">list</option>
          <option value="object">object</option>
        </select>
      </div>

      <div className="px-3 py-2">{renderWidget()}</div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ top: '50%', right: '-6px' }}
        className="!w-3 !h-3 !border-2 !border-neutral-900 !bg-neutral-400"
        title="Output"
      />
    </div>
  );
});

ConstantNode.displayName = 'ConstantNode';

export default ConstantNode;
