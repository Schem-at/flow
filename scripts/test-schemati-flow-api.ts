/**
 * Server-side run of the Schemati Browser example flow (folded + unfolded):
 * search the platform by tag, download the top match, return it as a
 * schematic. Requires the flow server to be started with SCHEMATI_URL.
 */
import { SCHEMATI_BROWSER_FLOW } from '../client/src/lib/exampleFlows';

const API = 'http://localhost:3001';

let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' — ' + JSON.stringify(extra)?.slice(0, 300)}`);
  if (!ok) failures++;
}

const save = await (await fetch(`${API}/api/flows`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Schemati browser probe',
    nodes: SCHEMATI_BROWSER_FLOW.nodes,
    edges: SCHEMATI_BROWSER_FLOW.edges,
  }),
})).json();
const flowId = save.flow?.id;
check('flow saved', !!flowId, save);

for (const fold of [true, false]) {
  const res = await (await fetch(`${API}/api/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowId, fold }),
  })).json();
  const tag = fold ? 'folded' : 'unfolded';
  const usedFold = (res.logs ?? []).some((l: string) => l.includes('Folded flow'));
  check(`${tag}: success`, res.success === true, res.error ?? res.logs);
  check(`${tag}: folding ${fold ? 'used' : 'skipped'}`, usedFold === fold, res.logs);
  const out = res.result?.schematic;
  const looksLikeSchematic =
    out && typeof out === 'object' &&
    ('data' in out || 'format' in out || 'blocks' in out || 'dimensions' in (out as object));
  check(`${tag}: schematic output present`, !!looksLikeSchematic, out ? Object.keys(out) : res.result);
}

console.log(failures === 0 ? 'SCHEMATI_FLOW_API_PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
