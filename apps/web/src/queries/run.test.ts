import type { ColumnSchema, Query } from '@wellyboot/shared';
import { tableFromArrays, type Table } from 'apache-arrow';
import { CompileError } from '../compiler/errors';
import { EngineError, isCancelled, type QueryOptions, type QueryResult } from '../engine';
import { QueryCache, datasetVersion, runQuery, type QueryEngine } from './run';

const SCHEMA: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'units', type: 'BIGINT' },
];
const query = (q: Partial<Query> = {}): Query => ({ datasetId: 'a1b2c3d4e5f6', groups: [{ field: 'Region' }], measures: [{ aggregate: 'sum', field: 'units' }], filters: [], sort: [], ...q });

/** An engine that answers every query with `rows` regions, and can hold a query until it is released or cancelled. */
class FakeEngine implements QueryEngine {
  calls: Array<{ sql: string; opts?: QueryOptions }> = [];
  hold = false;
  private waiting: Array<() => void> = [];

  constructor(private rows = 3) {}

  query(sql: string, opts?: QueryOptions): Promise<QueryResult> {
    this.calls.push({ sql, opts });
    const table: Table = tableFromArrays({
      Region: Array.from({ length: this.rows }, (_, i) => `R${i}`),
      'Sum of units': BigInt64Array.from({ length: this.rows }, (_, i) => BigInt(i)),
    });
    const result = { table, numRows: table.numRows, columns: [], elapsedMs: 4 };
    if (!this.hold) return Promise.resolve(result);
    return new Promise((resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new EngineError('cancelled', 'The query was replaced by a newer one.')));
      this.waiting.push(() => resolve(result));
    });
  }

  release() {
    for (const go of this.waiting.splice(0)) go();
  }
}

const version = datasetVersion({ id: 'a1b2c3d4e5f6', headHash: 'a'.repeat(64), updatedAt: '2026-10-18T09:00:00.000Z' });

describe('runQuery', () => {
  it('returns rows with BIGINTs as numbers, columns with formatting hints, and the time taken', async () => {
    const run = await runQuery(new FakeEngine(), query(), SCHEMA, { datasetVersion: version }, new QueryCache());
    expect(run.rows).toEqual([
      { Region: 'R0', 'Sum of units': 0 },
      { Region: 'R1', 'Sum of units': 1 },
      { Region: 'R2', 'Sum of units': 2 },
    ]);
    expect(run.columns.map((c) => [c.name, c.type, c.hint])).toEqual([
      ['Region', 'VARCHAR', { kind: 'text' }],
      ['Sum of units', 'BIGINT', { kind: 'number', decimals: 0 }],
    ]);
    expect([run.truncated, run.notice, run.elapsedMs]).toEqual([false, undefined, 4]);
  });

  it('runs at preview priority and asks for one row more than the row limit', async () => {
    const engine = new FakeEngine();
    await runQuery(engine, query(), SCHEMA, { datasetVersion: version, rowLimit: 50 }, new QueryCache());
    expect(engine.calls[0]!.sql).toMatch(/ LIMIT 51$/);
    expect(engine.calls[0]!.opts?.priority).toBe('preview');
  });

  it('cuts the rows at the row limit and says so', async () => {
    const run = await runQuery(new FakeEngine(4), query(), SCHEMA, { datasetVersion: version, rowLimit: 3 }, new QueryCache());
    expect(run.rows).toHaveLength(3);
    expect([run.truncated, run.notice]).toEqual([true, 'Showing the first 3 rows']);
  });

  it('returns the same result object for the same SQL and dataset version, without running it again', async () => {
    const engine = new FakeEngine();
    const cache = new QueryCache();
    const a = await runQuery(engine, query(), SCHEMA, { datasetVersion: version, visualId: 'v1' }, cache);
    const b = await runQuery(engine, query(), SCHEMA, { datasetVersion: version, visualId: 'v2' }, cache);
    expect(b).toBe(a);
    expect(engine.calls).toHaveLength(1);
    const c = await runQuery(engine, query(), SCHEMA, { datasetVersion: `${version}x` }, cache);
    expect(c).not.toBe(a);
    expect(engine.calls).toHaveLength(2);
  });

  it('cancels a visual’s query in flight when it asks again', async () => {
    const engine = new FakeEngine();
    engine.hold = true;
    const cache = new QueryCache();
    const first = runQuery(engine, query(), SCHEMA, { datasetVersion: version, visualId: 'v1' }, cache);
    const other = runQuery(engine, query({ limit: { n: 2, others: false } }), SCHEMA, { datasetVersion: version, visualId: 'v2' }, cache);
    const second = runQuery(engine, query({ sort: [{ by: 'measure', index: 0, dir: 'desc' }] }), SCHEMA, { datasetVersion: version, visualId: 'v1' }, cache);
    await expect(first).rejects.toSatisfy(isCancelled);
    engine.release();
    await expect(second).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(other).resolves.toMatchObject({ rows: expect.any(Array) });
    // A cancelled query leaves nothing in the cache.
    expect(cache.size).toBe(2);
  });

  it('cancels when the caller’s signal aborts', async () => {
    const engine = new FakeEngine();
    engine.hold = true;
    const stop = new AbortController();
    const run = runQuery(engine, query(), SCHEMA, { datasetVersion: version, signal: stop.signal }, new QueryCache());
    stop.abort();
    await expect(run).rejects.toSatisfy(isCancelled);
  });

  it('refuses a query that doesn’t fit before reaching the engine', async () => {
    const engine = new FakeEngine();
    await expect(runQuery(engine, query({ measures: [{ aggregate: 'sum', field: 'Region' }] }), SCHEMA, { datasetVersion: version }, new QueryCache())).rejects.toThrow(
      new CompileError([{ part: 'measure', index: 0, field: 'Region', message: 'Sum needs a number; Region is text' }]),
    );
    expect(engine.calls).toHaveLength(0);
  });
});

describe('QueryCache', () => {
  it('drops the least recently used result past its size', () => {
    const cache = new QueryCache(2);
    const run = (sql: string) => ({ sql, columns: [], rows: [], truncated: false, rowLimit: 1, elapsedMs: 0 });
    cache.set('a', run('a'));
    cache.set('b', run('b'));
    cache.get('a');
    cache.set('c', run('c'));
    expect([cache.get('a')?.sql, cache.get('b'), cache.get('c')?.sql]).toEqual(['a', undefined, 'c']);
  });
});
