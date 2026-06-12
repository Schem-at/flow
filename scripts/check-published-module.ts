/** Resolve the just-published flow-module and execute its folded code. */
const list = await (await fetch('http://localhost:3001/api/modules')).json();
const items = list.modules ?? list.data ?? [];
const mod = items.find((m: { name: string }) => m.name?.includes('Asset census probe'));
if (!mod) { console.log('FAIL: module not found'); process.exit(1); }

const resolved = await (await fetch(`http://localhost:3001/api/modules/${mod.id}/resolve`)).json();
console.log('module:', mod.name, '| version:', resolved.version, '| ioSchema keys:', Object.keys(resolved.ioSchema ?? {}));
console.log('code has baked asset (__b64):', resolved.code.includes('__b64('));
console.log('code length:', resolved.code.length);

// Execute the module's code directly as a block via the API workbench path
const exec = await (await fetch('http://localhost:3001/api/execute-block', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: resolved.code, inputs: {} }),
})).json().catch(() => null);
console.log('direct block exec:', JSON.stringify(exec).slice(0, 300));
