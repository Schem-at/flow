import { CITY_FLOW } from '../client/src/lib/exampleFlows';
const res = await fetch('http://localhost:3001/api/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flowData: CITY_FLOW }),
});
const json = await res.json();
console.log('success:', json.success, '| keys:', Object.keys(json.result ?? {}));
if (!json.success) {
  console.log('error:', JSON.stringify(json.error).slice(0, 500));
  console.log('logs tail:', (json.logs ?? []).slice(-8).join('\n'));
}
