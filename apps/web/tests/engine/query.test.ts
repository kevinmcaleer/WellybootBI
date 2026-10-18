// The query compiler on real DuckDB-WASM (Node build): the SQL it writes runs, returns the columns describeQuery
// promised, and gives the results worked out by hand from the fixture below.
import type { ColumnSchema, Query, RelativeDate } from '@wellyboot/shared';
import { compileQuery, describeQuery, type QueryOptions } from '../../src/compiler/query';
import { EngineClient, tableRows } from '../../src/engine/client';
import { createNodeBackend } from '../helpers/nodeBackend';

/**
 * Ten sales, built with exact types (CSV sniffing can't give DECIMAL or TIMESTAMPTZ): two with no region, one with
 * no amount, a region name with quotes in it, and a column name with spaces and quotes.
 */
const SALES_ROWS = [
  // Region, amount, units, placed, at, paid, rep
  ['North', '10.50', 1, '2026-01-05', '2026-01-05 09:15:00', true, 'Ann'],
  ['North', '20.25', 2, '2026-01-20', '2026-01-20 09:45:00', false, 'Ann'],
  ['South', '5.00', 3, '2026-02-02', '2026-02-02 10:00:00', true, 'Bob'],
  ['South', '7.75', 4, '2026-02-14', '2026-02-14 10:30:00', true, 'Bob'],
  ['South', null, 5, '2026-02-28', '2026-02-28 23:59:59', false, 'Bob'],
  ['East', '100.00', 6, '2026-03-01', '2026-03-01 00:00:00', true, 'Cy'],
  ["O'Brien's", '1.00', 7, '2026-03-15', '2026-03-15 12:00:00', true, 'Dee'],
  ['West', '2.00', 8, '2026-04-10', '2026-04-10 12:00:00', false, 'Dee'],
  [null, '3.00', 9, '2026-04-11', '2026-04-11 12:00:00', true, 'Eve'],
  [null, '4.00', 10, '2026-05-01', '2026-05-01 12:00:00', false, 'Eve'],
] as const;

const SALES_ID = 'sales0001';

// Test setup only: datasets are normally registered through src/datasets/register.ts.
const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));
const COLUMNS = [
  ['Region', 'Region', 'VARCHAR'],
  ['amount', 'amount', 'DECIMAL(18,2)'],
  ['units', 'units', 'BIGINT'],
  ['placed', 'placed', 'DATE'],
  ['at', 'at', 'TIMESTAMP'],
  ['at', 'at_tz', 'TIMESTAMPTZ'],
  ['paid', 'paid', 'BOOLEAN'],
  ['rep', 'Sales "rep" name', 'VARCHAR'],
] as const;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CREATE_SALES = `CREATE OR REPLACE TABLE "ds_${SALES_ID}" AS SELECT ${COLUMNS.map(([from, to, type]) => `CAST(${q(from)} AS ${type}) AS ${q(to)}`).join(', ')}
  FROM (VALUES ${SALES_ROWS.map((r) => `(${r.map(lit).join(', ')})`).join(', ')}) AS t("Region", "amount", "units", "placed", "at", "paid", "rep")`;

let engine: EngineClient;
let SALES: ColumnSchema[];

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend());
  await engine.query(CREATE_SALES);
  SALES = await engine.describe(`SELECT * FROM "ds_${SALES_ID}"`);
});
afterAll(() => engine.close());

const query = (q: Partial<Query>): Query => ({ datasetId: SALES_ID, groups: [], measures: [], filters: [], sort: [], ...q });

