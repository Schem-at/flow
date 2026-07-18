/**
 * HEADLESS execution verification for the meta-nodes.
 *
 * The compiler tests in `flow-compiler.test.ts` prove `compileFlow` emits the
 * right *source*, then run it through a bare `(0, eval)` shim. That proves the
 * fold, but NOT that the real headless engine executes it.
 *
 * This suite runs the meta-node flows through the SAME path a distributed /
 * standalone Bun worker uses in `server/src/worker/execution.worker.ts`
 * (`handleFlow`'s folded fast path):
 *
 *     compileFlow(flow)  →  new PolymeraseEngine({ contextProviders })
 *                        →  engine.executeScript(folded.source, inputs)
 *
 * `executeScript` goes through `SynthaseService` → the SES compartment, the
 * exact runtime the worker uses — not a raw eval. We assert the engine's
 * OUTPUT VALUES, not the emitted string.
 *
 * Hermetic: every flow uses plain number / list / object data so the test
 * needs NO nucleation WASM. We supply a minimal pure-JS context (just the
 * `Progress` reporter the folded source calls), so there is no WASM init and
 * the suite runs anywhere `@flow/core` + `@flow/synthase` are built.
 */

import { describe, it, expect } from 'vitest';
import { compileFlow, type FlowLike } from './flow-compiler.js';
import { type GroupNodeData, type MapNodeData } from './group.js';
import { PolymeraseEngine } from '../Engine.js';

// ── headless harness ────────────────────────────────────────────────────────

/** Minimal pure-JS context — the folded source only calls Progress.report. */
function makeEngine(): PolymeraseEngine {
  return new PolymeraseEngine({
    contextProviders: {
      Progress: { report: () => {} },
    } as unknown as Record<string, unknown>,
  });
}

/**
 * Fold the flow then run it through the REAL engine (compartment path),
 * returning the engine's `result.result` map — exactly what `handleFlow`'s
 * folded path serializes back to the caller.
 */
async function runHeadless(
  flow: FlowLike,
  inputs: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const folded = compileFlow(flow);
  const engine = makeEngine();
  try {
    const result = await engine.executeScript(folded.source, inputs);
    if (!result.success) {
      throw new Error(`headless execution failed: ${result.error?.message}`);
    }
    return result.result ?? {};
  } finally {
    engine.destroy();
  }
}

// ── reusable block sources / contracts (plain number/list/object) ────────────

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

// ── tests ─────────────────────────────────────────────────────────────────

