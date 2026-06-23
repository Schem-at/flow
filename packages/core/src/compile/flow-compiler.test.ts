import { describe, it, expect } from 'vitest';
import { compileFlow, hashFlow, FlowCompileError, type FlowLike } from './flow-compiler.js';
import { expandFormNodes } from './form.js';
import { compileBlock } from './index.js';
import { bytesToBase64 } from '../utils/base64.js';

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

  it('emits type declarations so the folded source is a parseable v2 block', () => {
    const typedFlow = chainFlow();
    typedFlow.nodes[0].data = {
      ...typedFlow.nodes[0].data,
      dataType: 'number',
      widgetType: 'slider',
      min: 0,
      max: 20,
      step: 1,
    };
    const folded = compileFlow(typedFlow);
    // Contract is embedded as real type syntax — widgets, bounds, defaults.
    expect(folded.source).toMatch(/^type Inputs = \{/);
    expect(folded.source).toContain('x: Slider<{ min: 0; max: 20; step: 1; default: 5 }>;');
    expect(folded.source).toContain('type Outputs = {\n  result: number;\n};');
  });

  it('derives a publishable contract for the folded flow', () => {
    const folded = compileFlow(chainFlow());
    expect(folded.contract).toEqual({
      inputs: { x: { kind: 'string', default: undefined } }, // input node has no dataType in this fixture
      outputs: { result: { kind: 'number' } },
    });

    const typedFlow = chainFlow();
    typedFlow.nodes[0].data = {
      ...typedFlow.nodes[0].data,
      dataType: 'number',
      widgetType: 'slider',
      min: 0,
      max: 20,
      step: 1,
    };
    const typedFolded = compileFlow(typedFlow);
    expect(typedFolded.contract.inputs.x).toEqual({
      kind: 'number',
      widget: 'slider',
      min: 0,
      max: 20,
      step: 1,
      default: 5,
    });
  });

  it('bakes bundled assets into the folded script (self-contained)', async () => {
    const payload = new Uint8Array([1, 2, 3, 250, 251, 252, 7]);
    const reader = `type Inputs = { blob: Schematic };
type Outputs = { sum: number; len: number };
function generate(inputs) {
  let sum = 0;
  for (const b of inputs.blob.data) sum += b;
  return { sum, len: inputs.blob.data.length };
}
`;
    const flow: FlowLike = {
      nodes: [
        {
          id: 'the-asset',
          type: 'asset',
          data: {
            label: 'base',
            assetKind: 'binary',
            format: 'bin',
            base64: bytesToBase64(payload),
            name: 'base.bin',
          },
        },
        {
          id: 'read',
          type: 'code',
          data: {
            label: 'Reader',
            code: reader,
            contract: {
              inputs: { blob: { kind: 'schematic' } },
              outputs: { sum: { kind: 'number' }, len: { kind: 'number' } },
            },
          },
        },
      ],
      edges: [{ source: 'the-asset', target: 'read', sourceHandle: 'output', targetHandle: 'blob' }],
    };
    const folded = compileFlow(flow);
    expect(folded.source).toContain('__b64('); // decoder + baked payload
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ sum: 1 + 2 + 3 + 250 + 251 + 252 + 7, len: 7 });

    // asset content participates in the hash
    const changed = JSON.parse(JSON.stringify(flow)) as FlowLike;
    changed.nodes[0].data.base64 = bytesToBase64(new Uint8Array([9, 9, 9]));
    expect(hashFlow(changed)).not.toBe(hashFlow(flow));
  });

  it('passes values through a reroute node (transparent pass-through)', async () => {
    const flow = chainFlow();
    flow.nodes.push({ id: 're', type: 'reroute', data: { label: 'reroute' } });
    // double → reroute → add  (replacing the direct double→add edge)
    flow.edges = flow.edges.filter((e) => !(e.source === 'double' && e.target === 'add'));
    flow.edges.push(
      { source: 'double', target: 're', sourceHandle: 'y', targetHandle: 'input' },
      { source: 're', target: 'add', sourceHandle: 'output', targetHandle: 'a' }
    );
    // Behaves exactly like the direct chain: x=2 → 4 → +3 = 7
    const result = await runFolded(compileFlow(flow).source, { x: 2 });
    expect(result).toEqual({ result: 7 });
  });

  it('chains multiple reroutes transparently', async () => {
    const flow = chainFlow();
    flow.nodes.push(
      { id: 're1', type: 'reroute', data: {} },
      { id: 're2', type: 'reroute', data: {} }
    );
    flow.edges = flow.edges.filter((e) => !(e.source === 'double' && e.target === 'add'));
    flow.edges.push(
      { source: 'double', target: 're1', sourceHandle: 'y', targetHandle: 'input' },
      { source: 're1', target: 're2', sourceHandle: 'output', targetHandle: 'input' },
      { source: 're2', target: 'add', sourceHandle: 'output', targetHandle: 'a' }
    );
    const result = await runFolded(compileFlow(flow).source, { x: 5 });
    expect(result).toEqual({ result: 13 }); // (5*2)+3
  });

  it('emits a constant node value as a baked literal', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', dataType: 'number', value: 21 } },
        { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'k', target: 'add', sourceHandle: 'output', targetHandle: 'a' },
        { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    // Baked as a const literal, not exposed as a flow input.
    expect(folded.source).toContain('= 21;');
    expect(folded.inputs).toEqual({});
    // 21 + 3 (slider default for b) = 24
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ result: 24 });
  });

  it('bakes a constant of each dataType as a literal (string/boolean/list/object)', async () => {
    // An identity block echoes its single input back out, so the folded output
    // is exactly the baked constant literal — once per dataType.
    const IDENTITY = `type Inputs = { v: unknown };
type Outputs = { v: unknown };
function generate(inputs) { return { v: inputs.v }; }
`;
    const identityContract = {
      inputs: { v: { kind: 'unknown' as const } },
      outputs: { v: { kind: 'unknown' as const } },
    };
    const cases: { dataType: string; value: unknown }[] = [
      { dataType: 'string', value: 'hello "world"' },
      { dataType: 'boolean', value: true },
      { dataType: 'number', value: -4.5 },
      { dataType: 'list', value: [1, 'two', false] },
      { dataType: 'object', value: { a: 1, nested: { b: [2, 3] } } },
    ];
    for (const { dataType, value } of cases) {
      const flow: FlowLike = {
        nodes: [
          { id: 'k', type: 'constant', data: { label: 'k', dataType, value } },
          { id: 'id', type: 'code', data: { label: 'Id', code: IDENTITY, contract: identityContract } },
          { id: 'out', type: 'output', data: { label: 'v' } },
        ],
        edges: [
          { source: 'k', target: 'id', sourceHandle: 'output', targetHandle: 'v' },
          { source: 'id', target: 'out', sourceHandle: 'v', targetHandle: 'input' },
        ],
      };
      const folded = compileFlow(flow);
      // Baked, not exposed as a flow input.
      expect(folded.inputs).toEqual({});
      expect(await runFolded(folded.source, {})).toEqual({ v: value });
    }
  });

  it('constant feeding through a reroute still emits the literal', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', dataType: 'number', value: 10 } },
        { id: 're', type: 'reroute', data: {} },
        { id: 'd', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
      ],
      edges: [
        { source: 'k', target: 're', sourceHandle: 'output', targetHandle: 'input' },
        { source: 're', target: 'd', sourceHandle: 'output', targetHandle: 'x' },
      ],
    };
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ y: 20 });
  });

  it('ignores decorative frame/comment nodes entirely', async () => {
    const flow = chainFlow();
    flow.nodes.push(
      { id: 'frame-1', type: 'frame', data: { label: 'Group A', width: 400, height: 300 } },
      { id: 'note-1', type: 'comment', data: { label: 'remember to test this' } }
    );
    // No edges touch them; they contribute no ports/edges/errors.
    const folded = compileFlow(flow);
    expect(folded.nodeOrder).toEqual(['Double', 'Add']);
    expect(folded.outputs).toEqual(['result']);
    expect(folded.source).not.toContain('frame');
    expect(folded.source).not.toContain('remember to test this');
    const result = await runFolded(folded.source, { x: 5 });
    expect(result).toEqual({ result: 13 });
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

// ── object meta-nodes: bundle / unbundle / inspect ──────────────────────────

// Reads three numeric fields off a bundled `cfg` object and sums them.
const CFG_SUM = `type Inputs = { cfg: { width: number; height: number; depth: number } };
type Outputs = { total: number };
function generate(inputs) {
  const c = inputs.cfg || {};
  return { total: (c.width || 0) + (c.height || 0) + (c.depth || 0) };
}
`;
const cfgSumContract = {
  inputs: {
    cfg: {
      kind: 'object' as const,
      fields: {
        width: { kind: 'number' as const },
        height: { kind: 'number' as const },
        depth: { kind: 'number' as const },
      },
    },
  },
  outputs: { total: { kind: 'number' as const } },
};

// Emits an object output (used to feed an Unbundle node).
const MAKE_CFG = `type Inputs = { w: number };
type Outputs = { cfg: { width: number; doubled: number } };
function generate(inputs) {
  return { cfg: { width: inputs.w, doubled: inputs.w * 2 } };
}
`;
const makeCfgContract = {
  inputs: { w: { kind: 'number' as const } },
  outputs: {
    cfg: {
      kind: 'object' as const,
      fields: { width: { kind: 'number' as const }, doubled: { kind: 'number' as const } },
    },
  },
};

describe('compileFlow — object meta-nodes', () => {
  it('bundles constants into an object literal that a downstream node reads', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 10 } },
        { id: 'kh', type: 'constant', data: { label: 'h', value: 20 } },
        { id: 'kd', type: 'constant', data: { label: 'd', value: 5 } },
        {
          id: 'b',
          type: 'bundle',
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: 'height' }, { name: 'depth' }] },
        },
        { id: 'sum', type: 'code', data: { label: 'Sum', code: CFG_SUM, contract: cfgSumContract } },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'kh', target: 'b', sourceHandle: 'output', targetHandle: 'height' },
        { source: 'kd', target: 'b', sourceHandle: 'output', targetHandle: 'depth' },
        { source: 'b', target: 'sum', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'sum', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    // The object literal is emitted as a const with all three keys.
    expect(folded.source).toMatch(/const __bundle_\w+ = \{[^}]*"width":/);
    expect(folded.source).toContain('"height":');
    expect(folded.source).toContain('"depth":');
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ total: 35 });
  });

  it('omits unconnected bundle fields (read as undefined)', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 7 } },
        {
          id: 'b',
          type: 'bundle',
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: 'height' }, { name: 'depth' }] },
        },
        { id: 'sum', type: 'code', data: { label: 'Sum', code: CFG_SUM, contract: cfgSumContract } },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'b', target: 'sum', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'sum', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    // Only the connected field is present in the literal.
    expect(folded.source).toContain('"width":');
    expect(folded.source).not.toContain('"height":');
    // height/depth → undefined → 0 in the block; only width=7 contributes.
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ total: 7 });
  });

  it('exposes a bundle directly on an output as an {object} type', () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 1 } },
        {
          id: 'b',
          type: 'bundle',
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: 'height' }] },
        },
        { id: 'd', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        { id: 'out', type: 'output', data: { label: 'packed' } },
      ],
      // A code node must exist (compiler requires ≥1); keep it isolated.
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'b', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.contract.outputs.packed?.kind).toBe('object');
    expect((folded.contract.outputs.packed as { fields: Record<string, unknown> }).fields).toHaveProperty(
      'width'
    );
    // The unused double node was added only to satisfy the "≥1 code node" rule.
    void folded.nodeOrder;
  });

  it('unbundles an object output into per-field reads', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'in', type: 'input', data: { label: 'w', value: 4 } },
        { id: 'mk', type: 'code', data: { label: 'Make', code: MAKE_CFG, contract: makeCfgContract } },
        {
          id: 'ub',
          type: 'unbundle',
          data: { label: 'split', bundleFields: [{ name: 'width' }, { name: 'doubled' }] },
        },
        { id: 'dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'in', target: 'mk', sourceHandle: 'output', targetHandle: 'w' },
        { source: 'mk', target: 'ub', sourceHandle: 'cfg', targetHandle: 'input' },
        // pull the `doubled` field out and double it again
        { source: 'ub', target: 'dbl', sourceHandle: 'doubled', targetHandle: 'x' },
        { source: 'dbl', target: 'out', sourceHandle: 'y', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    // The unbundle binds the source object and field reads use bracket access.
    expect(folded.source).toMatch(/const __unbundle_\w+ =/);
    expect(folded.source).toContain('["doubled"]');
    // w=4 → cfg.doubled=8 → double → 16
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ result: 16 });
  });

  it('round-trips Bundle → consumer → Unbundle (object survives a pass)', async () => {
    // PASS just forwards its object input to its object output unchanged.
    const PASS = `type Inputs = { obj: { x: number; y: number } };
type Outputs = { obj: { x: number; y: number } };
function generate(inputs) { return { obj: inputs.obj }; }
`;
    const passContract = {
      inputs: {
        obj: { kind: 'object' as const, fields: { x: { kind: 'number' as const }, y: { kind: 'number' as const } } },
      },
      outputs: {
        obj: { kind: 'object' as const, fields: { x: { kind: 'number' as const }, y: { kind: 'number' as const } } },
      },
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'kx', type: 'constant', data: { label: 'x', value: 3 } },
        { id: 'ky', type: 'constant', data: { label: 'y', value: 9 } },
        { id: 'b', type: 'bundle', data: { label: 'b', bundleFields: [{ name: 'x' }, { name: 'y' }] } },
        { id: 'pass', type: 'code', data: { label: 'Pass', code: PASS, contract: passContract } },
        { id: 'ub', type: 'unbundle', data: { label: 'ub', bundleFields: [{ name: 'x' }, { name: 'y' }] } },
        { id: 'ox', type: 'output', data: { label: 'ox' } },
        { id: 'oy', type: 'output', data: { label: 'oy' } },
      ],
      edges: [
        { source: 'kx', target: 'b', sourceHandle: 'output', targetHandle: 'x' },
        { source: 'ky', target: 'b', sourceHandle: 'output', targetHandle: 'y' },
        { source: 'b', target: 'pass', sourceHandle: 'output', targetHandle: 'obj' },
        { source: 'pass', target: 'ub', sourceHandle: 'obj', targetHandle: 'input' },
        { source: 'ub', target: 'ox', sourceHandle: 'x', targetHandle: 'input' },
        { source: 'ub', target: 'oy', sourceHandle: 'y', targetHandle: 'input' },
      ],
    };
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ ox: 3, oy: 9 });
  });

  it('passes values through an inspect tap transparently (value unchanged)', async () => {
    const flow = chainFlow();
    flow.nodes.push({ id: 'tap', type: 'inspect', data: { label: 'peek' } });
    // double → inspect → add  (replacing the direct double→add edge)
    flow.edges = flow.edges.filter((e) => !(e.source === 'double' && e.target === 'add'));
    flow.edges.push(
      { source: 'double', target: 'tap', sourceHandle: 'y', targetHandle: 'input' },
      { source: 'tap', target: 'add', sourceHandle: 'output', targetHandle: 'a' }
    );
    // x=2 → 4 → +3 = 7, identical to the direct chain (inspect compiles away).
    const folded = compileFlow(flow);
    expect(folded.source).not.toContain('inspect');
    expect(folded.source).not.toContain('peek');
    const result = await runFolded(folded.source, { x: 2 });
    expect(result).toEqual({ result: 7 });
  });

  it('drops blank-named bundle fields (no empty-key entry in the literal)', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 9 } },
        {
          id: 'b',
          type: 'bundle',
          // A blank field name is invalid; the compiler must skip it (it cannot
          // be wired anyway — handle id would be empty).
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: '' }] },
        },
        { id: 'sum', type: 'code', data: { label: 'Sum', code: CFG_SUM, contract: cfgSumContract } },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'b', target: 'sum', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'sum', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.source).toContain('"width":');
    // No empty-string key leaked into the object literal.
    expect(folded.source).not.toMatch(/"":/);
    expect(await runFolded(folded.source, {})).toEqual({ total: 9 });
  });

  it('dedupes duplicate bundle field names (first occurrence wins)', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 3 } },
        { id: 'kh', type: 'constant', data: { label: 'h', value: 4 } },
        {
          id: 'b',
          type: 'bundle',
          // Two fields named `width`; only the FIRST should bind. (The store
          // would normally prevent this, but the compiler must be robust.)
          data: {
            label: 'cfg',
            bundleFields: [{ name: 'width' }, { name: 'width' }, { name: 'height' }],
          },
        },
        { id: 'sum', type: 'code', data: { label: 'Sum', code: CFG_SUM, contract: cfgSumContract } },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        // First `width` port carries 3; the duplicate `width` port and `height`
        // resolve to the same handle id — but only the first field is emitted.
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'kh', target: 'b', sourceHandle: 'output', targetHandle: 'height' },
        { source: 'b', target: 'sum', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'sum', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    // The literal must not contain a duplicated "width" key.
    const widthKeys = folded.source.match(/"width":/g) ?? [];
    expect(widthKeys.length).toBe(1);
    // width=3, height=4 → total 7 (the second `width` field is dropped).
    expect(await runFolded(folded.source, {})).toEqual({ total: 7 });
  });
});

