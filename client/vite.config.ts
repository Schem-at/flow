import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import wasm from 'vite-plugin-wasm';
import { nucleationDtsPlugin } from './nucleation-dts-plugin';

export default defineConfig(({ mode }) => {
  // Load all env vars (no prefix filter) so infra settings can be plain or VITE_-prefixed.
  const env = loadEnv(mode, process.cwd(), '');

  const port = Number(env.VITE_PORT ?? 5176);

  // HMR + /api proxy default to local standalone dev. The Docker/coupled (schemati)
  // setup overrides these via env: HMR_HOST=flow.schemati.test, HMR_PROTOCOL=wss,
  // API_PROXY_TARGET=http://schemati-app:80.
  const hmrHost = env.VITE_HMR_HOST ?? 'localhost';
  const hmrProtocol = env.VITE_HMR_PROTOCOL ?? 'ws';
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss(), wasm(), nucleationDtsPlugin()],
    build: {
      target: 'esnext',
    },
    worker: {
      format: 'es',
    },
    server: {
      port,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      hmr: {
        host: hmrHost,
        clientPort: port,
        protocol: hmrProtocol,
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
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
  };
});
