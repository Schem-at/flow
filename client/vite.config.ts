import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5176,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    hmr: {
      host: 'flow.schemati.test',
      port: 5176,
      protocol: 'wss',
    },
    proxy: {
      '/api': {
        target: 'http://schemati-app:80',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['nucleation'],
  },
});