// ── group / subflow meta-node ───────────────────────────────────────────────

import { deriveBoundary, groupNodes, ungroup, type GroupNodeData } from './group.js';

// Sums a list of numbers — proves a LIST boundary type crosses the group edge
// (beats the scalar-only module fold).
const SUM_LIST = `type Inputs = { items: number[] };
type Outputs = { total: number };
function generate(inputs) {
  return { total: (inputs.items || []).reduce((a, b) => a + b, 0) };
}
`;
const sumListContract = {
  inputs: { items: { kind: 'list' as const, of: { kind: 'number' as const } } },
  outputs: { total: { kind: 'number' as const } },
};

/** Build a group node whose subgraph is `items → SUM_LIST → DOUBLER`. */
function listGroupData(): GroupNodeData {
  const subgraph = {
    nodes: [
      { id: 'g-sum', type: 'code', data: { label: 'Sum', code: SUM_LIST, contract: sumListContract } },
      { id: 'g-dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
    ],
    edges: [{ source: 'g-sum', target: 'g-dbl', sourceHandle: 'total', targetHandle: 'x' }],
  };
  return {
    label: 'ListGroup',
    subgraph,
    groupInputs: [
      {
        name: 'items',
        internalNodeId: 'g-sum',
        internalHandle: 'items',
        externalNodeId: 'src',
        externalHandle: 'output',
        type: { kind: 'list', of: { kind: 'number' } },
      },
    ],
    groupOutputs: [
      {
        name: 'doubled',
        internalNodeId: 'g-dbl',
        internalHandle: 'y',
        externalNodeId: 'out',
        externalHandle: 'input',
        type: { kind: 'number' },
      },
    ],
  };
}

describe('compileFlow — group / subflow meta-node', () => {
  it('compiles a group node and runs its nested subgraph inline', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1, 2, 3, 4] } },
        { id: 'grp', type: 'group', data: listGroupData() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'src', target: 'grp', sourceHandle: 'output', targetHandle: 'items' },
        { source: 'grp', target: 'out', sourceHandle: 'doubled', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.source).toContain('__group_');
    // LIST boundary type survives: sum([1,2,3,4]) = 10 → double = 20
    const result = await runFolded(folded.source, {});
    expect(result).toEqual({ result: 20 });
  });

  it('carries the boundary output FlowType into the folded contract', () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [5] } },
        { id: 'grp', type: 'group', data: listGroupData() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'src', target: 'grp', sourceHandle: 'output', targetHandle: 'items' },
        { source: 'grp', target: 'out', sourceHandle: 'doubled', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.contract.outputs.result?.kind).toBe('number');
  });

  it('passes an OBJECT across the group boundary (beats scalar-only fold)', async () => {
    const objGroup: GroupNodeData = {
      label: 'ObjGroup',
      subgraph: {
        nodes: [
          { id: 'g-csum', type: 'code', data: { label: 'CfgSum', code: CFG_SUM, contract: cfgSumContract } },
        ],
        edges: [],
      },
      groupInputs: [
        {
          name: 'cfg',
          internalNodeId: 'g-csum',
          internalHandle: 'cfg',
          externalNodeId: 'b',
          externalHandle: 'output',
          type: { kind: 'object', fields: {} },
        },
      ],
      groupOutputs: [
        {
          name: 'total',
          internalNodeId: 'g-csum',
          internalHandle: 'total',
          externalNodeId: 'out',
          externalHandle: 'input',
          type: { kind: 'number' },
        },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 10 } },
        { id: 'kh', type: 'constant', data: { label: 'h', value: 20 } },
        { id: 'kd', type: 'constant', data: { label: 'd', value: 5 } },
        {
          id: 'b',
          type: 'bundle',
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: 'height' }, { name: 'depth' }] },
        },
        { id: 'grp', type: 'group', data: objGroup as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'kh', target: 'b', sourceHandle: 'output', targetHandle: 'height' },
        { source: 'kd', target: 'b', sourceHandle: 'output', targetHandle: 'depth' },
        { source: 'b', target: 'grp', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'grp', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ total: 35 });
  });

  it('supports a group nested inside a group (recursive inline)', async () => {
    const inner: GroupNodeData = {
      label: 'Inner',
      subgraph: {
        nodes: [
          { id: 'i-sum', type: 'code', data: { label: 'Sum', code: SUM_LIST, contract: sumListContract } },
        ],
        edges: [],
      },
      groupInputs: [
        {
          name: 'items',
          internalNodeId: 'i-sum',
          internalHandle: 'items',
          externalNodeId: 'x',
          externalHandle: 'x',
          type: { kind: 'list', of: { kind: 'number' } },
        },
      ],
      groupOutputs: [
        {
          name: 'sum',
          internalNodeId: 'i-sum',
          internalHandle: 'total',
          externalNodeId: 'y',
          externalHandle: 'y',
          type: { kind: 'number' },
        },
      ],
    };
    const outer: GroupNodeData = {
      label: 'Outer',
      subgraph: {
        nodes: [
          { id: 'o-inner', type: 'group', data: inner as unknown as Record<string, unknown> },
          { id: 'o-dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        ],
        edges: [{ source: 'o-inner', target: 'o-dbl', sourceHandle: 'sum', targetHandle: 'x' }],
      },
      groupInputs: [
        {
          name: 'items',
          internalNodeId: 'o-inner',
          internalHandle: 'items',
          externalNodeId: 'src',
          externalHandle: 'output',
          type: { kind: 'list', of: { kind: 'number' } },
        },
      ],
      groupOutputs: [
        {
          name: 'doubled',
          internalNodeId: 'o-dbl',
          internalHandle: 'y',
          externalNodeId: 'out',
          externalHandle: 'input',
          type: { kind: 'number' },
        },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [2, 3, 5] } },
        { id: 'grp', type: 'group', data: outer as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'src', target: 'grp', sourceHandle: 'output', targetHandle: 'items' },
        { source: 'grp', target: 'out', sourceHandle: 'doubled', targetHandle: 'input' },
      ],
    };
    // sum([2,3,5]) = 10 → double = 20
    const result = await runFolded(compileFlow(flow).source, {});
    expect(result).toEqual({ result: 20 });
  });
});

