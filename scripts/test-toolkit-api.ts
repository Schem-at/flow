/**
 * Toolkit smoke test through the REAL execution pipeline (folded + per-node):
 * Field.fromNoise → toTerrain, Random determinism, Table.toCsv, Mcfunction,
 * the blocks() air-default, and paste() — all inside the SES sandbox.
 */
const API = process.env.FLOW_API ?? 'http://localhost:3001';

const TOOLKIT_BLOCK = `type Inputs = {
  size: Slider<{ min: 8; max: 64; default: 12 }>;
};

type Outputs = {
  terrain: Schematic;
  solidCount: number;
  airIncludedCount: number;
  csv: string;
  fn: string;
  rand: number;
  pasted: number;
};

function generate(inputs) {
  const size = inputs.size | 0;
  const field = Field.terrace(Field.fromNoise(size, size, { frequency: 0.08 }), 4);
  const terrain = Field.toTerrain(field, { maxHeight: 6 });

  const solid = terrain.blocks();
  const withAir = terrain.blocks({ includeAir: true });

  const copy = new Schematic();
  copy.paste(terrain, 2, 0, 2);

  const rows = [{ block: 'a,b', count: 1 }];
  const f = Mcfunction.builder().killTagged('t').setblock([0, 1, 2], 'minecraft:stone');

  return {
    terrain,
    solidCount: solid.length,
    airIncludedCount: withAir.length,
    csv: Table.toCsv(rows),
    fn: f.toString(),
    rand: Random.hash2(3, 7, 42),
    pasted: copy.blocks().length,
  };
}
`;

const flow = {
  nodes: [
    {
      id: 'tk', type: 'code', position: { x: 0, y: 0 },
      data: {
        label: 'Toolkit', code: TOOLKIT_BLOCK,
        contract: {
          inputs: { size: { kind: 'number', widget: 'slider', min: 8, max: 64, default: 12 } },
          outputs: {
            terrain: { kind: 'schematic' }, solidCount: { kind: 'number' },
            airIncludedCount: { kind: 'number' }, csv: { kind: 'string' },
            fn: { kind: 'string' }, rand: { kind: 'number' }, pasted: { kind: 'number' },
          },
        },
      },
    },
  ],
  edges: [],
};
// The per-node engine only exposes wired outputs (folded also exposes
// terminal results) — wire the scalars so both modes are comparable.
for (const name of ['solidCount', 'airIncludedCount', 'csv', 'fn', 'rand', 'pasted']) {
  flow.nodes.push({
    id: 'out-' + name, type: 'output', position: { x: 400, y: flow.nodes.length * 90 },
    data: { label: name },
  } as (typeof flow.nodes)[number]);
  (flow.edges as unknown[]).push({ id: 'e-' + name, source: 'tk', target: 'out-' + name, sourceHandle: name, targetHandle: 'input' });
}

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' — ' + JSON.stringify(extra)?.slice(0, 250)}`);
  if (!ok) failures++;
}

const save = await (await fetch(`${API}/api/flows`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Toolkit smoke', nodes: flow.nodes, edges: flow.edges }),
})).json();
check('flow saved', !!save.flow?.id, save);

const expectedRand = 0; // filled on first run; both modes must agree
let firstRand: number | null = null;

for (const fold of [true, false]) {
  const res = await (await fetch(`${API}/api/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowId: save.flow.id, fold }),
  })).json();
  const tag = fold ? 'folded' : 'per-node';
  const r = res.result ?? {};
  check(`${tag}: success`, res.success === true, res.error ?? res.logs);
  check(`${tag}: terrain produced + solid blocks counted`, r.solidCount > 0, r);
  check(`${tag}: air-default excludes air`, r.airIncludedCount >= r.solidCount, { solid: r.solidCount, withAir: r.airIncludedCount });
  check(`${tag}: paste copied all solid blocks`, r.pasted > 0 && r.pasted === r.solidCount, { pasted: r.pasted, solid: r.solidCount });
  check(`${tag}: Table.toCsv escapes`, r.csv === 'block,count\n"a,b",1', r.csv);
  check(`${tag}: Mcfunction builder output`, typeof r.fn === 'string' && r.fn.includes('kill @e[tag=t]') && r.fn.includes('setblock ~0 ~1 ~2'), r.fn);
  if (firstRand === null) firstRand = r.rand;
  check(`${tag}: Random deterministic across modes`, r.rand === firstRand && r.rand > 0 && r.rand < 1, r.rand);
}

console.log(failures === 0 ? 'TOOLKIT_API_PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
