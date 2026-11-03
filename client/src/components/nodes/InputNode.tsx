import { memo, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { Settings, Lock, Unlock, SlidersHorizontal, Maximize2 } from 'lucide-react';
import { inputName, inputFieldType, inputDefault, type ToolInputNode } from '@flow/core';
import { useFlowStore } from '../../store/flowStore';
import { FieldWidget } from '../blocks/widgets';
import { InputFieldEditor } from '../blocks/InputFieldEditor';
import { NodeContextMenu, NodeContextMenuItem } from './NodeContextMenu';
export type DataType = 'number' | 'string' | 'boolean';

const InputNode = memo(({ id, data, selected, type }: NodeProps) => {
  const updateNodeData = useFlowStore(s => s.updateNodeData);
  const selectNode = useFlowStore(s => s.selectNode);
  const setNodeOutput = useFlowStore(s => s.setNodeOutput);
  const [settings, setSettings] = useState(false);
  const node: ToolInputNode = { id, type, data };
  const fieldType = inputFieldType(node), name = inputName(node);
  const presentation = data.toolField as {label?: string; help?: string} | undefined;
  return <>
    <NodeResizer minWidth={260} minHeight={120} isVisible={!!data.isResizable && !!selected} onResizeEnd={(_, size) => updateNodeData(id, { width: size.width, height: size.height })}/>
    <div className={`group relative rounded-lg border bg-neutral-900 ${selected ? 'border-brand-400/60' : 'border-neutral-700'}`} style={{ width: settings ? Math.max(Number(data.width) || 300, 340) : Number(data.width) || 300 }} onClick={() => selectNode(id)}>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
        <SlidersHorizontal size={15} className="shrink-0 text-brand-400"/>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-neutral-100">{presentation?.label || String(data.label || name)}</p><p className="mt-1 truncate font-mono text-[10px] text-neutral-500">{data.isConstant ? 'Constant' : name} · {fieldType.kind}</p></div>
        <button className="nodrag p-1 text-neutral-400" title="Input settings" aria-label="Input settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings size={14}/></button>
        <button className="nodrag p-1 text-neutral-400" title={data.isConstant ? 'Expose in form and API' : 'Make constant'} aria-pressed={!!data.isConstant} onClick={() => updateNodeData(id, { isConstant: !data.isConstant })}>{data.isConstant ? <Lock size={14}/> : <Unlock size={14}/>}</button>
        <NodeContextMenu><NodeContextMenuItem icon={Maximize2} checked={!!data.isResizable} onClick={() => updateNodeData(id, { isResizable: !data.isResizable })}>Resizable</NodeContextMenuItem></NodeContextMenu>
      </header>
      <div className="nodrag nopan space-y-4 p-3"><FieldWidget type={fieldType} value={inputDefault(node)} ariaLabel={presentation?.label || name} onChange={value => { updateNodeData(id, { value, ...(type === 'file_input' ? { fileData: undefined } : {}) }); setNodeOutput(id, { output: value }); }}/>
        {presentation?.help && <p className="text-xs text-neutral-500">{presentation.help}</p>}
        {settings && <InputFieldEditor node={node} onChange={patch => updateNodeData(id, { ...patch, ...('value' in patch && type === 'file_input' ? { fileData: undefined } : {}) })}/>}
      </div>
      <Handle id="output" type="source" position={Position.Right} className="!h-3 !w-3 !bg-brand-400" title={`${name} output`}/>
    </div>
  </>;
});
InputNode.displayName = 'InputNode';
export default InputNode;
