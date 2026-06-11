import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ command }) => {
    // Common configuration for both serve and build
    const commonConfig = {
        define: {
            'process.env': {},
            'global': 'globalThis',
        },
        plugins: [
            viteCommonjs(),
            // These plugins are fine, but they won't handle the pre-packaged `nucleation` module.
            wasm(),
            topLevelAwait()
        ],
    };

    if (command === 'serve') {
        // --- CONFIGURATION FOR THE DEVELOPMENT SERVER ---
        return {
            ...commonConfig,
            root: './dev-frontend',
            server: {
                open: true,
            },
            // This is the key to fixing the 404 / "magic word" error in development.
            optimizeDeps: {
                exclude: [
                    'nucleation' // Tell Vite not to pre-bundle this package.
                ]
            }
        };
    } else {
        // --- CONFIGURATION FOR THE PRODUCTION BUILD ---
        return {
            ...commonConfig,
            build: {
                outDir: 'dist',
                lib: {
                    entry: resolve('./src/index.ts'),
                    name: 'Synthase',
                    fileName: (format) => `synthase.${format}.js`,
                    formats: ['es', 'umd']
                },
                sourcemap: true,
                // Your existing Rollup options for making `nucleation` an external peer dependency
                // in your final library build are correct for that purpose.
                rollupOptions: {
                    external: (id) => {
                        return id.startsWith('nucleation');
                    },
                    output: {
                        globals: {
                            'nucleation': 'Nucleation'
                        }
                    }
                }
            }
        };
    }
});