import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Only collect vitest suites from src/. The legacy suites in test/
		// use `bun:test` and are run via `bun test`.
		include: ['src/**/*.test.ts'],
	},
});
