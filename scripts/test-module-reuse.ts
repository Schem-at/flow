/**
 * The full reuse loop: resolve the published flow-module, insert it as a
 * code node in a NEW flow (what ModuleBrowser insert does), execute via API.
 * The module's baked asset must survive folding-of-the-folded-block.
 */
const list = await (await fetch('http://localhost:3001/api/modules')).json();
const mod = (list.modules ?? list.data ?? []).find((m: { name: string }) => m.name?.includes('Asset census probe'));
const resolved = await (await fetch(`http://localhost:3001/api/modules/${mod.id}/resolve`)).json();

const io = resolved.ioSchema;
const contract = {
  inputs: {},
  outputs: { total: { kind: 'number' }, stone: { kind: 'number' }, gold: { kind: 'number' }, summary: { kind: 'string' } },
};

const flow = {
  nodes: [
    {
      id: 'mod-1',
      type: 'code',
      position: { x: 0, y: 0 },
      data: {
        label: 'Census module',
        code: resolved.code,
        contract,
        moduleRef: { id: mod.id, version: resolved.version },
      },
    },
    { id: 'out-1', type: 'output', position: { x: 400, y: 0 }, data: { label: 'summary' } },
  ],
  edges: [{ id: 'e1', source: 'mod-1', target: 'out-1', sourceHandle: 'summary', targetHandle: 'input' }],
};

const save = await (await fetch('http://localhost:3001/api/flows', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Module reuse probe', description: 'module-in-flow e2e', nodes: flow.nodes, edges: flow.edges }),
})).json();
const flowId = save.flow?.id;
console.log('saved reuse flow:', flowId);
console.log('io schema from module:', JSON.stringify(io).slice(0, 120));

for (const fold of [true, false]) {
  const res = await (await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowId, fold }),
  })).json();
  const vals = JSON.stringify(res.result ?? {});
  const usedFold = (res.logs ?? []).some((l: string) => l.includes('Folded flow'));
  const ok = res.success && vals.includes('minecraft:stone=25');
  console.log(`${ok ? 'PASS' : 'FAIL'} ${fold ? 'folded' : 'unfolded'} (folding=${usedFold}):`, vals.slice(0, 160));
  if (!ok) process.exit(1);
}
console.log('MODULE_REUSE_PASSED');
