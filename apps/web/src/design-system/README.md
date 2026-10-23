# Design system (vendored)

Copied byte for byte from Puddle's `src/design-system/` at commit `ccb58c468fd2d6bc26512c780d6a3bc3b3a5e016` (https://github.com/kevinmcaleer/puddle/tree/ccb58c468fd2d6bc26512c780d6a3bc3b3a5e016/src/design-system), so Wellyboot BI and Puddle look like one family.

Don't hand-edit these files. `design-system.lock.json` records each one's hash, and `tests/design-system.test.ts` fails if a file stops matching. To update, run `npm run design-system -- sync <puddle-checkout>` from `apps/web`, which re-copies the files, rewrites the lock and prints what changed, then record the new commit here and in `src/ui/README.md`.

| File | Source |
|---|---|
| `tokens.css`, `tokens.json`, `tailwind.preset.js` | Generated upstream by Puddle's design system from `tokens.json` |
| `components.css` | The design system's component styles |
| `fonts.css` | Registers the self-hosted faces under the names the tokens use |
| `contrast.test.ts` | WCAG 2.2 AA contrast for the token pairs, in both themes |
