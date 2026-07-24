/**
 * Browser-safe replacement for nucleation's `diplomat.config.mjs`.
 *
 * The published file computes `wasm_path` with `node:url`/`node:path`
 * (`path.join(path.dirname(fileURLToPath(import.meta.url)), "nucleation.wasm")`),
 * which is correct for Node but (a) fails to bundle for the browser — Vite
 * externalizes `node:url`/`node:path` for browser targets, and Rollup then
 * can't find `fileURLToPath` on the externalized stub — and (b) even if it
 * bundled, would evaluate to a filesystem path, not a fetchable URL.
 *
 * This shim is aliased in place of that file (see vite.config.ts) and instead
 * uses the `new URL(relative, import.meta.url)` pattern Vite recognizes
 * statically: it rebases and copies `nucleation.wasm` into the build output
 * with content hashing, and rewrites this reference to the correct built URL
 * (and just resolves relative to this file on disk in dev).
 */
export default {
  wasm_path: new URL('../node_modules/nucleation/nucleation.wasm', import.meta.url).href,
};
