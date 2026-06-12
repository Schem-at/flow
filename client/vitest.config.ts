import { defineConfig } from 'vitest/config';
import path from 'path';
import { nucleationDtsPlugin } from './nucleation-dts-plugin';

export default defineConfig({
  plugins: [nucleationDtsPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
