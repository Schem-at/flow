/**
 * Vite plugin: `virtual:nucleation-dts` resolves to the installed nucleation
 * package's .d.ts as a string. Used for Monaco autocomplete + the docs
 * browser; a virtual module because nucleation's exports map doesn't expose
 * the file and the dep optimizer mangles ?raw aliases.
 */

import fs from 'fs';
import path from 'path';

const dtsPath = [
  path.resolve(__dirname, 'node_modules/nucleation/nucleation.d.ts'),
  path.resolve(__dirname, '../node_modules/nucleation/nucleation.d.ts'),
].find((p) => fs.existsSync(p));

export function nucleationDtsPlugin() {
  return {
    name: 'nucleation-dts',
    resolveId(id: string) {
      if (id === 'virtual:nucleation-dts') return '\0nucleation-dts';
      return null;
    },
    load(id: string) {
      if (id !== '\0nucleation-dts') return null;
      if (!dtsPath) return 'export default "";';
      return `export default ${JSON.stringify(fs.readFileSync(dtsPath, 'utf8'))};`;
    },
  };
}
