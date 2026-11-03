import { configDefaults, defineConfig } from 'vitest/config';

// tool-backend / tool-runtime need the Bun runtime (Bun workers); they run under `bun test`.
export default defineConfig({
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/tool-backend.test.ts', 'tests/tool-runtime.test.ts', 'tests/tool-jobs.test.ts', 'tests/tool-jobs-e2e.test.ts'],
  },
});
