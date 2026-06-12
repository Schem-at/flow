/**
 * End-to-end probe of the module backend:
 * list → create → list (find it) → resolve (code + ioSchema) → versions →
 * update (new version) → resolve pinned old version → delete → gone.
 */
const BASE = 'http://localhost:3001/api/modules';

const BLOCK = `type Inputs = { x: number };
type Outputs = { y: number };
function generate(inputs) { return { y: inputs.x * 2 }; }
`;

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' — ' + JSON.stringify(extra)}`);
  if (!ok) failures++;
}

const list0 = await (await fetch(BASE)).json();
check('GET list returns success+array', list0.success === true && Array.isArray(list0.modules ?? list0.data ?? list0.items), list0);

const createRes = await (await fetch(BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Probe Doubler',
    description: 'api probe module',
    code: BLOCK,
    io_schema: { inputs: { x: { type: 'number' } }, outputs: { y: { type: 'number' } } },
    visibility: 'private',
  }),
})).json();
const mod = createRes.module ?? createRes.data ?? createRes;
check('POST create', createRes.success === true && !!mod.id, createRes);
const id = mod.id;

const list1 = await (await fetch(BASE)).json();
const items = list1.modules ?? list1.data ?? list1.items ?? [];
const found = items.find((m: { id: string }) => m.id === id);
check('created module appears in list', !!found, items.map((m: { id: string; name: string }) => m.name));
check('list item has stats + version', !!found?.stats && typeof found?.version === 'string', found);

const resolved = await (await fetch(`${BASE}/${id}/resolve`)).json();
check('resolve returns code', resolved.code?.includes('generate'), resolved);
check('resolve returns ioSchema', !!resolved.ioSchema, Object.keys(resolved));
check('resolve returns version 1.0.0', resolved.version === '1.0.0', resolved.version);

const updateRes = await (await fetch(`${BASE}/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: BLOCK.replace('* 2', '* 3'), version: '1.1.0', changeNote: 'triple' }),
})).json();
check('PUT update (new version)', updateRes.success === true, updateRes);

const versions = await (await fetch(`${BASE}/${id}/versions`)).json();
const vlist = versions.versions ?? versions.data ?? [];
check('two versions listed, newest first', vlist.length === 2 && vlist[0].versionNumber === '1.1.0', vlist);

const latest = await (await fetch(`${BASE}/${id}/resolve`)).json();
check('latest resolves to 1.1.0 with new code', latest.version === '1.1.0' && latest.code.includes('* 3'), latest.version);

const pinned = await (await fetch(`${BASE}/${id}/resolve?version=1.0.0`)).json();
check('pinned 1.0.0 keeps old code', pinned.version === '1.0.0' && pinned.code.includes('* 2'), pinned.version);

const delRes = await (await fetch(`${BASE}/${id}`, { method: 'DELETE' })).json();
check('DELETE', delRes.success === true, delRes);
const gone = await fetch(`${BASE}/${id}/resolve`);
check('resolve after delete is 404', gone.status === 404, gone.status);

console.log(failures === 0 ? 'ALL_MODULE_API_CHECKS_PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
