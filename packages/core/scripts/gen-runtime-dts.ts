/**
 * Generates `packages/core/generated/flow-runtime.d.ts` from the provider
 * registry. Run after adding/changing any provider's declarations():
 *
 *   bun run scripts/gen-runtime-dts.ts
 *
 * The editor can also call `createDefaultRegistry().runtimeDts()` at runtime to
 * get the same text without reading the file. The committed file exists for
 * review/diffing and static tooling. The drift test keeps it honest.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultRegistry } from '../src/providers/registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'generated', 'flow-runtime.d.ts');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, createDefaultRegistry().runtimeDts());
console.log('wrote', outPath);
