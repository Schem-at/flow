/**
 * Honest end-to-end benchmark: POST each example flow to /api/execute with
 * folding ON vs OFF (per-node engine), N runs each, full wall-clock incl.
 * worker spawn + WASM init + serialization + HTTP.
 */
import {
  JULIA_STITCH_FLOW,
  MAZE_FLOW,
  BUILD_REPORT_FLOW,
  WORLDGEN_FLOW,
  LOGIC_LAB_FLOW,
} from '../client/src/lib/exampleFlows';

const N = 4;

async function run(flow: unknown, fold: boolean): Promise<number> {
  const t0 = performance.now();
  const res = await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowData: flow, fold }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`run failed (fold=${fold}): ${JSON.stringify(json.error).slice(0, 200)}`);
  return performance.now() - t0;
}

function fmt(times: number[]): string {
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return `${Math.round(median)}ms (min ${Math.round(sorted[0])})`;
}

console.log(`flow                          | per-node engine     | folded              | speedup`);
console.log(`------------------------------|---------------------|---------------------|--------`);
for (const flow of [JULIA_STITCH_FLOW, MAZE_FLOW, LOGIC_LAB_FLOW, BUILD_REPORT_FLOW, WORLDGEN_FLOW]) {
  await run(flow, true); // warm fold cache + page caches
  const unfolded: number[] = [];
  const folded: number[] = [];
  for (let i = 0; i < N; i++) unfolded.push(await run(flow, false));
  for (let i = 0; i < N; i++) folded.push(await run(flow, true));
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const speedup = (med(unfolded) / med(folded)).toFixed(2);
  console.log(
    `${(flow as { name: string }).name.padEnd(30)}| ${fmt(unfolded).padEnd(20)}| ${fmt(folded).padEnd(20)}| ${speedup}x`
  );
}
