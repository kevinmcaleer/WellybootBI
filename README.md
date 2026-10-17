# Wellyboot BI

An open source business intelligence tool for data curated in [Puddle](https://github.com/kevinmcaleer/puddle). Load a dataset Puddle exported, drag fields into bar, line and pie charts, arrange them on a dashboard, and share it with a link or embed a chart in a web page. Queries run in your browser on DuckDB-WASM.

Nothing leaves your browser until you publish.

Work in progress: the plan is in the [epic](https://github.com/kevinmcaleer/WellybootBI/issues/11).

## Development

Needs Node 22 or later.

```sh
npm install
npm run dev          # the web app on http://localhost:5173
npm run dev:server   # the server on http://localhost:8787
npm run lint
npm run typecheck
npm test             # every workspace's unit tests, plus engine tests on real DuckDB-WASM (Node build)
npm run e2e          # Playwright against a production build (run `npx playwright install chromium` in apps/web once)
npm run build
npm run fetch-extensions -w @wellyboot/web  # optional: serve DuckDB's json and parquet extensions locally
```

## Tests

Every feature ships with its own tests, and every bug fix with a regression test. `npm test` runs each workspace's Vitest suite: in the web app, pure and engine tests share one module registry per worker and component tests run isolated, as in Puddle (`apps/web/vite.config.ts` lists which is which). CI (`.github/workflows/ci.yml`) runs lint, typecheck and the unit tests, the Playwright suite in Chromium, Firefox and WebKit, and builds both images for amd64 and arm64 and smoke-tests them (`scripts/smoke-test.sh`).

## Running it with Docker

```sh
docker compose up -d --build
```

Then open <http://localhost:8090>. The server answers on <http://localhost:8787/healthz>. Copy `.env.example` to `.env` to change ports or add the Cloudflare Tunnel's token. See [deploy/README.md](deploy/README.md).

## Why a monorepo

Puddle is one package because it is browser-only. Wellyboot BI also has a small server for publishing, share links and embeds, and the browser and the server must agree on the shape of datasets, queries and dashboards. So it is an npm workspaces monorepo, with those schemas in one shared package that both apps import.

## Layout

| Path | What lives there |
|---|---|
| `packages/shared/` | Zod schemas shared by the web app and the server, the `.wellyboot.json` format version and its migrations |
| `apps/web/` | The Wellyboot BI web app (Vite, React, TypeScript), local-first on DuckDB-WASM |
| `apps/web/src/design-system/` | Tokens, Tailwind preset and component CSS, vendored from Puddle; `design-system.lock.json` pins it and `npm run design-system -- check\|sync <puddle-checkout>` compares or re-copies it |
| `apps/web/src/ui/` | The design system's components in TypeScript (`Button`, `Dialog`, `Menu`, `Field`, `Toolbar`, `StatusStrip` and the rest), ported from Puddle, and how numbers and dates are shown (`locale.ts`, `format.ts`) |
| `apps/web/src/app/` | The app shell: toolbar, screens and hash routes, status strip, theme, engine boot, keyboard shortcuts |
| `apps/web/src/engine/` | DuckDB-WASM in a Web Worker and the typed `EngineClient` (priorities, cancellation, Stop, plain-word errors), ported from Puddle |
| `apps/web/src/compiler/` | The only place SQL is written; identifiers and literals are quoted through `sql.ts` |
| `apps/web/src/home/` | The dashboards home screen |
| `apps/web/src/editor/` | The dashboard editor: canvas and inspector |
| `apps/web/tests/` | Engine integration tests on the Node build of DuckDB-WASM, fixtures and helpers |
| `apps/web/e2e/` | Playwright tests, with axe for accessibility |
| `apps/web/scripts/` | `fetch-duckdb-extensions.mjs`: DuckDB's json and parquet extensions for the build to serve |
| `apps/server/` | The Wellyboot BI server (Node, Hono): for now only `GET /healthz`; publishing, share links and embeds come in later phases |
| `deploy/` | nginx config and headers for the web image, and how to run and deploy the stack |
| `scripts/smoke-test.sh` | Checks a running stack: isolation headers, health checks, self-hosted extensions |
| `Dockerfile`, `apps/server/Dockerfile`, `compose.yaml` | The web and server images, and the stack that runs them |

## Licence

MIT