describe('headless meta-node execution (real engine, folded path)', () => {
  it('Reroute + Constant: literal flows through a reroute into a code node', async () => {
    // constant(21) → reroute → Adder(b=4) → output  ⇒  25
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'k', dataType: 'number', value: 21 } },
        { id: 'kb', type: 'constant', data: { label: 'kb', dataType: 'number', value: 4 } },
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
    expect(await runHeadless(flow)).toEqual({ result: 25 });
  });

  it('Bundle → consumer → Unbundle round-trips an object through the engine', async () => {
    // kx=3, ky=9, kz=5 → Bundle{width,height,depth}
    //   → CfgSum(total=17) AND Unbundle pulls width/height back out as scalars
    const PASS_CFG = `type Inputs = { cfg: { width: number; height: number; depth: number } };
type Outputs = { cfg: { width: number; height: number; depth: number }; total: number };
function generate(inputs) {
  const c = inputs.cfg || {};
  return { cfg: c, total: (c.width||0)+(c.height||0)+(c.depth||0) };
}
`;
    const passCfgContract = {
      inputs: { cfg: cfgSumContract.inputs.cfg },
      outputs: { cfg: cfgSumContract.inputs.cfg, total: { kind: 'number' as const } },
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'kw', type: 'constant', data: { label: 'w', value: 3 } },
        { id: 'kh', type: 'constant', data: { label: 'h', value: 9 } },
        { id: 'kd', type: 'constant', data: { label: 'd', value: 5 } },
        {
          id: 'b',
          type: 'bundle',
          data: { label: 'cfg', bundleFields: [{ name: 'width' }, { name: 'height' }, { name: 'depth' }] },
        },
        { id: 'pass', type: 'code', data: { label: 'Pass', code: PASS_CFG, contract: passCfgContract } },
        {
          id: 'ub',
          type: 'unbundle',
          data: { label: 'split', bundleFields: [{ name: 'width' }, { name: 'height' }, { name: 'depth' }] },
        },
        { id: 'ow', type: 'output', data: { label: 'width' } },
        { id: 'oh', type: 'output', data: { label: 'height' } },
        { id: 'ot', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'kw', target: 'b', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'kh', target: 'b', sourceHandle: 'output', targetHandle: 'height' },
        { source: 'kd', target: 'b', sourceHandle: 'output', targetHandle: 'depth' },
        { source: 'b', target: 'pass', sourceHandle: 'output', targetHandle: 'cfg' },
        { source: 'pass', target: 'ub', sourceHandle: 'cfg', targetHandle: 'input' },
        { source: 'pass', target: 'ot', sourceHandle: 'total', targetHandle: 'input' },
        { source: 'ub', target: 'ow', sourceHandle: 'width', targetHandle: 'input' },
        { source: 'ub', target: 'oh', sourceHandle: 'height', targetHandle: 'input' },
      ],
    };
    expect(await runHeadless(flow)).toEqual({ width: 3, height: 9, total: 17 });
  });

  it('Group: a sub-pipeline (sum a list, then double) produces a value', async () => {
    // constant([1,2,3,4]) → Group{ Sum → Double } → output  ⇒  (1+2+3+4)*2 = 20
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
    expect(await runHeadless(flow)).toEqual({ result: 20 });
  });

  it('Map: doubles each element of a list → [2,4,6]', async () => {
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
    expect(await runHeadless(flow)).toEqual({ doubled: [2, 4, 6] });
  });

  it('Switch: selector picks the matching branch', async () => {
    function switchFlow(selector: number): FlowLike {
      return {
        nodes: [
          { id: 'sel', type: 'constant', data: { label: 'sel', value: selector } },
          { id: 'c0', type: 'constant', data: { label: 'c0', value: 'zero' } },
          { id: 'c1', type: 'constant', data: { label: 'c1', value: 'one' } },
          { id: 'def', type: 'constant', data: { label: 'def', value: 'fallback' } },
          { id: 'sw', type: 'switch', data: { label: 'pick', caseCount: 2 } },
          { id: 'out', type: 'output', data: { label: 'picked' } },
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
    expect(await runHeadless(switchFlow(0))).toEqual({ picked: 'zero' });
    expect(await runHeadless(switchFlow(1))).toEqual({ picked: 'one' });
    expect(await runHeadless(switchFlow(7))).toEqual({ picked: 'fallback' });
  });

  it('combined: Map then Group reduces the mapped list (end-to-end through engine)', async () => {
    // [1,2,3] → Map(double) → [2,4,6] → Group(Sum) → 12
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
    const sumGroup: GroupNodeData = {
      label: 'SumGroup',
      subgraph: {
        nodes: [
          { id: 'g-sum', type: 'code', data: { label: 'Sum', code: SUM_LIST, contract: sumListContract } },
        ],
        edges: [],
      },
      groupInputs: [
        {
          name: 'items',
          internalNodeId: 'g-sum',
          internalHandle: 'items',
          externalNodeId: 'm',
          externalHandle: 'output',
          type: { kind: 'list', of: { kind: 'number' } },
        },
      ],
      groupOutputs: [
        {
          name: 'total',
          internalNodeId: 'g-sum',
          internalHandle: 'total',
          externalNodeId: 'out',
          externalHandle: 'input',
          type: { kind: 'number' },
        },
      ],
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'src', type: 'constant', data: { label: 'list', value: [1, 2, 3] } },
        { id: 'm', type: 'map', data: doubleBody as unknown as Record<string, unknown> },
        { id: 'grp', type: 'group', data: sumGroup as unknown as Record<string, unknown> },
        { id: 'out', type: 'output', data: { label: 'total' } },
      ],
      edges: [
        { source: 'src', target: 'm', sourceHandle: 'output', targetHandle: 'list' },
        { source: 'm', target: 'grp', sourceHandle: 'output', targetHandle: 'items' },
        { source: 'grp', target: 'out', sourceHandle: 'total', targetHandle: 'input' },
      ],
    };
    expect(await runHeadless(flow)).toEqual({ total: 12 });
  });
});

// ── calling-convention fix: positional-param blocks fold correctly ───────────
//
// Several shipped blocks were authored with POSITIONAL params
// (`function generate(a, b, c)`). The editor's per-node runner handles those
// (it spreads `generate(__inputs.a, __inputs.b, …)`), but `compileFlow` used to
// inline the block and ALWAYS call it with a single object `generate({ … })`,
// so a positional block received the whole inputs object as its first param and
// `undefined` for the rest — silently wrong when folded for headless / module /
// distributed-worker execution. `compileFlow` now mirrors the per-node runner:
// it detects positional params and spreads them in declared order. These tests
// run a positional block through the REAL engine and assert the OUTPUT, proving
// both paths agree.

