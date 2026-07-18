/**
 * TRACE-MODE execution verification for the meta-nodes.
 *
 * `flow-compiler.test.ts` proves the emitted SOURCE; `headless-exec.test.ts`
 * proves the bare (non-trace) OUTPUTS through the real engine. This suite proves
 * the *new* trace mode: `compileFlow(flow, { trace: true })` →
 * `PolymeraseEngine.executeScript` returns `{ __outputs, __trace }`, where
 * `__trace[nodeId] = { value, ms, status }` carries the PER-NODE value for every
 * meta-node (switch/bundle/unbundle/group/map/constant/code/reroute).
 *
 * This is the load-bearing verification for the live-editor rewire: it proves
 * the unified engine produces correct per-node values for meta-nodes (which the
 * old bespoke per-node canvas engine never executed), so the live canvas can be
 * fed entirely from `__trace`.
 *
 * Hermetic: plain number / list / object data, minimal pure-JS context (only the
 * `Progress` reporter the folded source calls) — no nucleation WASM.
 */

import { describe, it, expect } from 'vitest';
import { compileFlow, type FlowLike, type TracedResult } from './flow-compiler.js';
import { type GroupNodeData, type MapNodeData } from './group.js';
import { PolymeraseEngine } from '../Engine.js';

function makeEngine(): PolymeraseEngine {
  return new PolymeraseEngine({
    contextProviders: {
      Progress: { report: () => {} },
    } as unknown as Record<string, unknown>,
  });
}

/** Fold WITH TRACE, run through the real engine, return `{ __outputs, __trace }`. */
async function runTraced(
  flow: FlowLike,
  inputs: Record<string, unknown> = {}
): Promise<TracedResult> {
  const folded = compileFlow(flow, { trace: true });
  const engine = makeEngine();
  try {
    const result = await engine.executeScript(folded.source, inputs);
    if (!result.success) {
      throw new Error(`traced execution failed: ${result.error?.message}`);
    }
    const traced = result.result as unknown as TracedResult;
    expect(traced).toHaveProperty('__outputs');
    expect(traced).toHaveProperty('__trace');
    return traced;
  } finally {
    engine.destroy();
  }
}

// ── reusable blocks (same shapes as headless-exec.test.ts) ───────────────────

const DOUBLER = `type Inputs = { x: number };
type Outputs = { y: number };
function helper(v) { return v * 2; }
function generate(inputs) { return { y: helper(inputs.x) }; }
`;
const doubleContract = {
  inputs: { x: { kind: 'number' as const } },
  outputs: { y: { kind: 'number' as const } },
};

const ADDER = `type Inputs = { a: number; b: number };
type Outputs = { sum: number };
function generate(inputs) { return { sum: inputs.a + inputs.b }; }
`;
const adderContract = {
  inputs: { a: { kind: 'number' as const }, b: { kind: 'number' as const } },
  outputs: { sum: { kind: 'number' as const } },
};

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

// Every trace entry must carry a numeric ms and an 'ok'/'error' status.
function expectTimed(entry: { ms: number; status: string } | undefined) {
  expect(entry).toBeDefined();
  expect(typeof entry!.ms).toBe('number');
  expect(entry!.ms).toBeGreaterThanOrEqual(0);
  expect(['ok', 'error']).toContain(entry!.status);
}

