# Wellyboot BI

Charts and dashboards over Puddle data, on DuckDB-WASM in the browser. An npm workspaces monorepo: `apps/web` (the app), `apps/server` (publishing, share links and embeds), `packages/shared` (Zod schemas both use). See README.md for layout and commands. Puddle (`kevinmcaleer/puddle`) is the sibling app and the reference for tooling, the design system and the engine.

## Tests are part of every change

- Every feature ships its own tests: unit tests next to the code (`**/*.test.ts`), engine tests on real DuckDB-WASM, and a Playwright test of the user-facing flow.
- Every bug fix adds a regression test that fails without the fix.
- Never skip, delete or weaken an existing test to get CI green; fix the cause.
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run e2e`. CI runs the same on every pull request.

## Conventions

- Follow the design system in `apps/web/src/design-system/` and `apps/web/src/ui/`: tokens only, no hard-coded colours or sizes; sentence case; no emoji.
- The design system is vendored from Puddle: don't hand-edit it, re-copy it from Puddle.
- SQL is generated only in `apps/web/src/compiler/`; quote through its `sql.ts`.
- Schemas that the browser and the server both read live in `packages/shared`, never copied into an app.
- A change to the `.wellyboot.json` shape raises `FORMAT_VERSION` and adds a migration.
- Pin Playwright and Vitest exactly; other dependencies take caret ranges.
