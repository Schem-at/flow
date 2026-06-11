/**
 * Exercise the API surface: POST the Julia Set Mosaic example flow to
 * /api/execute and verify the stitched schematic comes back.
 *
 *   bun run scripts/test-julia-api.ts
 */

import { JULIA_STITCH_FLOW } from '../client/src/lib/exampleFlows';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';

const response = await fetch(`${SERVER}/api/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ flowData: JULIA_STITCH_FLOW }),
});

const json = (await response.json()) as {
  success: boolean;
  status?: string;
  result?: Record<string, unknown>;
  executionTime?: number;
  error?: unknown;
  logs?: string[];
};

console.log('http status:', response.status);
console.log('success:', json.success, '| status:', json.status, '| time:', json.executionTime, 'ms');

if (!json.success) {
  console.log('error:', JSON.stringify(json.error));
  console.log('logs tail:', (json.logs ?? []).slice(-5));
  process.exit(1);
}

const result = json.result ?? {};
console.log('result keys:', Object.keys(result));

// Find the schematic payload wherever the engine put it
function findSchem(value: unknown, path = 'result'): { path: string; bytes: number } | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.data === 'string' && obj.format) {
    return { path, bytes: Math.floor((obj.data.length * 3) / 4) };
  }
  if (obj.data instanceof Object && 'byteLength' in (obj.data as object)) {
    return { path, bytes: (obj.data as { byteLength: number }).byteLength };
  }
  for (const [k, v] of Object.entries(obj)) {
    const hit = findSchem(v, `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
}

const schem = findSchem(result);
if (schem) {
  console.log(`PASS: stitched schematic at ${schem.path} (~${schem.bytes} bytes)`);
} else {
  console.log('FAIL: no schematic found in result:', JSON.stringify(result).slice(0, 400));
  process.exit(1);
}
