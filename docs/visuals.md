# Building a chart

Phase 4's editor builds one chart at a time over one dataset: a bar, a line or a pie. Open the editor, pick a dataset in **Data sources** (or add one), and choose **Chart this dataset**. The chart is drawn as soon as its wells hold enough, and drawn again a moment after each change.

## The screen

- **Fields**, on the left: the dataset's fields, grouped as numbers, text, dates and times, and true or false, with **Number of rows** first for counting rows. Search narrows the list.
- **The chart**, in the middle, with a **Data** tab showing the rows it was drawn from. Check a chart against its data there.
- **The inspector**, on the right: the chart type, the wells, sorting and the top rows on **Fields**, and the title, labels, legend, numbers and colours on **Format**.
- **The status strip**, at the bottom: how many rows the chart's query returned and how long DuckDB took.

## Wells

Drag a field into a well, or open its menu (Enter or Space on a focused field) and choose **Add to Axis** and so on: everything works from the keyboard. A chip's name opens a menu to move it up, down, to another well, or remove it.

| Chart | Axis or Legend (the categories) | Values | Legend (a series each) | Tooltips |
|---|---|---|---|---|
| Bar | Axis: any field | one or more; with a series, one | any field | extra values on hover |
| Line | Axis: a date or a number | one or more; with a series, one | any field, a line each | extra values on hover |
| Pie | Legend: any field, a slice each | one | none | extra values on hover |

- A number added to **Values** is summed; any other field is counted. The tag on the chip changes it: sum, average, median, min, max, count or count distinct, whichever fit the field.
- A date added to an axis is grouped by month, and by year when it's the legend; the tag on the chip changes it.
- A field that doesn't fit a well is refused with a sentence saying why, such as "Axis needs a date or a number; Region is text".
- **Filters** keep only some rows. Drop a field there, or choose **Add to Filters**, then pick a condition that suits the field and its values; common values are suggested from the dataset's profile.

A pie shows at most **Most slices** slices (8 by default), biggest first; the rest are summed as **Others**.

## Switching chart type

The **Chart** menu switches between bar, line and pie and keeps every field that fits. What doesn't fit is dropped, and a note above the chart says what: "A line chart's axis needs a date or a number, so Region was dropped." Undo brings it back.

## Undo and redo

Every change can be undone with **Undo** (Ctrl+Z, or Cmd+Z on a Mac) and redone with **Redo** (Ctrl+Shift+Z or Ctrl+Y). Typing in a box, such as the title or a filter's value, is undone as one change.

## Export

**Export** downloads the chart as a PNG (at twice its size on screen, so it stays sharp on a slide) or an SVG, named after its title, or copies the SQL its rows came from, to run in Puddle or DuckDB.

## How a chart is drawn

A chart's query runs on DuckDB in your browser, through the same compiler every visual uses (see [How charts ask for their data](queries.md)). Its rows are turned into a [Vega-Lite](https://vega.github.io/vega-lite/) spec (`apps/web/src/compiler/chart/`) that only draws them: the summing, grouping and sorting are already done. The spec's colours, fonts and sizes come from Puddle's design-system tokens, in light and dark.

Charts aren't saved yet: Phase 5 puts several on a dashboard and saves them in the `.wellyboot.json` file.
