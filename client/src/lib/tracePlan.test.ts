import { describe, it, expect } from 'vitest';
import { compileFlow, type FlowLike } from '@flow/core';
import {
  collectFlowInputs,
  collectOutputNames,
  traceValueToCache,
  flowHasSubflowNodes,
  isFlowInputNode,
  type TracePlanNode,
} from './tracePlan';

describe('tracePlan: collectFlowInputs', () => {
  it('keys inputs by label, de-duping with _2/_3 like compileFlow', () => {
    const nodes: TracePlanNode[] = [
      { id: 'a', type: 'input', data: { label: 'x', value: 1 } },
      { id: 'b', type: 'input', data: { label: 'x', value: 2 } }, // dup label
      { id: 'c', type: 'input', data: { value: 9 } }, // no label → id
    ];
    expect(collectFlowInputs(nodes)).toEqual({ x: 1, x_2: 2, c: 9 });
  });

  it('uses fileData for file_input and skips schematic inputs', () => {
    const nodes: TracePlanNode[] = [
      { id: 'f', type: 'file_input', data: { label: 'f', fileData: { bytes: 1 }, value: 'ignored' } },
      { id: 's', type: 'schematic_input', data: { label: 's', value: 'skip-me' } },
    ];
    const out = collectFlowInputs(nodes);
    expect(out).toEqual({ f: { bytes: 1 } });
    expect('s' in out).toBe(false);
  });

  it('isFlowInputNode matches input/file_input but not schematic_input', () => {
    expect(isFlowInputNode({ id: '1', type: 'input', data: {} })).toBe(true);
    expect(isFlowInputNode({ id: '2', type: 'file_input', data: {} })).toBe(true);
    expect(isFlowInputNode({ id: '3', type: 'schematic_input', data: {} })).toBe(false);
    expect(isFlowInputNode({ id: '4', type: 'code', data: {} })).toBe(false);
  });
});

describe('tracePlan: collectOutputNames', () => {
  it('names output nodes by label, de-duping, matching compileFlow', () => {
    const nodes: TracePlanNode[] = [
      { id: 'o1', type: 'output', data: { label: 'routed' } },
      { id: 'o2', type: 'output', data: { label: 'routed' } },
      { id: 'o3', type: 'file_output', data: {} }, // → 'output'
      { id: 'c', type: 'code', data: {} },
    ];
    const names = collectOutputNames(nodes);
    expect(names.get('o1')).toBe('routed');
    expect(names.get('o2')).toBe('routed_2');
    expect(names.get('o3')).toBe('output');
    expect(names.has('c')).toBe(false);
  });
});

describe('tracePlan: traceValueToCache', () => {
  it('wraps primitives as { output, default }', () => {
    expect(traceValueToCache(70)).toEqual({ output: 70, default: 70 });
  });
  it('spreads objects and adds a default alias', () => {
    const v = { y: 5 };
    expect(traceValueToCache(v)).toEqual({ y: 5, default: v });
  });
  it('wraps arrays as { output, default }', () => {
    const v = [1, 2, 3];
    expect(traceValueToCache(v)).toEqual({ output: v, default: v });
  });
});

describe('tracePlan: flowHasSubflowNodes', () => {
  it('detects the one type compileFlow cannot compile', () => {
    expect(flowHasSubflowNodes([{ id: 's', type: 'subflow', data: {} }])).toBe(true);
    expect(flowHasSubflowNodes([{ id: 'c', type: 'code', data: {} }])).toBe(false);
  });
});

/**
 * End-to-end shape check: the names this module derives are exactly the keys
 * compileFlow expects/produces. This is the contract that lets the live engine
 * feed `inputValues` in and read `__outputs` back out correctly.
 */
describe('tracePlan: name derivation matches compileFlow', () => {
  const ROUTE = `type Inputs = { a: number };
type Outputs = { sum: number };
function generate(inputs) { return { sum: inputs.a + 100 }; }
`;
  const contract = {
    inputs: { a: { kind: 'number' as const } },
    outputs: { sum: { kind: 'number' as const } },
  };

  const flow: FlowLike = {
    nodes: [
      { id: 'in', type: 'input', data: { label: 'base', value: 7 } },
      { id: 'add', type: 'code', data: { label: 'Add', code: ROUTE, contract } },
      { id: 'out', type: 'output', data: { label: 'total' } },
    ],
    edges: [
      { source: 'in', target: 'add', sourceHandle: 'output', targetHandle: 'a' },
      { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
    ],
  };

  it('input names feed compileFlow.inputs and output names index compileFlow.outputs', () => {
    const planNodes = flow.nodes as unknown as TracePlanNode[];
    const inputs = collectFlowInputs(planNodes);
    expect(inputs).toEqual({ base: 7 });

    const compiled = compileFlow(flow, { trace: true });
    // compileFlow baked the same input name…
    expect(Object.keys(compiled.inputs)).toEqual(['base']);
    // …and exposes the same output name our map indexes by.
    const outNames = collectOutputNames(planNodes);
    expect(outNames.get('out')).toBe('total');
    expect(compiled.outputs).toContain('total');
  });
});
