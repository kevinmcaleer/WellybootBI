// Visuals' queries through runQuery on real DuckDB-WASM: cached, cancelled when superseded, and capped.
import type { ColumnSchema, Query } from '@wellyboot/shared';
import { EngineClient, isCancelled } from '../../src/engine';
import { QueryCache, runQuery } from '../../src/queries/run';
import { createNodeBackend } from '../helpers/nodeBackend';
import { createSales, SALES_ID } from '../helpers/sales';

let engine: EngineClient;
let SALES: ColumnSchema[];

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend());
  SALES = await createSales(engine);
});
afterAll(() => engine.close());

const query = (q: Partial<Query> = {}): Query => ({ datasetId: SALES_ID, groups: [{ field: 'Region' }], measures: [{ aggregate: 'sum', field: 'units' }], filters: [], sort: [], ...q });
const opts = { datasetVersion: 'v1' };

describe('runQuery on the engine', () => {
  it('runs a visual’s query, with its rows typed for charts', async () => {
    const run = await runQuery(engine, query({ sort: [{ by: 'measure', index: 0, dir: 'desc' }], limit: { n: 2, others: false } }), SALES, opts, new QueryCache());
    expect(run.rows).toEqual([
      { Region: null, 'Sum of units': 19 },
      { Region: 'South', 'Sum of units': 12 },
    ]);
  });

  it('cancels the one in flight when the same visual runs a new query', async () => {
    const cache = new QueryCache();
    const first = runQuery(engine, query(), SALES, { ...opts, visualId: 'chart' }, cache);
    const second = runQuery(engine, query({ filters: [{ field: 'units', op: '>', value: 5 }] }), SALES, { ...opts, visualId: 'chart' }, cache);
    await expect(first).rejects.toSatisfy(isCancelled);
    expect((await second).rows.map((r) => r.Region)).toEqual(['East', "O'Brien's", 'West', null]);
  });

  it('returns the cached result object for the same SQL and dataset version', async () => {
    const cache = new QueryCache();
    const a = await runQuery(engine, query(), SALES, opts, cache);
    expect(await runQuery(engine, query(), SALES, opts, cache)).toBe(a);
  });

  it('shows at most the row limit and says so', async () => {
    const run = await runQuery(engine, query(), SALES, { ...opts, rowLimit: 4 }, new QueryCache());
    expect(run.rows).toHaveLength(4);
    expect(run.notice).toBe('Showing the first 4 rows');
    const all = await runQuery(engine, query(), SALES, { ...opts, rowLimit: 6 }, new QueryCache());
    expect([all.rows.length, all.truncated]).toEqual([6, false]);
  });
});
