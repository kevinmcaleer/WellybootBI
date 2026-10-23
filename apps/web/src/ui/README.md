# UI components (ported from Puddle)

The design system's React components, copied from Puddle's `src/ui/` at commit `ccb58c4` so both apps share them. Keep them as close to Puddle's as possible so updates can be re-copied. The unchanged ones are pinned in `design-system.lock.json` with the design system and re-copied by `npm run design-system -- sync <puddle-checkout>`; record the commit here when you do.

Copied unchanged: `Banner`, `Button`, `cx`, `Dialog`, `Field`, `format`, `locale`, `Icon`, `columnKind`, `announce`, `LiveRegion`, `Menu`, `menuGroups`, `Toolbar`, `StatusBadge`, `TypeTag` and `QualityBar` (the data source picker's field list), `Section` and `Tabs` (the chart editor's inspector and its Chart and Data tabs), `Pivot` (`FieldChip` and `PivotZone`, the chart editor's wells) and `glideTheme` (the chart editor's data view), and their tests.

Ported, not vendored: `src/powertools/` (the switcher to Kev's other Power Tools) is Puddle's, with this app as the current one.

Changed: `StatusStrip.tsx` is Puddle's `StatusStrip` from `ResultsBar.tsx` without rule results, sample mode, kept results and sync state, which only Puddle has.

Not ported yet, because nothing in Wellyboot BI needs them so far: `ContextMenu`, `SchemaPopover`, `StepList`, `RuleRow`. Port them from Puddle, with their tests, when a screen does, rather than building new ones. `Node`, `wire`, `nodeKinds` and `undo` belong to Puddle's pipeline canvas. Puddle's undo history (`src/model/history.ts`) is copied as `src/model/history.ts` for the chart editor.

The chart editor's wells drag and drop as Puddle's pivot editor does (`src/steps/PivotEditor.tsx`): native drag events, and a menu on every field and chip to do the same by keyboard.
