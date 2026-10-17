# Design system (vendored)

Copied byte for byte from Puddle's `src/design-system/` at commit `c46582d3fba2b389306ebf0e02c5a82f0bc7246c` (https://github.com/kevinmcaleer/puddle/tree/c46582d3fba2b389306ebf0e02c5a82f0bc7246c/src/design-system), so Wellyboot BI and Puddle look like one family.

Don't hand-edit these files. To update, re-copy them from Puddle and record the new commit here.

| File | Source |
|---|---|
| `tokens.css`, `tokens.json`, `tailwind.preset.js` | Generated upstream by Puddle's design system from `tokens.json` |
| `components.css` | The design system's component styles |
| `fonts.css` | Registers the self-hosted faces under the names the tokens use |
| `contrast.test.ts` | WCAG 2.2 AA contrast for the token pairs, in both themes |