describe('trace-mode meta-node execution (real engine, folded + trace)', () => {
  it('switch: __trace records the SELECTED case value (case1) AND outputs resolve', async () => {
    // selector=1 → switch picks case1 ('one'); the routed value is 70 only when
    // we wire numbers — assert both the routed number and the per-node value.
    function switchFlow(selector: number): FlowLike {
      return {
        nodes: [
          { id: 'sel', type: 'constant', data: { label: 'sel', value: selector } },
          { id: 'c0', type: 'constant', data: { label: 'c0', value: 40 } },
          { id: 'c1', type: 'constant', data: { label: 'c1', value: 70 } },
          { id: 'def', type: 'constant', data: { label: 'def', value: -1 } },
          { id: 'sw', type: 'switch', data: { label: 'pick', caseCount: 2 } },
          { id: 'out', type: 'output', data: { label: 'routed' } },
        ],
        edges: [
          { source: 'sel', target: 'sw', sourceHandle: 'output', targetHandle: 'selector' },
          { source: 'c0', target: 'sw', sourceHandle: 'output', targetHandle: 'case0' },
          { source: 'c1', target: 'sw', sourceHandle: 'output', targetHandle: 'case1' },
          { source: 'def', target: 'sw', sourceHandle: 'output', targetHandle: 'default' },
          { source: 'sw', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
        ],
      };
    }

    const t = await runTraced(switchFlow(1));
    // Output resolves to the selected case (case1 = 70).
    expect(t.__outputs).toEqual({ routed: 70 });
    // The switch node's per-node trace value IS the selected value.
    expect(t.__trace['sw'].value).toBe(70);
    expect(t.__trace['sw'].status).toBe('ok');
    expectTimed(t.__trace['sw']);
    // Constants are traced too.
    expect(t.__trace['c1'].value).toBe(70);
    expect(t.__trace['sel'].value).toBe(1);

    // Sanity: selector=0 routes case0 instead.
    const t0 = await runTraced(switchFlow(0));
    expect(t0.__outputs).toEqual({ routed: 40 });
    expect(t0.__trace['sw'].value).toBe(40);
  });

  it('bundle: __trace records the assembled OBJECT; code consumer sees it', async () => {
    // ka=3, kb=4 → bundle{a,b} → Adder → output 7
    const flow: FlowLike = {
      nodes: [
        { id: 'ka', type: 'constant', data: { label: 'a', value: 3 } },
        { id: 'kb', type: 'constant', data: { label: 'b', value: 4 } },
        {
          id: 'bn',
          type: 'bundle',
          data: { label: 'pair', bundleFields: [{ name: 'a' }, { name: 'b' }] },
        },
        { id: 'ub', type: 'unbundle', data: { label: 'split', bundleFields: [{ name: 'a' }, { name: 'b' }] } },
        { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
        { id: 'out', type: 'output', data: { label: 'sum' } },
      ],
      edges: [
        { source: 'ka', target: 'bn', sourceHandle: 'output', targetHandle: 'a' },
        { source: 'kb', target: 'bn', sourceHandle: 'output', targetHandle: 'b' },
        // Round-trip the bundle through an unbundle, then re-add via the Adder.
        { source: 'bn', target: 'ub', sourceHandle: 'output', targetHandle: 'input' },
        { source: 'ub', target: 'add', sourceHandle: 'a', targetHandle: 'a' },
        { source: 'ub', target: 'add', sourceHandle: 'b', targetHandle: 'b' },
        { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
      ],
    };
    const t = await runTraced(flow);
    expect(t.__outputs).toEqual({ sum: 7 });
    // Bundle trace value is the object itself.
    expect(t.__trace['bn'].value).toEqual({ a: 3, b: 4 });
    // Unbundle trace value is the bound input object.
    expect(t.__trace['ub'].value).toEqual({ a: 3, b: 4 });
    // Code node trace value is its full output map.
    expect(t.__trace['add'].value).toEqual({ sum: 7 });
    expectTimed(t.__trace['bn']);
    expectTimed(t.__trace['add']);
  });

  it('group: __trace records the subgraph RESULT object', async () => {
    // [1,2,3,4] → Group{ Sum → Double } → 20
    const groupData: GroupNodeData = {
      label: 'SumThenDouble',
      subgraph: {
        nodes: [
          { id: 'g-sum', type: 'code', data: { label: 'Sum', code: SUM_LIST, contract: sumListContract } },
          { id: 'g-dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        ],
        edges: [{ source: 'g-sum', target: 'g-dbl', sourceHandle: 'total', targetHandle: 'x' }],
      },
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
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1, 2, 3, 4] } },
        { id: 'grp', type: 'group', data: groupData as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'src', target: 'grp', sourceHandle: 'output', targetHandle: 'items' },
        { source: 'grp', target: 'out', sourceHandle: 'doubled', targetHandle: 'input' },
      ],
    };
    const t = await runTraced(flow);
    expect(t.__outputs).toEqual({ result: 20 });
    // Group trace value is the boundary-output map.
    expect(t.__trace['grp'].value).toEqual({ doubled: 20 });
    expectTimed(t.__trace['grp']);
  });

  it('map: __trace records the mapped LIST', async () => {
    const doubleBody: MapNodeData = {
      label: 'Double',
      subgraph: {
        nodes: [
          { id: 'm-dbl', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        ],
        edges: [],
      },
      bodyInputs: [
        { name: 'item', internalNodeId: 'm-dbl', internalHandle: 'x', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
      ],
      bodyOutputs: [
        { name: 'result', internalNodeId: 'm-dbl', internalHandle: 'y', externalNodeId: '', externalHandle: null, type: { kind: 'number' } },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1, 2, 3] } },
        { id: 'm', type: 'map', data: doubleBody as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'doubled' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'out', sourceHandle: 'output', targetHandle: 'input' },
      ],
    };
    const t = await runTraced(flow);
    expect(t.__outputs).toEqual({ doubled: [2, 4, 6] });
    expect(t.__trace['m'].value).toEqual([2, 4, 6]);
    expectTimed(t.__trace['m']);
  });

  it('reroute pass-through is traced as the resolved upstream value', async () => {
    // constant(21) → reroute → Adder(b=4) → 25
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', value: 21 } },
        { id: 'kb', type: 'constant', data: { label: 'kb', value: 4 } },
        { id: 're', type: 'reroute', data: {} },
        { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'k', target: 're', sourceHandle: 'output', targetHandle: 'input' },
        { source: 're', target: 'add', sourceHandle: 'output', targetHandle: 'a' },
        { source: 'kb', target: 'add', sourceHandle: 'output', targetHandle: 'b' },
        { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
      ],
    };
    const t = await runTraced(flow);
    expect(t.__outputs).toEqual({ result: 25 });
    // Reroute resolves to the upstream constant value.
    expect(t.__trace['re'].value).toBe(21);
    // Output node is traced as its resolved value too.
    expect(t.__trace['out'].value).toBe(25);
  });

  it('error isolation: a throwing code node records status:error without blanking siblings', async () => {
    const BOOM = `type Inputs = { x: number };
type Outputs = { y: number };
function generate(inputs) { throw new Error('boom'); }
`;
    const boomContract = doubleContract;
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', value: 5 } },
        { id: 'ok', type: 'code', data: { label: 'Double', code: DOUBLER, contract: doubleContract } },
        { id: 'bad', type: 'code', data: { label: 'Boom', code: BOOM, contract: boomContract } },
        { id: 'oout', type: 'output', data: { label: 'good' } },
      ],
      edges: [
        { source: 'k', target: 'ok', sourceHandle: 'output', targetHandle: 'x' },
        { source: 'k', target: 'bad', sourceHandle: 'output', targetHandle: 'x' },
        { source: 'ok', target: 'oout', sourceHandle: 'y', targetHandle: 'input' },
      ],
    };
    const t = await runTraced(flow);
    // The healthy node still produced its value.
    expect(t.__trace['ok'].value).toEqual({ y: 10 });
    expect(t.__trace['ok'].status).toBe('ok');
    // The failing node recorded an error (and did NOT abort the program).
    expect(t.__trace['bad'].status).toBe('error');
    expect(t.__trace['bad'].message).toContain('boom');
    expect(t.__outputs).toEqual({ good: 10 });
  });

  it('non-trace mode is unchanged: bare outputs, no __outputs/__trace wrapper', async () => {
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', value: 21 } },
        { id: 'kb', type: 'constant', data: { label: 'kb', value: 4 } },
        { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
        { id: 'out', type: 'output', data: { label: 'result' } },
      ],
      edges: [
        { source: 'k', target: 'add', sourceHandle: 'output', targetHandle: 'a' },
        { source: 'kb', target: 'add', sourceHandle: 'output', targetHandle: 'b' },
        { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
      ],
    };
    const folded = compileFlow(flow); // no { trace: true }
    expect(folded.source).not.toContain('__trace');
    const engine = makeEngine();
    try {
      const result = await engine.executeScript(folded.source, {});
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 25 });
    } finally {
      engine.destroy();
    }
  });
});

