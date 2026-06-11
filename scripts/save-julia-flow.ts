import { JULIA_STITCH_FLOW } from '../client/src/lib/exampleFlows';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';
const ID = process.env.FLOW_ID ?? '74e5e075-fb0e-40a7-ba8d-8a2d2dd3ce60';
const res = await fetch(`${SERVER}/api/flows/${ID}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...JULIA_STITCH_FLOW,
    id: ID,
  }),
});
const json = await res.json();
console.log('PUT success:', json.success, json.error ?? '');
const check = await (await fetch(`${SERVER}/api/flows/${ID}`)).json();
const jc = check.flow.jsonContent;
console.log('node count now:', jc?.nodes?.length, jc?.nodes?.map((n: any) => n.type));
