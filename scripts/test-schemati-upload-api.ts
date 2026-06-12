/**
 * Server-side upload round-trip: a flow generates a unique little tower and
 * publishes it to the platform via the Schemati Upload block (folded
 * execution). Then we confirm the schematic actually exists on schemati.
 * Requires the flow server started with SCHEMATI_URL + SCHEMATI_API_TOKEN.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const API = 'http://localhost:3001';
const STAMP = Date.now().toString(36);
const NAME = `Flow upload probe ${STAMP}`;

const GENERATOR = `type Inputs = { height: number };
type Outputs = { tower: Schematic };
function generate(inputs) {
  const tower = new Schematic();
  for (let y = 0; y < inputs.height; y++) {
    tower.set_block(0, y, 0, y % 2 ? 'minecraft:gold_block' : 'minecraft:stone');
  }
  return { tower };
}
`;

const UPLOADER = `type Inputs = { schematic: Schematic; name: string };
type Outputs = { id: string; url: string };
async function generate(inputs) {
  const uploaded = await Schemati.uploadSchematic(inputs.schematic, {
    name: inputs.name,
    description: 'Uploaded by an automated flow test',
    tags: ['door'],
    isPublic: true,
  });
  return { id: uploaded.shortId || uploaded.id, url: uploaded.webUrl || '' };
}
`;

const flow = {
  nodes: [
    // Height varies per run so the file hash is unique (duplicate guard).
    { id: 'h', type: 'input', position: { x: 0, y: 0 }, data: { label: 'height', value: 3 + (Date.now() % 17), dataType: 'number' } },
    { id: 'n', type: 'input', position: { x: 0, y: 120 }, data: { label: 'name', value: NAME, dataType: 'string' } },
    {
      id: 'gen', type: 'code', position: { x: 300, y: 0 },
      data: {
        label: 'Tower', code: GENERATOR,
        contract: { inputs: { height: { kind: 'number' } }, outputs: { tower: { kind: 'schematic' } } },
      },
    },
    {
      id: 'up', type: 'code', position: { x: 600, y: 0 },
      data: {
        label: 'Publish', code: UPLOADER,
        contract: {
          inputs: { schematic: { kind: 'schematic' }, name: { kind: 'string' } },
          outputs: { id: { kind: 'string' }, url: { kind: 'string' } },
        },
      },
    },
    { id: 'out', type: 'output', position: { x: 900, y: 0 }, data: { label: 'id' } },
  ],
  edges: [
    { id: 'e1', source: 'h', target: 'gen', sourceHandle: 'output', targetHandle: 'height' },
    { id: 'e2', source: 'gen', target: 'up', sourceHandle: 'tower', targetHandle: 'schematic' },
    { id: 'e3', source: 'n', target: 'up', sourceHandle: 'output', targetHandle: 'name' },
    { id: 'e4', source: 'up', target: 'out', sourceHandle: 'id', targetHandle: 'input' },
  ],
};

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' — ' + JSON.stringify(extra)?.slice(0, 350)}`);
  if (!ok) failures++;
}

const save = await (await fetch(`${API}/api/flows`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Upload probe flow', nodes: flow.nodes, edges: flow.edges }),
})).json();
check('flow saved', !!save.flow?.id, save);

const res = await (await fetch(`${API}/api/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flowId: save.flow.id }),
})).json();
const usedFold = (res.logs ?? []).some((l: string) => l.includes('Folded flow'));
check('folded execution success', res.success === true && usedFold, res.error ?? res.logs);
const uploadedId = res.result?.id;
check('upload returned an id', typeof uploadedId === 'string' && uploadedId.length > 0, res.result);

// Confirm it exists on the platform
const found = await (await fetch(`https://schemati.test/api/v1/schematics?search=${encodeURIComponent(NAME)}`)).json();
const hit = (found.data ?? []).find((s: { name: string }) => s.name === NAME);
check('schematic exists on schemati', !!hit, (found.data ?? []).map((s: { name: string }) => s.name));
check('uploaded with door tag', !!hit && hit.tags.some((t: { name: string }) => t.name === 'door'), hit?.tags);
check('has a preview image url', !!hit && !!hit.preview_image_url, hit && Object.keys(hit));

console.log(failures === 0 ? 'SCHEMATI_UPLOAD_API_PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