// ── BLOCKER 2: real per-node timing via the host-endowed `__hostNow` clock ───
//
// SES tames Date.now/performance.now inside the compartment, so trace `ms`
// would be 0. The host endows a read-only `__hostNow()` clock (providers/
// standard.ts) which the trace runner prefers. These tests prove `ms` is REAL
// when the clock is present and degrades gracefully (to 0) when it is absent
// AND the ambient timers are tamed.

/** Engine with an explicit context (control the clock + Progress). */
function makeEngineWith(ctx: Record<string, unknown>): PolymeraseEngine {
  return new PolymeraseEngine({
    contextProviders: {
      Progress: { report: () => {} },
      ...ctx,
    } as unknown as Record<string, unknown>,
  });
}

// A non-trivial code node: busy-loops a few ms so a real clock must read > 0.
const BUSY = `type Inputs = { n: number };
type Outputs = { out: number };
function generate(inputs) {
  const __start = __hostNow ? __hostNow() : 0;
  let acc = 0;
  // Spin until the host clock advances (or a hard iteration cap), so the node
  // genuinely consumes wall-clock time when a real clock is endowed.
  for (let i = 0; i < 5_000_000; i++) {
    acc += Math.sqrt(i % 97);
    if (__hostNow && i % 50000 === 0 && __hostNow() - __start > 3) break;
  }
  return { out: acc + inputs.n };
}
`;
const busyContract = {
  inputs: { n: { kind: 'number' as const } },
  outputs: { out: { kind: 'number' as const } },
};

