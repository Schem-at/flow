/**
 * Fold real example flows into single scripts, verify they produce the same
 * outputs as per-node execution, and measure the speedup.
 *
 *   bun run scripts/bench-folded-flows.ts
 */

import { compileBlock, compileFlow } from '../packages/core/src/compile/index';
import { executeInCompartment } from '../packages/synthase/src/compartment-executor';
import {
  JULIA_STITCH_FLOW,
  WORLDGEN_FLOW,
  BUILD_REPORT_FLOW,
  MAZE_FLOW,
} from '../client/src/lib/exampleFlows';

const nucleation = await import('nucleation');
if (typeof (nucleation as any).default === 'function') { try { await (nucleation as any).default(); } catch {} }

const ctx = {
  Schematic: (nucleation as any).SchematicWrapper,
  Math: Object.assign(Object.create(Math), { TAU: Math.PI * 2 }),
  Logger: console,
  Progress: { report: () => {} },
};

async function runBlock(source: string, inputs: Record<string, unknown>) {
  const compiled = compileBlock(source, { contextKeys: Object.keys(ctx) });
  return executeInCompartment(compiled.functionCode, inputs, ctx, { timeout: 120000 }) as Promise<Record<string, unknown>>;
}

/** Minimal per-node interpreter mirroring the engine's walk (for comparison). */
async function runPerNode(flow: typeof JULIA_STITCH_FLOW) {
  const outputs = new Map<string, Record<string, unknown>>();
  const codeNodes = flow.nodes.filter((n) => n.type === 'code');
  const done = new Set<string>();
  for (const n of flow.nodes) {
    if (n.type === 'input') outputs.set(n.id, { output: n.data.value });
  }
  // naive repeated passes (flows are small)
  while (done.size < codeNodes.length) {
    let progressed = false;
    for (const node of codeNodes) {
      if (done.has(node.id)) continue;
      const incoming = flow.edges.filter((e) => e.target === node.id);
      const deps = incoming.map((e) => e.source).filter((s) => flow.nodes.find((n) => n.id === s)?.type === 'code');
      if (!deps.every((d) => done.has(d))) continue;
      const inputs: Record<string, unknown> = {};
      for (const [name, t] of Object.entries(node.data.contract!.inputs)) {
        const edge = incoming.find((e) => e.targetHandle === name);
        if (edge) {
          const src = outputs.get(edge.source);
          inputs[name] = src?.[edge.sourceHandle ?? 'output'] ?? src?.output;
        } else {
          const { defaultValueForType } = await import('../packages/core/src/types/flow-type');
          inputs[name] = defaultValueForType(t as any);
        }
      }
      outputs.set(node.id, await runBlock(node.data.code!, inputs));
      done.add(node.id);
      progressed = true;
    }
    if (!progressed) throw new Error('per-node walk stuck');
  }
  const result: Record<string, unknown> = {};
  for (const node of flow.nodes.filter((n) => n.type === 'output')) {
    const edge = flow.edges.find((e) => e.target === node.id);
    if (!edge) continue;
    result[node.data.label || 'output'] = outputs.get(edge.source)?.[edge.sourceHandle ?? 'output'];
  }
  return result;
}

function fingerprint(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as any).to_schematic === 'function') {
    // Hash the BLOCK CONTENT (sorted) — .schem bytes embed metadata like
    // timestamps which differ run to run.
    const entries = ((value as any).blocks() as Array<{ x: number; y: number; z: number; name: string }>)
      .filter((b) => b.name !== 'minecraft:air')
      .map((b) => `${b.x},${b.y},${b.z},${b.name}`)
      .sort();
    let h = 0;
    const text = entries.join(';');
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `schem[${entries.length} blocks #${(h >>> 0).toString(36)}]`;
  }
  if (value && typeof value === 'object' && 'data' in (value as object) && 'width' in (value as object)) {
    const img = value as { width: number; height: number; data: ArrayLike<number> };
    let h = 0;
    for (let i = 0; i < img.data.length; i++) h = (h * 31 + (img.data[i] as number)) | 0;
    return `img[${img.width}x${img.height}#${(h >>> 0).toString(36)}]`;
  }
  return JSON.stringify(value)?.slice(0, 80) ?? String(value);
}

for (const flow of [JULIA_STITCH_FLOW, MAZE_FLOW, BUILD_REPORT_FLOW, WORLDGEN_FLOW]) {
  const folded = compileFlow(flow as any);

  const t0 = performance.now();
  const perNode = await runPerNode(flow);
  const tPerNode = performance.now() - t0;

  const t1 = performance.now();
  const foldedResult = await runBlock(folded.source, {});
  const tFolded = performance.now() - t1;

  // second folded run = "cache hit" path (compile already done)
  const t2 = performance.now();
  await runBlock(folded.source, {});
  const tFolded2 = performance.now() - t2;

  console.log(`\n=== ${flow.name} (hash ${folded.hash}) — order: ${folded.nodeOrder.join(' → ')}`);
  console.log(`  per-node: ${tPerNode.toFixed(0)}ms | folded: ${tFolded.toFixed(0)}ms | folded again: ${tFolded2.toFixed(0)}ms`);
  let match = true;
  for (const key of Object.keys(perNode)) {
    const a = fingerprint(perNode[key]);
    const b = fingerprint(foldedResult[key]);
    const same = a === b;
    if (!same) match = false;
    console.log(`  ${same ? '✓' : '✗'} ${key}: ${same ? a : a + ' vs ' + b}`);
  }
  console.log(match ? '  EQUIVALENT' : '  MISMATCH');
}