describe('headless positional-param block execution (calling-convention fix)', () => {
  // Mirrors the historical shape of the shipped assembler/rom-data blocks:
  // positional params with type annotations and NO `type Inputs` declaration.
  // Pure-JS (no ambient Rom/Asm) so the hermetic harness can execute it.
  const POSITIONAL_PACK = `function generate(
  bytes: number[],
  base: number,
  width: number,
): {
  data: string;
  words: number;
} {
  const b = bytes || [];
  const radix = base || 16;
  const w = width || 2;
  const data = b
    .map((n) => {
      let s = (n >>> 0).toString(radix);
      while (s.length < w) s = '0' + s;
      return s;
    })
    .join('');
  return { data, words: b.length };
}
`;
  const positionalPackContract = {
    inputs: {
      bytes: { kind: 'list' as const, of: { kind: 'number' as const } },
      base: { kind: 'number' as const },
      width: { kind: 'number' as const },
    },
    outputs: { data: { kind: 'string' as const }, words: { kind: 'number' as const } },
  };

  it('spreads positional params in declared order (bytes/base/width) when folded', async () => {
    // bytes=[10,255,1] base=16 width=2 → "0aff01"; words=3.
    const flow: FlowLike = {
      nodes: [
        { id: 'kb', type: 'constant', data: { label: 'bytes', value: [10, 255, 1] } },
        { id: 'kbase', type: 'constant', data: { label: 'base', dataType: 'number', value: 16 } },
        { id: 'kw', type: 'constant', data: { label: 'width', dataType: 'number', value: 2 } },
        { id: 'pack', type: 'code', data: { label: 'Pack', code: POSITIONAL_PACK, contract: positionalPackContract } },
        { id: 'od', type: 'output', data: { label: 'data' } },
        { id: 'ow', type: 'output', data: { label: 'words' } },
      ],
      edges: [
        { source: 'kb', target: 'pack', sourceHandle: 'output', targetHandle: 'bytes' },
        { source: 'kbase', target: 'pack', sourceHandle: 'output', targetHandle: 'base' },
        { source: 'kw', target: 'pack', sourceHandle: 'output', targetHandle: 'width' },
        { source: 'pack', target: 'od', sourceHandle: 'data', targetHandle: 'input' },
        { source: 'pack', target: 'ow', sourceHandle: 'words', targetHandle: 'input' },
      ],
    };
    expect(await runHeadless(flow)).toEqual({ data: '0aff01', words: 3 });
  });

  it('falls back to per-param defaults for unconnected positional inputs', async () => {
    // Only `bytes` connected; base/width unconnected → folded defaults (0) feed
    // the block, which coerces them to its own fallbacks (radix 16, width 2).
    const flow: FlowLike = {
      nodes: [
        { id: 'kb', type: 'constant', data: { label: 'bytes', value: [171] } },
        { id: 'pack', type: 'code', data: { label: 'Pack', code: POSITIONAL_PACK, contract: positionalPackContract } },
        { id: 'od', type: 'output', data: { label: 'data' } },
      ],
      edges: [
        { source: 'kb', target: 'pack', sourceHandle: 'output', targetHandle: 'bytes' },
        { source: 'pack', target: 'od', sourceHandle: 'data', targetHandle: 'input' },
      ],
    };
    expect(await runHeadless(flow)).toEqual({ data: 'ab' });
  });

  it('runs a single-positional-param block folded (matches the assembler shape)', async () => {
    // `function generate(program: …)` — one positional param, the exact shape of
    // the ARPU/BatPU/URCL/IRIS assembler blocks (one Textarea input).
    const SINGLE_POS = `function generate(program: string): { count: number } {
  return { count: (program || '').split('\\n').filter((l) => l.trim() !== '').length };
}
`;
    const singleContract = {
      inputs: { program: { kind: 'string' as const } },
      outputs: { count: { kind: 'number' as const } },
    };
    const flow: FlowLike = {
      nodes: [
        { id: 'k', type: 'constant', data: { label: 'program', dataType: 'string', value: 'a\nb\n\nc' } },
        { id: 'asm', type: 'code', data: { label: 'Asm', code: SINGLE_POS, contract: singleContract } },
        { id: 'out', type: 'output', data: { label: 'count' } },
      ],
      edges: [
        { source: 'k', target: 'asm', sourceHandle: 'output', targetHandle: 'program' },
        { source: 'asm', target: 'out', sourceHandle: 'count', targetHandle: 'input' },
      ],
    };
    expect(await runHeadless(flow)).toEqual({ count: 3 });
  });
});
