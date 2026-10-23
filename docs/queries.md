# How charts ask for their data

Every chart, table and card in Wellyboot BI asks its dataset one question, a **query**: which fields to group by, what to summarise, which rows to keep, how to sort and how many to show. A query is saved with the dashboard (its shape is `QueryZ` in `packages/shared/src/query.ts`), and the web app turns it into one DuckDB `SELECT` that runs in your browser. Phase 4's field wells build queries; this page says what they can ask.

## One dataset per visual

A query reads one dataset. Wellyboot BI doesn't join datasets: do the joining in Puddle, where the data is cleaned, and export the joined table. A dashboard can still show several datasets, one per visual.

## Groups

Group by any field. Each distinct value becomes a row (or a bar, a point, a slice).

- **Dates** can be bucketed by year, quarter, month, week (starting on Monday), day, or, for a date and time, hour. A month bucket gives one row per month, dated its first day.
- **Numbers** can be put into bins of a width you choose: with a width of 10, the values 0 to 9.99 make one row, starting at 0, then 10 to 19.99, and so on.
- Rows with no value make a group of their own, shown as **Empty** and sorted last.

Times with a time zone are bucketed in UTC.

## Summaries

| Summary | Fits | Comes back as |
|---|---|---|
| Sum | numbers | a whole number for whole numbers, otherwise a decimal |
| Average, Median | numbers | a decimal |
| Min, Max | anything that has an order: numbers, text, dates | the field's own type |
| Count | any field (its values that aren't empty), or the rows | a whole number |
| Count distinct | any field | a whole number |

A summary that doesn't fit its field is refused before anything runs, in plain words: "Sum needs a number; Region is text".

## Filters

A query's filters all hold at once. Dashboard filters and slicers are added to the same list.

- Compare: equals, isn't, less than, at most, more than, at least, between, and in a list of values.
- Text (any field, read as text, ignoring case): contains, starts with, ends with.
- Is empty and isn't empty (text of only spaces counts as empty).
- Relative dates, which move with today:
  - **Last n days, weeks, months, quarters or years**: the n whole units before the current one. On 14 March 2026, last 1 month is February, and last 30 days is 12 February to 13 March.
  - **This week, month, quarter or year**: the whole current unit.
  - **Week, month, quarter or year to date**: the current unit up to and including today.

## Sort and top N

Sort by any group or summary, ascending or descending. Rows that tie are always put in the same order, by their groups, so a chart doesn't reshuffle between redraws.

A query can keep only its first n rows (top 5 regions by sales). With **others**, every other row is summarised as one more row at the end, so the six rows of a top 5 still add up to the total. The others row's average, median and distinct count are worked out over its own rows. It is marked by the `__others` column, and is left out when there is nothing left over.

## Running a query

- A visual shows at most **10,000 rows**. Past that, the first 10,000 are shown with a note saying so, so a line over a million-row group never freezes the tab.
- Results are kept for as long as the tab is open, by the query's SQL and the dataset's version, so redrawing a dashboard runs nothing twice. Replacing a dataset with a newer export changes its version.
- When a visual asks again before its last query finished (you're still typing in a filter), the earlier query is cancelled.
- Each column carries how it is written: decimals from its type (a `DECIMAL(18,2)` sum keeps two places, counts none), dates by their bucket (Mar 2026, Q1 2026, Week of 02/03/2026), and percentages for a summary marked as one. Numbers and dates are written in your display locale.

## For developers

- `compileQuery(query, schema, { extraFilters, today, maxRows })` in `apps/web/src/compiler/query.ts` writes the SQL; the comment at its top shows the SELECT's shape, and `compileTopN` the shape of a top N with others. `describeQuery` gives the result's columns and DuckDB types without running it.
- `checkQuery` (`compiler/check.ts`) lists every problem with a query, each pointing at the part it is in; `compileQuery` throws them as a `CompileError`.
- `runQuery(engine, query, schema, { datasetVersion, visualId, rowLimit })` in `apps/web/src/queries/run.ts` runs it. In the browser, `window.__wellyboot.runQuery(query)` runs one over a dataset in the library.
- `queries/format.ts` gives each result column a formatting hint, and `formatCell` writes a value with it.
- SQL is written only in `apps/web/src/compiler/` and quoted through its `sql.ts`; a test fails on SQL built anywhere else.
- Calculated fields will go in the query's reserved `expressions` slot, so they can arrive without changing the saved format.