/** Run a query, check DuckDB's columns are the ones describeQuery promised, and return its rows. */
async function run(q: Partial<Query>, opts: QueryOptions = {}) {
  const full = query(q);
  const sql = compileQuery(full, SALES, opts);
  const described = describeQuery(full, SALES).map(({ name, type }) => ({ name, type }));
  expect(await engine.describe(sql)).toEqual(described);
  return tableRows((await engine.query(sql)).table);
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe('groups and measures', () => {
  it('sums, averages and counts by region, the empty region as its own group, last', async () => {
    expect(
      await run({
        groups: [{ field: 'Region' }],
        measures: [{ aggregate: 'sum', field: 'units' }, { aggregate: 'count' }, { aggregate: 'count', field: 'amount' }, { aggregate: 'avg', field: 'amount' }],
      }),
    ).toEqual([
      { Region: 'East', 'Sum of units': 6, Count: 1, 'Count of amount': 1, 'Average of amount': 100 },
      { Region: 'North', 'Sum of units': 3, Count: 2, 'Count of amount': 2, 'Average of amount': 15.375 },
      { Region: "O'Brien's", 'Sum of units': 7, Count: 1, 'Count of amount': 1, 'Average of amount': 1 },
      { Region: 'South', 'Sum of units': 12, Count: 3, 'Count of amount': 2, 'Average of amount': 6.375 },
      { Region: 'West', 'Sum of units': 8, Count: 1, 'Count of amount': 1, 'Average of amount': 2 },
      { Region: null, 'Sum of units': 19, Count: 2, 'Count of amount': 2, 'Average of amount': 3.5 },
    ]);
  });

  it('gives every aggregate over the whole dataset', async () => {
    expect(
      await run({
        measures: [
          { aggregate: 'sum', field: 'amount' },
          { aggregate: 'median', field: 'units' },
          { aggregate: 'min', field: 'amount' },
          { aggregate: 'max', field: 'placed' },
          { aggregate: 'min', field: 'Region' },
          { aggregate: 'countDistinct', field: 'Region' },
          { aggregate: 'countDistinct', field: 'paid' },
        ],
      }),
    ).toEqual([
      {
        'Sum of amount': 153.5,
        'Median of units': 5.5,
        'Min of amount': 1,
        'Max of placed': day('2026-05-01'),
        'Min of Region': 'East',
        'Count distinct of Region': 5,
        'Count distinct of paid': 2,
      },
    ]);
  });

  it('buckets dates by month: one DATE row per month, in order', async () => {
    const rows = await run({ groups: [{ field: 'placed', bucket: { kind: 'date', unit: 'month' } }], measures: [{ aggregate: 'count' }] });
    expect(rows).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((m, i) => ({ placed: day(m), Count: [2, 3, 2, 2, 1][i] })));
  });

  it.each([
    ['year', ['2026-01-01'], [10]],
    ['quarter', ['2026-01-01', '2026-04-01'], [7, 3]],
    ['week', ['2026-01-05', '2026-01-19', '2026-02-02', '2026-02-09', '2026-02-23', '2026-03-09', '2026-04-06', '2026-04-27'], [1, 1, 1, 1, 2, 1, 2, 1]],
  ] as const)('buckets dates by %s', async (unit, starts, counts) => {
    const rows = await run({ groups: [{ field: 'placed', bucket: { kind: 'date', unit } }], measures: [{ aggregate: 'count' }] });
    expect(rows).toEqual(starts.map((s, i) => ({ placed: day(s), Count: counts[i] })));
  });

  it('buckets timestamps by day and hour, time zone or not', async () => {
    const days = await run({ groups: [{ field: 'at', bucket: { kind: 'date', unit: 'day' } }], measures: [{ aggregate: 'count' }], limit: { n: 2, others: false } });
    expect(days).toEqual([{ at: day('2026-01-05'), Count: 1 }, { at: day('2026-01-20'), Count: 1 }]);
    const hours = await run({ groups: [{ field: 'at_tz', bucket: { kind: 'date', unit: 'hour' } }], measures: [{ aggregate: 'count' }], limit: { n: 1, others: false } });
    expect(hours).toEqual([{ at_tz: Date.parse('2026-01-05T09:00:00Z'), Count: 1 }]);
  });

  it('bins numbers: bin starts of the given width', async () => {
    const rows = await run({ groups: [{ field: 'units', bucket: { kind: 'bin', width: 4 } }], measures: [{ aggregate: 'count' }] });
    expect(rows).toEqual([{ units: 0, Count: 3 }, { units: 4, Count: 4 }, { units: 8, Count: 3 }]);
  });

  it('sorts by a measure, ties broken by the group, so the order never changes', async () => {
    const rows = await run({ groups: [{ field: 'Sales "rep" name' }], measures: [{ aggregate: 'count' }], sort: [{ by: 'measure', index: 0, dir: 'desc' }] });
    expect(rows.map((r) => [r['Sales "rep" name'], r.Count])).toEqual([['Bob', 3], ['Ann', 2], ['Dee', 2], ['Eve', 2], ['Cy', 1]]);
  });
});

