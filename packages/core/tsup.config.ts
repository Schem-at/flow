import { defineConfig } from 'tsup';

export default defineConfig([
  // Main bundle
  {
    entry: {
      index: 'src/index.ts',
      'types/index': 'src/types/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    outDir: 'dist',
  },
  // Worker bundle - separate builds for web worker and Bun worker
  {
    entry: {
      'worker/index': 'src/worker/index.ts',
      'worker/browser.worker': 'src/worker/browser.worker.ts',
      'worker/bun.worker': 'src/worker/bun.worker.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
    outDir: 'dist',
    noExternal: ['mitt'], // Bundle mitt into worker
  },
]);

