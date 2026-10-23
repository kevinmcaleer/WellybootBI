// A chart over 100,000 rows on real DuckDB-WASM: the query and the chart compiler together stay well inside what an
// edit should take, and the points come out summed, ordered and complete.
import { VisualZ, type ColumnSchema } from '@wellyboot/shared';
import { compileChart } from '../../src/compiler/chart';
import { EngineClient } from '../../src/engine';
import { QueryCache, runQuery } from '../../src/queries/run';
import { effectiveQuery } from '../../src/visuals/encode';
import { createNodeBackend } from '../helpers/nodeBackend';

const ID = 'bigsales01';
const ROWS = 100_000;
const SCHEMA: ColumnSchema[] = [
  { name: 'Date', type: 'DATE' },
  { name: 'Region', type: 'VARCHAR' },
  { name: 'Sales', type: 'DOUBLE' },
];
/** Edits must feel live: a query and its chart inside this, on a warm engine. */
const BUDGET_MS = 300;

let engine: EngineClient;
beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend());
  // Test setup only: datasets are normally registered through src/datasets/register.ts.
  await engine.query(`CREATE TABLE "ds_${ID}" AS SELECT DATE '2026-01-01' + CAST(i % 365 AS INTEGER) AS "Date",
    ['North', 'South', 'East', 'West'][(i % 4) + 1] AS "Region", CAST(i % 100 AS DOUBLE) AS "Sales" FROM range(${ROWS}) t(i)`);
}, 30_000);
afterAll(() => engine.close());

const lineByMonth = VisualZ.parse({
  id: 'visual01',
  name: 'Sales by month',
  datasetId: ID,
  query: { datasetId: ID, groups: [{ field: 'Date', bucket: { kind: 'date', unit: 'month' } }, { field: 'Region' }], measures: [{ field: 'Sales', aggregate: 'sum' }] },
  chart: { type: 'line', encoding: { category: 0, series: 1, values: [0] } },
});

describe('a chart over 100,000 rows', () => {
  it('queries and compiles a line by month and region inside the budget', async () => {
    const opts = { datasetVersion: 'v1' };
    await runQuery(engine, effectiveQuery(lineByMonth), SCHEMA, opts, new QueryCache());
    const start = performance.now();
    const run = await runQuery(engine, effectiveQuery(lineByMonth), SCHEMA, opts, new QueryCache());
    const spec = compileChart(lineByMonth, run, { mode: 'light' }) as { data: { values: { series: string; value: number; at: number }[] } };
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(BUDGET_MS);

    const points = spec.data.values;
    expect(points).toHaveLength(12 * 4);
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(Array.from({ length: ROWS }, (_, i) => i % 100).reduce((a, b) => a + b, 0));
    const north = points.filter((p) => p.series === 'North').map((p) => p.at);
    expect(north).toEqual([...north].sort((a, b) => a - b));
  });
});
