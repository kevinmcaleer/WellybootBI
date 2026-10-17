/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation, as in Puddle: DuckDB-WASM's multi-threaded `coi` bundle needs it, so the headers are on
// from the start and the bundle can come later without a hosting change. Production sets the same headers in
// deploy/wellyboot-headers.inc.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * The isolation headers on every response of the dev and preview servers, 304s included. Vite's own `headers`
 * option leaves them off a 304, and Safari then refuses a worker it revalidated.
 */
function isolation(): Plugin {
  const set: Connect.NextHandleFunction = (_req, res, next) => {
    for (const [name, value] of Object.entries(isolationHeaders)) res.setHeader(name, value);
    next();
  };
  return {
    name: 'wellyboot-isolation',
    configureServer: (server) => void server.middlewares.use(set),
    configurePreviewServer: (server) => void server.middlewares.use(set),
  };
}

/** Test files that set their own environment or mock modules or globals, so they must not share a registry. */
const ISOLATED = ['src/ui/locale.test.ts'];

export default defineConfig({
  plugins: [react(), isolation()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { target: 'es2022' },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    // As in Puddle: pure and engine tests share one module registry per worker (--no-isolate); component tests
    // (every .tsx test) and the files listed in ISOLATED get a fresh one. package.json runs the two in turn.
    projects: [
      {
        extends: true,
        test: { name: 'isolated', include: ['src/**/*.test.tsx', ...ISOLATED] },
      },
      {
        extends: true,
        test: { name: 'shared', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], exclude: ['**/node_modules/**', ...ISOLATED] },
      },
    ],
  },
});
