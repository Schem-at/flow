/**
 * End-to-end: a flow with a bundled schematic ASSET node feeding a census
 * block, executed via POST /api/execute (folded path). Verifies the baked
 * base64 → __b64 → Schematic.from_data round-trip inside the sandbox.
 */
const bytes = new Uint8Array(await Bun.file('/tmp/flow-asset-base.schem').arrayBuffer());
let bin = '';
for (const b of bytes) bin += String.fromCharCode(b);
const base64 = btoa(bin);

const CENSUS = `type Inputs = { base: Schematic };
type Outputs = { total: number; stone: number; gold: number; summary: string };
function generate(inputs) {
  const counts = {};
  for (const b of inputs.base.blocks()) {
    if (b.name === 'minecraft:air') continue;
    counts[b.name] = (counts[b.name] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, c) => a + c, 0);
  return {
    total,
    stone: counts['minecraft:stone'] || 0,
    gold: counts['minecraft:gold_block'] || 0,
    summary: Object.entries(counts).map(([k, v]) => k + '=' + v).join(', '),
  };
}
`;

const flow = {
  nodes: [
    {
      id: 'asset-1',
      type: 'asset',
      position: { x: 0, y: 0 },
      data: {
        label: 'Base platform',
        assetKind: 'schematic',
        format: 'schem',
        base64,
        name: 'flow-asset-base.schem',
        size: bytes.length,
      },
    },
    {
      id: 'census-1',
      type: 'code',
      position: { x: 300, y: 0 },
      data: {
        label: 'Census',
        code: CENSUS,
        contract: {
          inputs: { base: { kind: 'schematic' } },
          outputs: {
            total: { kind: 'number' },
            stone: { kind: 'number' },
            gold: { kind: 'number' },
            summary: { kind: 'string' },
          },
        },
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'asset-1', target: 'census-1', sourceHandle: 'output', targetHandle: 'base' },
    { id: 'e2', source: 'census-1', target: 'out-1', sourceHandle: 'summary', targetHandle: 'input' },
  ],
};
flow.nodes.push({
  id: 'out-1',
  type: 'output',
  position: { x: 600, y: 0 },
  data: { label: 'summary' },
} as (typeof flow.nodes)[number]);

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' — ' + JSON.stringify(extra)}`);
  if (!ok) failures++;
}

// Ad-hoc flowData still logs an execution row, which needs a real flow id.
const saveRes = await (await fetch('http://localhost:3001/api/flows', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Asset census probe',
    description: 'bundled-asset e2e test',
    nodes: flow.nodes,
    edges: flow.edges,
  }),
})).json();
const flowId = saveRes.flow?.id ?? saveRes.id;
check('flow saved (asset base64 round-trips)', !!flowId, saveRes);

const loaded = await (await fetch(`http://localhost:3001/api/flows/${flowId}`)).json();
const jc = typeof loaded.flow?.jsonContent === 'string'
  ? JSON.parse(loaded.flow.jsonContent)
  : loaded.flow?.jsonContent;
const loadedAsset = jc?.nodes?.find((n: { id: string }) => n.id === 'asset-1');
check('loaded flow keeps asset base64 intact', loadedAsset?.data?.base64 === base64, loadedAsset?.data);

for (const fold of [true, false]) {
  const res = await (await fetch('http://localhost:3001/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowId, fold }),
  })).json();

  const vals = JSON.stringify(res.result ?? {});
  const tag = fold ? 'folded' : 'unfolded';
  const folded = (res.logs ?? []).some((l: string) => l.includes('Folded flow'));
  check(`${tag}: execute success`, res.success === true, res);
  check(`${tag}: folding ${fold ? 'used' : 'skipped'}`, folded === fold, res.logs);
  // 25 stone + 1 gold + 1 torch — summary lists all non-air blocks
  check(`${tag}: torch found`, vals.includes('minecraft:torch=1'), vals.slice(0, 300));
  check(`${tag}: stone=25`, vals.includes('minecraft:stone=25'), vals.slice(0, 300));
  check(`${tag}: gold marker found`, vals.includes('minecraft:gold_block=1') || vals.includes('"gold":1'), vals.slice(0, 300));
}

console.log(failures === 0 ? 'ASSET_FLOW_API_PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