describe('group/ungroup pure graph transforms', () => {
  const parentNodes = [
    { id: 'in', type: 'input', data: { label: 'x', value: 5 } },
    { id: 'A', type: 'code', data: { label: 'A', code: DOUBLER, contract: doubleContract } },
    { id: 'B', type: 'code', data: { label: 'B', code: ADDER, contract: adderContract } },
    { id: 'out', type: 'output', data: { label: 'result' } },
  ];
  const parentEdges = [
    { id: 'e1', source: 'in', target: 'A', sourceHandle: 'output', targetHandle: 'x' },
    { id: 'e2', source: 'A', target: 'B', sourceHandle: 'y', targetHandle: 'a' },
    { id: 'e3', source: 'B', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
  ];

  it('derives boundary inputs/outputs from crossing edges', () => {
    const b = deriveBoundary(new Set(['A', 'B']), parentEdges);
    expect(b.inputs).toHaveLength(1);
    expect(b.outputs).toHaveLength(1);
    expect(b.inputs[0].internalNodeId).toBe('A');
    expect(b.inputs[0].internalHandle).toBe('x');
    expect(b.outputs[0].internalNodeId).toBe('B');
    expect(b.outputs[0].internalHandle).toBe('sum');
  });

  it('groupNodes collapses the selection and rewires boundary edges', () => {
    const { groupNode, nodes, edges } = groupNodes(parentNodes, parentEdges, ['A', 'B'], {
      groupId: 'G',
      label: 'G',
    });
    expect(nodes.map((n) => n.id).sort()).toEqual(['G', 'in', 'out']);
    const data = groupNode.data as unknown as GroupNodeData;
    expect(data.subgraph.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(data.subgraph.edges).toHaveLength(1);
    const inEdge = edges.find((e) => e.target === 'G')!;
    expect(inEdge.source).toBe('in');
    const outEdge = edges.find((e) => e.source === 'G')!;
    expect(outEdge.target).toBe('out');
  });

  it('group → ungroup is a round-trip (restores the original graph)', () => {
    const grouped = groupNodes(parentNodes, parentEdges, ['A', 'B'], { groupId: 'G' });
    const restored = ungroup(grouped.nodes, grouped.edges, 'G');
    expect(restored.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'in', 'out']);
    const norm = (es: typeof parentEdges) =>
      es
        .map((e) => `${e.source}:${e.sourceHandle ?? ''}>${e.target}:${e.targetHandle ?? ''}`)
        .sort();
    expect(norm(restored.edges as typeof parentEdges)).toEqual(norm(parentEdges));
  });

  it('grouped flow executes identically to the original (semantics preserved)', async () => {
    const original = compileFlow({ nodes: parentNodes, edges: parentEdges });
    const grouped = groupNodes(parentNodes, parentEdges, ['A', 'B'], { groupId: 'G', label: 'G' });
    const groupedCompiled = compileFlow({ nodes: grouped.nodes, edges: grouped.edges });
    expect(await runFolded(original.source, {})).toEqual({ result: 13 });
    expect(await runFolded(groupedCompiled.source, {})).toEqual({ result: 13 });
  });
});

// ── switch / select meta-node ───────────────────────────────────────────────

describe('compileFlow — switch / select meta-node', () => {
  // selector=0 picks case0, =1 picks case1, anything else picks default.
  function switchFlow(selector: number, caseCount = 2): FlowLike {
    const nodes: FlowLike['nodes'] = [
      { id: 'sel', type: 'constant', data: { label: 'sel', value: selector } },
      { id: 'c0', type: 'constant', data: { label: 'c0', value: 'zero' } },
      { id: 'c1', type: 'constant', data: { label: 'c1', value: 'one' } },
      { id: 'def', type: 'constant', data: { label: 'def', value: 'fallback' } },
      { id: 'sw', type: 'switch', data: { label: 'pick', caseCount } },
      { id: 'out', type: 'output', data: { label: 'picked' } },
    ];
    const edges: FlowLike['edges'] = [
      { source: 'sel', target: 'sw', sourceHandle: 'output', targetHandle: 'selector' },
      { source: 'c0', target: 'sw', sourceHandle: 'output', targetHandle: 'case0' },
      { source: 'c1', target: 'sw', sourceHandle: 'output', targetHandle: 'case1' },
      { source: 'def', target: 'sw', sourceHandle: 'output', targetHandle: 'default' },
      { source: 'sw', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
    ];
    return { nodes, edges };
  }

  it('selects case0 when selector = 0', async () => {
    const folded = compileFlow(switchFlow(0));
    expect(folded.source).toContain('__sw_');
    expect(await runFolded(folded.source, {})).toEqual({ picked: 'zero' });
  });

  it('selects case1 when selector = 1', async () => {
    const folded = compileFlow(switchFlow(1));
    expect(await runFolded(folded.source, {})).toEqual({ picked: 'one' });
  });

  it('falls back to default for an out-of-range selector', async () => {
    const folded = compileFlow(switchFlow(7));
    expect(await runFolded(folded.source, {})).toEqual({ picked: 'fallback' });
  });

  it('exposes the union case type as the switch output (same kind ⇒ that kind)', () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'sel', type: 'constant', data: { label: 'sel', dataType: 'number', value: 0 } },
        { id: 'c0', type: 'constant', data: { label: 'c0', dataType: 'number', value: 1 } },
        { id: 'c1', type: 'constant', data: { label: 'c1', dataType: 'number', value: 2 } },
        { id: 'sw', type: 'switch', data: { label: 'pick', caseCount: 2 } },
        { id: 'out', type: 'output', data: { label: 'picked' } },
      ],
      edges: [
        { source: 'sel', target: 'sw', sourceHandle: 'output', targetHandle: 'selector' },
        { source: 'c0', target: 'sw', sourceHandle: 'output', targetHandle: 'case0' },
        { source: 'c1', target: 'sw', sourceHandle: 'output', targetHandle: 'case1' },
        { source: 'sw', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    expect(compileFlow(flow).contract.outputs.picked?.kind).toBe('number');
  });
});

// ── map / iterate meta-node ─────────────────────────────────────────────────

import { type MapNodeData } from './group.js';

/** A map body that doubles its `item` (item → DOUBLER → result). */
function doubleBody(): MapNodeData {
  return {
    label: 'Double',
    subgraph: {
      nodes: [{ id: 'm-dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } }],
      edges: [],
    },
    bodyInputs: [
      { name: 'item', internalNodeId: 'm-dbl', internalHandle: 'x', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
    ],
    bodyOutputs: [
      { name: 'result', internalNodeId: 'm-dbl', internalHandle: 'y', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
    ],
  };
}

describe('compileFlow — map / iterate meta-node', () => {
  it('runs the body per element and outputs the mapped list', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1, 2, 3, 4] } },
        { id: 'm', type: 'map', data: doubleBody() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow);
    expect(folded.source).toContain('__map_');
    expect(await runFolded(folded.source, {})).toEqual({ doubled: [2, 4, 6, 8] });
  });

  it('outputs an empty list for an empty input list', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [] } },
        { id: 'm', type: 'map', data: doubleBody() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    expect(await runFolded(compileFlow(flow).source, {})).toEqual({ doubled: [] });
  });

  it('passes the element index into the body (item + index)', async () => {
    const ADD_INDEX = `type Inputs = { item: number; index: number };
type Outputs = { out: number };
function generate(inputs) { return { out: inputs.item + inputs.index }; }
`;
    const addIndexContract = {
      inputs: { item: { kind: 'number' as const }, index: { kind: 'number' as const } },
      outputs: { out: { kind: 'number' as const } },
    };
    const body: MapNodeData = {
      label: 'AddIndex',
      subgraph: {
        nodes: [{ id: 'm-ai', type: 'code', data: { label: 'AddIndex', code: ADD_INDEX, contract: addIndexContract } }],
        edges: [],
      },
      bodyInputs: [
        { name: 'item', internalNodeId: 'm-ai', internalHandle: 'item', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
        { name: 'index', internalNodeId: 'm-ai', internalHandle: 'index', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
      ],
      bodyOutputs: [
        { name: 'result', internalNodeId: 'm-ai', internalHandle: 'out', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [10, 20, 30] } },
        { id: 'm', type: 'map', data: body as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'res' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    // [10+0, 20+1, 30+2]
    expect(await runFolded(compileFlow(flow).source, {})).toEqual({ res: [10, 21, 32] });
  });

  it('exposes the map output as a list of the result type', () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1] } },
        { id: 'm', type: 'map', data: doubleBody() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    const out = compileFlow(flow).contract.outputs.doubled;
    expect(out?.kind).toBe('list');
    expect(out?.kind === 'list' && out.of?.kind).toBe('number');
  });

  it('runs a map body that uses a code node with a helper (block scope intact)', async () => {
    // The body is item → SUM_LIST? no — use DOUBLER which carries a `helper`.
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [5, 6] } },
        { id: 'm', type: 'map', data: doubleBody() as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    expect(await runFolded(compileFlow(flow).source, {})).toEqual({ doubled: [10, 12] });
  });

  it('nests a map inside a map body (list of lists, doubled element-wise)', async () => {
    // Outer map iterates [[1,2],[3,4,5]]; each element (a sublist) is fed to an
    // INNER map node that doubles every number — proving map bodies compose.
    const innerMap = doubleBody(); // item:number → result:number, doubling
    const outerBody: MapNodeData = {
      label: 'DoubleEach',
      subgraph: {
        nodes: [
          { id: 'inner', type: 'map', data: innerMap as unknown as Record<string, unknown> },
        ],
        edges: [],
      },
      // The outer element (a sublist) is the inner map's `list` input.
      bodyInputs: [
        {
          name: 'item',
          internalNodeId: 'inner',
          internalHandle: 'list',
          externalNodeId: '',
          externalHandle: null,
          type: { kind: 'list', of: { kind: 'number' } },
        },
      ],
      // The inner map's `output` (the doubled sublist) is the outer body output.
      bodyOutputs: [
        {
          name: 'result',
          internalNodeId: 'inner',
          internalHandle: 'output',
          externalNodeId: '',
          externalHandle: null,
          type: { kind: 'list', of: { kind: 'number' } },
        },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'grid', value: [[1, 2], [3, 4, 5]] } },
        { id: 'm', type: 'map', data: outerBody as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    expect(await runFolded(compileFlow(flow).source, {})).toEqual({
      doubled: [[2, 4], [6, 8, 10]],
    });
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

// ── form meta-node (dense input form → input + bundle expansion) ─────────────
describe('compileFlow — form meta-node', () => {
  function formFlow(): FlowLike {
    return {
      nodes: [
        {
          id: 'f',
          type: 'form',
          data: {
            label: 'params',
            fields: [
              { name: 'a', dataType: 'number', value: 5 },
              { name: 'b', dataType: 'number', value: 3 },
            ],
            bundle: { enabled: true, name: 'cfg' },
          },
        },
        { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
        { id: 'sum-out', type: 'output', data: { label: 'sum' } },
        { id: 'cfg-out', type: 'output', data: { label: 'cfg' } },
      ],
      edges: [
        { source: 'f', target: 'add', sourceHandle: 'a', targetHandle: 'a' },
        { source: 'f', target: 'add', sourceHandle: 'b', targetHandle: 'b' },
        { source: 'add', target: 'sum-out', sourceHandle: 'sum', targetHandle: 'input' },
        { source: 'f', target: 'cfg-out', sourceHandle: 'cfg', targetHandle: 'input' },
      ],
    };
  }

  it('expands a form into synthetic input + bundle nodes and rewires edges', () => {
    const expanded = expandFormNodes(formFlow());
    expect(expanded.nodes.some((n) => n.type === 'form')).toBe(false);
    expect(expanded.nodes.filter((n) => n.type === 'input').map((n) => n.id)).toEqual(['f__f_a', 'f__f_b']);
    expect(expanded.nodes.some((n) => n.type === 'bundle' && n.id === 'f__bundle')).toBe(true);
    // the per-field edge now comes from the synthetic input, not the form
    const aEdge = expanded.edges.find((e) => e.target === 'add' && e.targetHandle === 'a');
    expect(aEdge!.source).toBe('f__f_a');
    expect(aEdge!.sourceHandle).toBe('output');
  });

  it('folds per-field handles and the bundled object, and runs', async () => {
    const folded = compileFlow(formFlow());
    expect(folded.contract.inputs.a?.kind).toBe('number');
    expect(folded.contract.inputs.b?.kind).toBe('number');
    const result = await runFolded(folded.source, { a: 5, b: 3 });
    expect(result.sum).toBe(8); // add(a, b)
    expect(result.cfg).toEqual({ a: 5, b: 3 }); // bundled object handle
  });

  it('field value/config changes change the flow hash', () => {
    const base = hashFlow(formFlow());
    const changed = formFlow();
    (changed.nodes[0].data as { fields: { value: number }[] }).fields[0].value = 99;
    expect(hashFlow(changed)).not.toBe(base);
  });
});