function busyFlow(): FlowLike {
  return {
    nodes: [
      { id: 'k', type: 'constant', data: { label: 'k', value: 1 } },
      { id: 'busy', type: 'code', data: { label: 'Busy', code: BUSY, contract: busyContract } },
      { id: 'out', type: 'output', data: { label: 'out' } },
    ],
    edges: [
      { source: 'k', target: 'busy', sourceHandle: 'output', targetHandle: 'n' },
      { source: 'busy', target: 'out', sourceHandle: 'out', targetHandle: 'input' },
    ],
  };
}

describe('trace timing: host-endowed clock', () => {
  it('emits the __hostNow taming-safe clock probe in the trace source', () => {
    const folded = compileFlow(busyFlow(), { trace: true });
    // The runner prefers an endowed clock, then probes performance/Date.
    expect(folded.source).toContain('typeof __hostNow === "function"');
  });

  it('records a REAL, finite ms (> 0 for a non-trivial node) when __hostNow is endowed', async () => {
    let calls = 0;
    const hostNow = () => {
      calls++;
      // Real, monotonic host clock.
      return performance.now();
    };
    const engine = makeEngineWith({ __hostNow: hostNow });
    try {
      const folded = compileFlow(busyFlow(), { trace: true });
      const result = await engine.executeScript(folded.source, {});
      expect(result.success).toBe(true);
      const traced = result.result as unknown as TracedResult;
      const entry = traced.__trace['busy'];
      expect(entry).toBeDefined();
      expect(typeof entry.ms).toBe('number');
      expect(Number.isFinite(entry.ms)).toBe(true);
      expect(entry.ms).toBeGreaterThan(0);
      expect(entry.status).toBe('ok');
      // The endowed clock was actually consulted (not the ambient timers).
      expect(calls).toBeGreaterThan(0);
    } finally {
      engine.destroy();
    }
  });

  it('degrades gracefully when __hostNow throws on every read (falls back, never NaN/throws)', async () => {
    // Simulate a tamed/hostile clock: throws on every read. The probe call is
    // guarded, so the runner falls through to the next timing source and still
    // produces a finite ms + correct value/status — it never throws or yields
    // NaN. (Here the test engine is plain JS, so the ambient fallback is live;
    // the contract under test is "graceful, finite, correct", not a literal 0.)
    const tamedClock = () => {
      throw new Error('tamed: now() unavailable');
    };
    const engine = makeEngineWith({ __hostNow: tamedClock });
    try {
      const flow: FlowLike = {
        nodes: [
          { id: 'a', type: 'constant', data: { label: 'a', value: 2 } },
          { id: 'b', type: 'constant', data: { label: 'b', value: 3 } },
          { id: 'add', type: 'code', data: { label: 'Add', code: ADDER, contract: adderContract } },
          { id: 'out', type: 'output', data: { label: 'sum' } },
        ],
        edges: [
          { source: 'a', target: 'add', sourceHandle: 'output', targetHandle: 'a' },
          { source: 'b', target: 'add', sourceHandle: 'output', targetHandle: 'b' },
          { source: 'add', target: 'out', sourceHandle: 'sum', targetHandle: 'input' },
        ],
      };
      const folded = compileFlow(flow, { trace: true });
      const result = await engine.executeScript(folded.source, {});
      expect(result.success).toBe(true);
      const traced = result.result as unknown as TracedResult;
      const entry = traced.__trace['add'];
      expect(entry).toBeDefined();
      // Graceful: finite (never NaN), non-negative, value + status intact.
      expect(Number.isFinite(entry.ms)).toBe(true);
      expect(entry.ms).toBeGreaterThanOrEqual(0);
      expect(entry.status).toBe('ok');
      expect(traced.__outputs).toEqual({ sum: 5 });
    } finally {
      engine.destroy();
    }
  });

  it('with NO clock at all, the trace source still compiles and yields ms=0 fallback', () => {
    // When neither __hostNow nor ambient timers exist, the IIFE returns
    // `() => 0`. We can't strip globals from the live engine, but we CAN prove
    // the generated source contains the terminal `() => 0` fallback branch.
    const folded = compileFlow(busyFlow(), { trace: true });
    expect(folded.source).toContain('return () => 0;');
  });
});
