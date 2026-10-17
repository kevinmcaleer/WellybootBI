# Wellyboot BI

Charts and dashboards over Puddle data, on DuckDB-WASM in the browser. An npm workspaces monorepo: `apps/web` (the app), `apps/server` (publishing, share links and embeds), `packages/shared` (Zod schemas both use). See README.md for layout and commands. Puddle (`kevinmcaleer/puddle`) is the sibling app and the reference for tooling, the design system and the engine.

## Tests are part of every change

- Every feature ships its own tests: unit tests next to the code (`**/*.test.ts`), engine tests on real DuckDB-WASM, and a Playwright test of the user-facing flow.
- Every bug fix adds a regression test that fails without the fix.
- Never skip, delete or weaken an existing test to get CI green; fix the cause.
- Before pushing, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run e2e`. CI runs the same on every pull request.

## Conventions

- All UI uses Puddle's design system, so the two apps look like one family. Build screens from the components in `apps/web/src/ui/` and style them with the design-system tokens (Tailwind classes from `tailwind.preset.js` or the CSS variables in `tokens.css`): no raw colours, Tailwind palette colours, type sizes, or spacing, radii and shadows off the token scale. Sentence case; no emoji. `apps/web/tests/design-system.test.ts` enforces this.
- When a screen needs a component Puddle already has (tabs, context menu, type tags, field chips and so on), port Puddle's rather than writing a new one, and list it in `apps/web/src/ui/README.md`. A component Puddle doesn't have is built from the tokens and existing components, never new one-off styles.
- The design system and the components copied from Puddle unchanged are vendored: don't hand-edit them. `apps/web/design-system.lock.json` pins their hashes; update them with `npm run design-system -- sync <puddle-checkout>` from `apps/web`.
- SQL is generated only in `apps/web/src/compiler/`; quote through its `sql.ts`.
- Schemas that the browser and the server both read live in `packages/shared`, never copied into an app.
- A change to the `.wellyboot.json` shape raises `FORMAT_VERSION` and adds a migration.
- Pin Playwright and Vitest exactly; other dependencies take caret ranges.
