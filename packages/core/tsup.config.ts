import { defineConfig } from 'tsup';

// One build owns dist. Parallel configs previously let the main build clean
// files while the worker build was writing chunks into the same directory.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'worker/index': 'src/worker/index.ts',
    'worker/browser.worker': 'src/worker/browser.worker.ts',
    'worker/bun.worker': 'src/worker/bun.worker.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  noExternal: ['mitt'],
});
