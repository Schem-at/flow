/**
 * Vite plugin for the nucleation ≥ 0.3.0 (Diplomat-generated) package.
 *
 * The generated `diplomat.config.mjs` computes the wasm path with
 * `node:url`/`node:path` — Node-only; a browser bundle dies on the builtins.
 * This plugin swaps that config for a virtual module that imports the wasm as
 * a Vite `?url` asset: dev serves it via /@fs, the build emits it hashed.
 *
 * (Pre-0.3.0 this file served `virtual:nucleation-dts` — the installed
 * package's .d.ts as a string for Monaco/docs. The ambient docs are now
 * hand-authored in src/lib/block/nucleationAmbient.ts, so the virtual module
 * is gone; the exported plugin name is kept so vite/vitest configs need no
 * change.)
 */

import fs from 'fs';
import path from 'path';

const VIRTUAL = '\0nucleation-wasm-config';

const wasmPath = [
  path.resolve(__dirname, 'node_modules/nucleation/nucleation.wasm'),
  path.resolve(__dirname, '../node_modules/nucleation/nucleation.wasm'),
].find((p) => fs.existsSync(p));

export function nucleationDtsPlugin() {
  return {
    name: 'nucleation-wasm-config',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (
        source.endsWith('diplomat.config.mjs')
        && importer
        && importer.split(path.sep).join('/').includes('node_modules/nucleation')
      ) {
        return VIRTUAL;
      }
      return null;
    },
    load(id: string) {
      if (id !== VIRTUAL) return null;
      if (!wasmPath) return "export default { wasm_path: 'nucleation.wasm' };";
      const importPath = wasmPath.split(path.sep).join('/');
      return `import wasmUrl from ${JSON.stringify(`${importPath}?url`)};\nexport default { wasm_path: wasmUrl };`;
    },
  };
}
