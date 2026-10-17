# UI components (ported from Puddle)

The design system's React components, copied from Puddle's `src/ui/` at commit `c1b4816` so both apps share them. Keep them as close to Puddle's as possible so updates can be re-copied; record the commit here when you do.

Copied unchanged: `Banner`, `Button`, `cx`, `Dialog`, `Field`, `format`, `locale`, `Icon`, `columnKind`, `announce`, `LiveRegion`, `Menu`, `menuGroups`, `Toolbar`, `StatusBadge`, and their tests.

Changed: `StatusStrip.tsx` is Puddle's `StatusStrip` from `ResultsBar.tsx` without rule results, sample mode, kept results and sync state, which only Puddle has.