describe('top N with others', () => {
  const byUnits = (n: number, measures: Query['measures'] = [{ aggregate: 'sum', field: 'units' }]): Partial<Query> => ({
    groups: [{ field: 'Region' }],
    measures,
    sort: [{ by: 'measure', index: 0, dir: 'desc' }],
    limit: { n, others: true },
  });

  it('returns six rows for the top 5, whose sums add up to the total', async () => {
    const rows = await run(byUnits(5));
    expect(rows.map((r) => [r.Region, r['Sum of units'], r.__others])).toEqual([
      [null, 19, false],
      ['South', 12, false],
      ['West', 8, false],
      ["O'Brien's", 7, false],
      ['East', 6, false],
      [null, 3, true],
    ]);
    const total = (await run({ measures: [{ aggregate: 'sum', field: 'units' }] }))[0]!['Sum of units'];
    expect(rows.reduce((t, r) => t + Number(r['Sum of units']), 0)).toBe(total);
  });

  it('takes the others row’s average and distinct count over its rows, not over the groups', async () => {
    const rows = await run(byUnits(2, [{ aggregate: 'sum', field: 'units' }, { aggregate: 'avg', field: 'amount' }, { aggregate: 'countDistinct', field: 'Sales "rep" name' }]));
    expect(rows).toEqual([
      { Region: null, 'Sum of units': 19, 'Average of amount': 3.5, 'Count distinct of Sales "rep" name': 1, __others: false },
      { Region: 'South', 'Sum of units': 12, 'Average of amount': 6.375, 'Count distinct of Sales "rep" name': 1, __others: false },
      { Region: null, 'Sum of units': 24, 'Average of amount': 26.75, 'Count distinct of Sales "rep" name': 3, __others: true },
    ]);
  });

  it('leaves out the others row when nothing is left over', async () => {
    expect((await run(byUnits(6))).map((r) => r.__others)).toEqual([false, false, false, false, false, false]);
  });

  it('breaks ties by the group, so the same top N comes back every time', async () => {
    const rows = await run({ groups: [{ field: 'Sales "rep" name' }], measures: [{ aggregate: 'count' }], sort: [{ by: 'measure', index: 0, dir: 'desc' }], limit: { n: 2, others: true } });
    expect(rows.map((r) => [r['Sales "rep" name'], r.Count, r.__others])).toEqual([['Bob', 3, false], ['Ann', 2, false], [null, 5, true]]);
  });

  it('works over two groups and a date bucket, honouring the row limit', async () => {
    const rows = await run(
      { groups: [{ field: 'placed', bucket: { kind: 'date', unit: 'month' } }, { field: 'paid' }], measures: [{ aggregate: 'count' }], limit: { n: 3, others: true } },
      { maxRows: 2 },
    );
    expect(rows).toEqual([
      { placed: day('2026-01-01'), paid: false, Count: 1, __others: false },
      { placed: day('2026-01-01'), paid: true, Count: 1, __others: false },
    ]);
  });
});

