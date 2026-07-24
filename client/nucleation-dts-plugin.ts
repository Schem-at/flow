/**
 * Vite plugin: `virtual:nucleation-dts` resolves to the installed nucleation
 * package's .d.ts as a string. Used for Monaco autocomplete + the docs
 * browser; a virtual module because nucleation's exports map doesn't expose
 * the file and the dep optimizer mangles ?raw aliases.
 *
 * Since nucleation 0.5.0 (diplomat-tool bridge), the package no longer ships
 * one bundled `nucleation.d.ts` — it ships one `.d.ts` per class/enum plus an
 * `index.d.ts` barrel (bare re-exports) and `diplomat-runtime.d.ts` (the
 * `pointer`/`codepoint` primitive aliases every class file imports). Bundle
 * every per-class file into one flat string so `ambientizeNucleationDts` in
 * ambient.ts can turn it into global declarations the same way it always has.
 */

import fs from 'fs';
import path from 'path';

const pkgDir = [
  path.resolve(__dirname, 'node_modules/nucleation'),
  path.resolve(__dirname, '../node_modules/nucleation'),
].find((p) => fs.existsSync(p));

// The barrel (bare re-exports, no declarations of its own) and the runtime
// primitives file (imported — and stripped as an `import` line — by every
// other file); declared manually below instead.
const EXCLUDE_FILES = new Set(['index.d.ts', 'diplomat-runtime.d.ts']);

function bundleNucleationDts(): string {
  if (!pkgDir) return '';
  const files = fs
    .readdirSync(pkgDir)
    .filter((f) => f.endsWith('.d.ts') && !EXCLUDE_FILES.has(f))
    .sort();
  const header = 'declare type pointer = number;\ndeclare type codepoint = number;\n';
  const bodies = files.map((f) => fs.readFileSync(path.join(pkgDir, f), 'utf8'));
  return header + bodies.join('\n');
}

export function nucleationDtsPlugin() {
  return {
    name: 'nucleation-dts',
    resolveId(id: string) {
      if (id === 'virtual:nucleation-dts') return '\0nucleation-dts';
      return null;
    },
    load(id: string) {
      if (id !== '\0nucleation-dts') return null;
      return `export default ${JSON.stringify(bundleNucleationDts())};`;
    },
  };
}
