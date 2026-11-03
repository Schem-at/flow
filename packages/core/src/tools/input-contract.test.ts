import { describe, expect, it } from 'vitest';
import { getToolInputContract } from './input-contract';
import { validateToolInputs } from './validate';
import { compileFlow, type FlowLike } from '../compile/flow-compiler';
import { compileBlock } from '../compile';
import { inputFieldType } from './fields';

async function run(graph: FlowLike, values: Record<string, unknown>) {
  const compiled = compileBlock(compileFlow(graph).source, { contextKeys: ['Progress'] });
  return (0, eval)(compiled.functionCode)(values, { Progress: { report: () => {} } });
}
const form: FlowLike = {
  nodes: [
    { id: 'form', type: 'form', data: { label: 'Dimensions', fields: [
      { name: 'stable_handle', inputName: 'width', value: 4, fieldType: { kind: 'number', min: 1, max: 10 }, toolField: { label: 'Width in blocks', required: true, width: 'half' } },
    ] } },
    { id: 'out', type: 'output', data: { label: 'result' } },
  ],
  edges: [{ source: 'form', sourceHandle: 'stable_handle', target: 'out', targetHandle: 'input' }],
};

describe('the public tool input contract', () => {
  it('uses one API key and default for forms, validation and compiled execution', async () => {
    const contract = getToolInputContract(form);
    expect(contract.defaults).toEqual({ width: 4 });
    expect(contract.fields[0].presentation).toMatchObject({ group: 'Dimensions', label: 'Width in blocks', width: 'half' });
    expect(contract.schema.required).toEqual(['width']);
    expect(validateToolInputs(form, { width: '7' })).toEqual({ width: 7 });
    expect(await run(form, { width: 7 })).toEqual({ result: 7 });
    expect(await run(form, {})).toEqual({ result: 4 });
    expect(() => validateToolInputs(form, { width: 11 })).toThrow('allowed range');
  });

  it('keeps graph wires intact when the public key and display label change', async () => {
    const graph = structuredClone(form);
    const field = graph.nodes[0].data.fields[0];
    field.inputName = 'size'; field.toolField.label = 'New label';
    expect(getToolInputContract(graph).defaults).toEqual({ size: 4 });
    expect(await run(graph, { size: 8 })).toEqual({ result: 8 });
    expect(() => validateToolInputs(graph, { width: 8 })).toThrow('Unknown input: width');
  });

  it('omits constants from the public API and never lets callers override them', async () => {
    const graph: FlowLike = { nodes: [{ id: 'n', type: 'input', data: { label: 'fixed', value: 3, isConstant: true } }, { id: 'o', type: 'output', data: { label: 'result' } }], edges: [{ source: 'n', sourceHandle: 'output', target: 'o', targetHandle: 'input' }] };
    expect(getToolInputContract(graph).fields).toEqual([]);
    expect(compileFlow(graph).inputs).toEqual({});
    expect(compileFlow(graph).contract.inputs).toEqual({});
    expect(await run(graph, { fixed: 99 })).toEqual({ result: 3 });
    expect(() => validateToolInputs(graph, { fixed: 99 })).toThrow('Unknown input');
  });

  it('preserves legacy duplicate labels but rejects ambiguous explicit API names', () => {
    const nodes = [1, 2].map(n => ({ id: String(n), type: 'input', data: { label: 'size', value: n } }));
    expect(getToolInputContract({ nodes }).defaults).toEqual({ size: 1, size_2: 2 });
    expect(compileFlow({ nodes: [...nodes, { id: 'out', type: 'output', data: { label: 'result' } }], edges: [{ source: '1', sourceHandle: 'output', target: 'out', targetHandle: 'input' }] }).inputs).toEqual({ size: 1, size_2: 2 });
    expect(() => getToolInputContract({ nodes: nodes.map(n => ({ ...n, data: { ...n.data, inputName: 'size' } })) })).toThrow('Duplicate API input name');
  });

  it('validates conditional fields after coercing their dependencies, regardless of order', () => {
    const graph = { nodes: [
      { id: 'detail', type: 'input', data: { inputName: 'detail', fieldType: { kind: 'number', max: 5 }, value: 10, toolField: { required: true, when: { field: 'enabled', is: true } } } },
      { id: 'enabled', type: 'input', data: { fieldType: { kind: 'boolean' }, value: false } },
    ] };
    expect(() => validateToolInputs(graph, { enabled: 'false' })).not.toThrow();
    expect(() => validateToolInputs(graph, { enabled: 'true' })).toThrow('allowed range');
    const schema = getToolInputContract(graph).schema;
    expect(schema.properties.detail).not.toHaveProperty('allOf');
    expect(schema.allOf[0]).toMatchObject({ if: { properties: { enabled: { const: true } } }, then: { required: ['detail'], properties: { detail: { allOf: [{ type: 'number', maximum: 5 }, { not: { enum: [null, ''] } }] } } } });
  });

  it('rejects missing required fields and unknown condition references', () => {
    const graph = { nodes: [{ id: 'n', type: 'input', data: { fieldType: { kind: 'string' }, toolField: { required: true } } }] };
    expect(() => validateToolInputs(graph, {})).toThrow('required');
    expect(() => getToolInputContract({ nodes: [{ ...graph.nodes[0], data: { toolField: { when: { field: 'missing', is: 1 } } } }] })).toThrow('Unknown condition input');
  });

  it('retains nested types, fixed list sizes and file limits in the contract', () => {
    const graph = { nodes: [{ id: 'config', type: 'input', data: { fieldType: { kind: 'object', fields: { points: { kind: 'list', of: { kind: 'number' }, length: 2 } } } } }, { id: 'file', type: 'file_input', data: { fieldType: { kind: 'file', accept: ['.png'], maxBytes: 2048 } } }] };
    const fields = getToolInputContract(graph).fields;
    expect(fields[0].type).toEqual(graph.nodes[0].data.fieldType);
    expect(getToolInputContract(graph).schema.properties.file.anyOf[0]).toMatchObject({ 'x-flow-type': 'file', 'x-maxBytes': 2048 });
    expect(() => validateToolInputs(graph, { config: { points: [1] } })).toThrow('expected 2 items');
    expect(() => validateToolInputs(graph, { config: { points: [1, Infinity] } })).toThrow('finite number');
    expect(validateToolInputs(graph, { config: { points: [1, 2] } }).config).toEqual({ points: [1, 2] });
  });

  it('infers old untyped values without emitting invalid TypeScript defaults', () => {
    expect(inputFieldType({ type: 'input', data: { value: 5 } }).kind).toBe('number');
    expect(inputFieldType({ type: 'input', data: { value: { a: 1 } } }).kind).toBe('unknown');
    expect(inputFieldType({ type: 'boolean_input', data: { value: false } }).kind).toBe('boolean');
  });

  it('decodes saved uploads and enforces file constraints inside custom objects', () => {
    const graph = { nodes: [{ id: 'settings', type: 'input', data: { fieldType: { kind: 'object', fields: { file: { kind: 'file', accept: ['.png'], maxBytes: 2 } } } } }] };
    const values = JSON.parse(JSON.stringify({ settings: { file: { base64: 'AQI=', format: 'png', metadata: { name: 'skin.png' } } } }));
    expect((validateToolInputs(graph, values).settings as any).file.data).toEqual(new Uint8Array([1, 2]));
    values.settings.file.base64 = 'AQID';
    expect(() => validateToolInputs(graph, values)).toThrow('settings.file is too large');
  });
});
