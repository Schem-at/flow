import { describe, it, expect } from 'vitest';
import { compileFlow, hashFlow, FlowCompileError, type FlowLike } from './flow-compiler.js';
import { compileBlock } from './index.js';

/** Run a folded flow source through the real block pipeline. */
async function runFolded(
  source: string,
  inputs: Record<string, unknown>,
  extraCtx: Record<string, unknown> = {}
) {
  const ctx = { Progress: { report: () => {} }, ...extraCtx };
  const compiled = compileBlock(source, { contextKeys: Object.keys(ctx) });
  const fn = (0, eval)(compiled.functionCode) as (
    i: Record<string, unknown>,
    c: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  return fn(inputs, ctx);
}

const DOUBLER = `type Inputs = { x: number };
type Outputs = { y: number };
function helper(v) { return v * 2; }
function generate(inputs) { return { y: helper(inputs.x) }; }
`;

const ADDER = `type Inputs = { a: number; b: Slider<{ min: 0; max: 10; default: 3 }> };
type Outputs = { sum: number };
function helper(v) { return v; } // same helper name as DOUBLER — must not collide
function generate(inputs) { return { sum: helper(inputs.a) + inputs.b }; }
`;

const doubleContract = {
  inputs: { x: { kind: 'number' as const } },
  outputs: { y: { kind: 'number' as const } },
};
const adderContract = {
  inputs: {
    a: { kind: 'number' as const },
    b: { kind: 'number' as const, widget: 'slider' as const, min: 0, max: 10, default: 3 },
  },
  outputs: { sum: { kind: 'number' as const } },
};

function chainFlow(): FlowLike {
  return {
    nodes: [
      {
        id: 'in-x',
        type: 'input',
        data: { label: 'x', value: 5 },
      },
      { id: 'double', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
      { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
      { id: 'out', type: 'output', data: { label: 'result' } },
    ],
    edges: [
      { source: 'in-x', target: 'double', sourceHandle: 'output', targetHandle: 'x' },
      { source: 'double', target: 'add', sourceHandle: 'y', targetHandle: 'a' },
      { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
    ],
  };
}

describe('compileFlow', () => {
  it('folds a linear chain into one script (defaults from input nodes)', async () => {
    const folded = compileFlow(chainFlow());
    expect(folded.outputs).toEqual(['result']);
    expect(folded.nodeOrder).toEqual(['Double', 'Add']);
    // x=5 → double=10 → +3 (slider default) = 13
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ result: 13 });
  });

  it('flow inputs override input-node values', async () => {
    const folded = compileFlow(chainFlow());
    const result = await runFolded(folded.source, { x: 10 });
    expect(result).toEqual({ result: 23 });
  });

  it('block scopes are isolated (same helper name in two blocks)', async () => {
    // DOUBLER.helper doubles, ADDER.helper is identity — if scopes leaked,
    // one would shadow the other and the math would be wrong.
    const folded = compileFlow(chainFlow());
    const result = await runFolded(folded.source, { x: 1 });
    expect(result).toEqual({ result: 5 }); // (1*2) + 3
  });

  it('supports fan-out: one output feeding two nodes', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'in-x', type: 'input', data: { label: 'x', value: 4 } },
        { id: 'd1', type: 'code', data: { label: 'D1', code: DOUBLER, contract: doubleContract } },
        { id: 'a1', type: 'code', data: { label: 'A1', code: ADDER, contract: adderContract } },
        { id: 'a2', type: 'code', data: { label: 'A2', code: ADDER, contract: adderContract } },
        { id: 'o1', type: 'output', data: { label: 'first' } },
        { id: 'o2', type: 'output', data: { label: 'second' } },
      ],
      edges: [
        { source: 'in-x', target: 'd1', sourceHandle: 'output', targetHandle: 'x' },
        { source: 'd1', target: 'a1', sourceHandle: 'y', targetHandle: 'a' },
        { source: 'd1', target: 'a2', sourceHandle: 'y', targetHandle: 'a' },
        { source: 'a1', target: 'o1', sourceHandle: 'sum', targetHandle: 'input' },
        { source: 'a2', target: 'o2', sourceHandle: 'sum', targetHandle: 'input' },
      ],
    };
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ first: 11, second: 11 });
  });

  it('passes values through passthrough viewers', async () => {
    const flow = chainFlow();
    flow.nodes.push({ id: 'view', type: 'viewer', data: { label: 'peek', passthrough: true } });
    // Reroute: double → viewer → add
    flow.edges = flow.edges.filter((e) => !(e.source === 'double' && e.target === 'add'));
    flow.edges.push(
      { source: 'double', target: 'view', sourceHandle: 'y', targetHandle: 'input' },
      { source: 'view', target: 'add', sourceHandle: 'y', targetHandle: 'a' }
    );
    const result = await runFolded(compileFlow(flow).source, { x: 2 });
    expect(result).toEqual({ result: 7 });
  });

  it('exposes terminal node outputs when there are no output nodes', async () => {
    const flow = chainFlow();
    flow.nodes = flow.nodes.filter((n) => n.id !== 'out');
    flow.edges = flow.edges.filter((e) => e.target !== 'out');
    const folded = compileFlow(flow);
    expect(folded.outputs).toEqual(['sum']);
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ sum: 13 });
  });

  it('rejects cycles', () => {
    const flow = chainFlow();
    flow.edges.push({ source: 'add', target: 'double', sourceHandle: 'sum', targetHandle: 'x' });
    expect(() => compileFlow(flow)).toThrow(FlowCompileError);
  });

  it('rejects code nodes without contracts', () => {
    const flow = chainFlow();
    delete flow.nodes[1].data.contract;
    expect(() => compileFlow(flow)).toThrow(/no contract/);
  });

  it('async blocks are awaited', async () => {
    const asyncBlock = `type Inputs = { x: number };
type Outputs = { y: number };
async function generate(inputs) { return { y: inputs.x + 1 }; }
`;
    const flow: FlowLike = {
      nodes: [
        { id: 'in', type: 'input', data: { label: 'x', value: 1 } },
        {
          id: 'a',
          type: 'code',
          data: { label: 'Async', code: asyncBlock, contract: doubleContract },
        },
      ],
      edges: [{ source: 'in', target: 'a', sourceHandle: 'output', targetHandle: 'x' }],
    };
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ y: 2 });
  });
});

describe('hashFlow', () => {
  it('is stable across node/edge ordering', () => {
    const a = chainFlow();
    const b = chainFlow();
    b.nodes.reverse();
    b.edges.reverse();
    expect(hashFlow(a)).toBe(hashFlow(b));
  });

  it('changes when code, values, or wiring change', () => {
    const base = hashFlow(chainFlow());

    const codeChange = chainFlow();
    codeChange.nodes[1].data.code = DOUBLER.replace('* 2', '* 3');
    expect(hashFlow(codeChange)).not.toBe(base);

    const valueChange = chainFlow();
    valueChange.nodes[0].data.value = 6;
    expect(hashFlow(valueChange)).not.toBe(base);

    const wiringChange = chainFlow();
    wiringChange.edges[1].targetHandle = 'b';
    expect(hashFlow(wiringChange)).not.toBe(base);

    // Position-only changes (not part of FlowLike) can't affect the hash by construction.
  });
});