describe('filters', () => {
  const regions = async (filters: Query['filters']) => (await run({ groups: [{ field: 'Region' }], filters })).map((r) => r.Region);

  it.each([
    [[{ field: 'Region', op: '=', value: "O'Brien's" }], ["O'Brien's"]],
    [[{ field: 'Region', op: '<>', value: 'South' }], ['East', 'North', "O'Brien's", 'West']],
    [[{ field: 'units', op: '<', value: 3 }], ['North']],
    [[{ field: 'units', op: '<=', value: '3' }], ['North', 'South']],
    [[{ field: 'units', op: '>', value: 8 }], [null]],
    [[{ field: 'units', op: '>=', value: 8 }], ['West', null]],
    [[{ field: 'Region', op: 'contains', value: 'OR' }], ['North']],
    [[{ field: 'Region', op: 'starts', value: 's' }], ['South']],
    [[{ field: 'Region', op: 'ends', value: "'S" }], ["O'Brien's"]],
    [[{ field: 'Region', op: 'empty' }], [null]],
    [[{ field: 'amount', op: 'empty' }], ['South']],
    [[{ field: 'Region', op: 'notEmpty' }], ['East', 'North', "O'Brien's", 'South', 'West']],
    [[{ field: 'amount', op: 'between', from: 5, to: '10.5' }], ['North', 'South']],
    [[{ field: 'Region', op: 'in', values: ['East', 'West', 'Nowhere'] }], ['East', 'West']],
    [[{ field: 'Region', op: 'in', values: [] }], []],
    [[{ field: 'placed', op: '>=', value: '2026-04-01' }], ['West', null]],
    [[{ field: 'at', op: '<', value: '2026-01-20 09:45' }], ['North']],
    [[{ field: 'at_tz', op: '>=', value: '2026-05-01T12:00:00Z' }], [null]],
    [[{ field: 'paid', op: '=', value: false }, { field: 'units', op: '<', value: 6 }], ['North', 'South']],
  ] as const)('%j', async (filters, expected) => {
    expect(await regions(filters as unknown as Query['filters'])).toEqual(expected);
  });

  it('ANDs dashboard filters into the same WHERE', async () => {
    const rows = await run({ measures: [{ aggregate: 'count' }], filters: [{ field: 'paid', op: '=', value: true }] }, { extraFilters: [{ field: 'Region', op: '=', value: 'South' }] });
    expect(rows).toEqual([{ Count: 2 }]);
  });
});

describe('relative date filters, with the clock at 2026-03-01', () => {
  const count = async (field: string, range: RelativeDate, today = '2026-03-01') =>
    (await run({ measures: [{ aggregate: 'count' }], filters: [{ field, op: 'relative', range }] }, { today }))[0]!.Count;

  it.each<[RelativeDate, number, string]>([
    [{ kind: 'last', n: 1, unit: 'month' }, 3, 'February: the 2nd, 14th and 28th'],
    [{ kind: 'last', n: 30, unit: 'day' }, 3, '30 January to 28 February'],
    [{ kind: 'last', n: 2, unit: 'month' }, 5, 'January and February'],
    [{ kind: 'last', n: 1, unit: 'week' }, 0, '16 to 22 February'],
    [{ kind: 'this', unit: 'week' }, 2, 'Monday 23 February to Sunday 1 March'],
    [{ kind: 'this', unit: 'month' }, 2, 'March'],
    [{ kind: 'this', unit: 'quarter' }, 7, 'January to March'],
    [{ kind: 'last', n: 1, unit: 'quarter' }, 0, 'October to December 2025'],
    [{ kind: 'last', n: 1, unit: 'year' }, 0, '2025'],
    [{ kind: 'toDate', unit: 'year' }, 6, '1 January to 1 March'],
    [{ kind: 'toDate', unit: 'month' }, 1, '1 March'],
  ])('%j counts %i (%s)', async (range, expected) => {
    expect(await count('placed', range)).toBe(expected);
  });

  it('counts timestamps by their date, the last second of a month included', async () => {
    const range: RelativeDate = { kind: 'last', n: 1, unit: 'month' };
    expect(await count('at', range)).toBe(3);
    expect(await count('at_tz', range)).toBe(3);
  });

  it('crosses a year boundary', async () => {
    expect(await count('placed', { kind: 'last', n: 1, unit: 'year' }, '2027-01-15')).toBe(10);
    expect(await count('placed', { kind: 'last', n: 1, unit: 'month' }, '2026-06-01')).toBe(1);
  });
});

describe('quoting', () => {
  it('runs a column name with spaces and quotes, a unicode name and a quoted value', async () => {
    const rows = await run({
      groups: [{ field: 'Sales "rep" name', as: 'Représentant « vente » 売上' }],
      measures: [{ aggregate: 'count', as: "Ventes d'été" }],
      filters: [{ field: 'Region', op: 'in', values: ["O'Brien's", 'East'] }],
    });
    expect(rows).toEqual([
      { 'Représentant « vente » 売上': 'Cy', "Ventes d'été": 1 },
      { 'Représentant « vente » 売上': 'Dee', "Ventes d'été": 1 },
    ]);
  });
});
