# Wellyboot BI

An open source business intelligence tool for data curated in [Puddle](https://github.com/kevinmcaleer/puddle). Load a dataset Puddle exported, drag fields into bar, line and pie charts, arrange them on a dashboard, and share it with a link or embed a chart in a web page. Queries run in your browser on DuckDB-WASM.

Nothing leaves your browser until you publish.

Work in progress: the plan is in the [epic](https://github.com/kevinmcaleer/WellybootBI/issues/11).

## Development

Needs Node 22 or later.

```sh
npm install
npm run lint
npm run typecheck
npm test           # every workspace's unit tests
```

## Why a monorepo

Puddle is one package because it is browser-only. Wellyboot BI also has a small server for publishing, share links and embeds, and the browser and the server must agree on the shape of datasets, queries and dashboards. So it is an npm workspaces monorepo, with those schemas in one shared package that both apps import:

| Path | What lives there |
|---|---|
| `apps/web/` | The Wellyboot BI web app (Vite, React, TypeScript), local-first on DuckDB-WASM |
| `apps/server/` | The Wellyboot BI server (Node, Hono, SQLite): publishing, share links, embed tokens, dataset files |
| `packages/shared/` | Zod schemas shared by both apps, the `.wellyboot.json` format version and its migrations |

## Licence

MIT
