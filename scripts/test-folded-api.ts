import { JULIA_STITCH_FLOW } from '../client/src/lib/exampleFlows';

async function exec() {
  const t0 = performance.now();
  const res = await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowData: JULIA_STITCH_FLOW }),
  });
  const json = await res.json();
  const ms = performance.now() - t0;
  const foldLog = (json.logs ?? []).find((l: string) => l.includes('Folded flow'));
  return { ok: json.success, ms: Math.round(ms), keys: Object.keys(json.result ?? {}), foldLog };
}

const first = await exec();
console.log('run 1:', JSON.stringify(first));
const second = await exec();
console.log('run 2:', JSON.stringify(second));
