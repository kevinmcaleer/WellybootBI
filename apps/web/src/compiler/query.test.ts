import type { ColumnSchema, Filter, Query } from '@wellyboot/shared';
import { CompileError } from './errors';
import { compileFilter, compileQuery, describeQuery } from './query';

const SALES: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,2)' },
  { name: 'units', type: 'BIGINT' },
  { name: 'price', type: 'DOUBLE' },
  { name: 'placed', type: 'DATE' },
  { name: 'at', type: 'TIMESTAMP' },
  { name: 'at_tz', type: 'TIMESTAMP WITH TIME ZONE' },
  { name: 'opens', type: 'TIME' },
  { name: 'paid', type: 'BOOLEAN' },
  { name: 'Sales "rep"', type: 'VARCHAR' },
];

const query = (q: Partial<Query>): Query => ({ datasetId: 'a1b2c3d4e5f6', groups: [], measures: [], filters: [], sort: [], ...q });
const sql = (q: Partial<Query>, opts = {}) => compileQuery(query(q), SALES, opts);

describe('compileQuery', () => {
  it('sums a measure by a group, ordered by the group, over the dataset’s view', () => {
    expect(sql({ groups: [{ field: 'Region' }], measures: [{ aggregate: 'sum', field: 'units' }] })).toBe(
      'SELECT "Region" AS "Region", CAST(sum("units") AS BIGINT) AS "Sum of units" FROM "ds_a1b2c3d4e5f6" GROUP BY 1 ORDER BY "Region" ASC NULLS LAST',
    );
  });

  it('counts rows with no group as one row, with no GROUP BY or ORDER BY', () => {
    expect(sql({ measures: [{ aggregate: 'count' }] })).toBe('SELECT count(*) AS "Count" FROM "ds_a1b2c3d4e5f6"');
  });

  it('buckets dates by month as DATEs, hours as TIMESTAMPs, and numbers into bins', () => {
    expect(
      sql({
        groups: [
          { field: 'placed', bucket: { kind: 'date', unit: 'month' } },
          { field: 'at', bucket: { kind: 'date', unit: 'hour' } },
          { field: 'price', bucket: { kind: 'bin', width: 10 }, as: 'Price band' },
        ],
        measures: [{ aggregate: 'count' }],
      }),
    ).toMatchSnapshot();
  });

  it('reads zoned times in UTC, since their date functions need the icu extension', () => {
    expect(sql({ groups: [{ field: 'at_tz', bucket: { kind: 'date', unit: 'day' } }], measures: [{ aggregate: 'count' }] })).toMatch(
      /^SELECT CAST\(date_trunc\('day', CAST\("at_tz" AS TIMESTAMP\)\) AS DATE\) AS "at_tz"/,
    );
  });

  it('writes every aggregate', () => {
    expect(
      sql({
        measures: [
          { aggregate: 'sum', field: 'amount' },
          { aggregate: 'avg', field: 'units' },
          { aggregate: 'median', field: 'price' },
          { aggregate: 'min', field: 'amount' },
          { aggregate: 'max', field: 'placed' },
          { aggregate: 'count', field: 'Region' },
          { aggregate: 'countDistinct', field: 'Region' },
        ],
      }),
    ).toMatchSnapshot();
  });

  it('sorts by a measure first, then by every group not yet sorted on, and limits', () => {
    expect(
      sql({
        groups: [{ field: 'Region' }, { field: 'paid' }],
        measures: [{ aggregate: 'sum', field: 'price' }],
        sort: [
          { by: 'measure', index: 0, dir: 'desc' },
          { by: 'group', index: 1, dir: 'desc' },
        ],
        limit: { n: 5, others: false },
      }),
    ).toBe(
      'SELECT "Region" AS "Region", "paid" AS "paid", CAST(sum("price") AS DOUBLE) AS "Sum of price" FROM "ds_a1b2c3d4e5f6" GROUP BY 1, 2 ORDER BY "Sum of price" DESC NULLS LAST, "paid" DESC NULLS LAST, "Region" ASC NULLS LAST LIMIT 5',
    );
  });

  it('takes the smaller of the query’s limit and the row limit for visuals', () => {
    const q = { groups: [{ field: 'Region' }], measures: [{ aggregate: 'count' as const }] };
    expect(sql(q, { maxRows: 10_001 })).toMatch(/ LIMIT 10001$/);
    expect(sql({ ...q, limit: { n: 20, others: false } }, { maxRows: 10_001 })).toMatch(/ LIMIT 20$/);
  });

  it('ANDs the query’s filters with the dashboard’s', () => {
    expect(
      sql({ measures: [{ aggregate: 'count' }], filters: [{ field: 'Region', op: '=', value: 'North' }] }, { extraFilters: [{ field: 'units', op: '>=', value: 3 }] }),
    ).toBe(`SELECT count(*) AS "Count" FROM "ds_a1b2c3d4e5f6" WHERE "Region" = 'North' AND "units" >= 3`);
  });

  it('quotes names and values with quotes in them', () => {
    expect(
      sql({
        groups: [{ field: 'Sales "rep"', as: 'Rep’s "name"' }],
        measures: [{ aggregate: 'count' }],
        filters: [{ field: 'Region', op: '=', value: "O'Brien's" }],
      }),
    ).toBe(
      `SELECT "Sales ""rep""" AS "Rep’s ""name""", count(*) AS "Count" FROM "ds_a1b2c3d4e5f6" WHERE "Region" = 'O''Brien''s' GROUP BY 1 ORDER BY "Rep’s ""name""" ASC NULLS LAST`,
    );
  });

  it('numbers result names that clash, ignoring case', () => {
    const cols = describeQuery(query({ groups: [{ field: 'Region' }, { field: 'units', as: 'region' }], measures: [{ aggregate: 'count', as: 'REGION' }] }), SALES);
    expect(cols.map((c) => c.name)).toEqual(['Region', 'region (2)', 'REGION (3)']);
  });

  it('refuses a query that doesn’t fit before writing any SQL', () => {
    expect(() => sql({ measures: [{ aggregate: 'sum', field: 'Region' }] })).toThrow(new CompileError([{ part: 'measure', index: 0, field: 'Region', message: 'Sum needs a number; Region is text' }]));
  });
});

describe('describeQuery', () => {
  it('gives each column the type DuckDB will report', () => {
    expect(
      describeQuery(
        query({
          groups: [{ field: 'placed', bucket: { kind: 'date', unit: 'week' } }, { field: 'at_tz', bucket: { kind: 'date', unit: 'hour' } }, { field: 'units', bucket: { kind: 'bin', width: 5 } }, { field: 'amount' }, { field: 'Region' }],
          measures: [
            { aggregate: 'sum', field: 'units' },
            { aggregate: 'sum', field: 'amount' },
            { aggregate: 'avg', field: 'units' },
            { aggregate: 'min', field: 'placed' },
            { aggregate: 'max', field: 'amount' },
            { aggregate: 'countDistinct', field: 'Region' },
            { aggregate: 'count' },
          ],
        }),
        SALES,
      ).map((c) => [c.name, c.type, c.role]),
    ).toEqual([
      ['placed', 'DATE', 'group'],
      ['at_tz', 'TIMESTAMP', 'group'],
      ['units', 'DOUBLE', 'group'],
      ['amount', 'DOUBLE', 'group'],
      ['Region', 'VARCHAR', 'group'],
      ['Sum of units', 'BIGINT', 'measure'],
      ['Sum of amount', 'DOUBLE', 'measure'],
      ['Average of units', 'DOUBLE', 'measure'],
      ['Min of placed', 'DATE', 'measure'],
      ['Max of amount', 'DOUBLE', 'measure'],
      ['Count distinct of Region', 'BIGINT', 'measure'],
      ['Count', 'BIGINT', 'measure'],
    ]);
  });
});

describe('compileFilter', () => {
  it.each([
    [{ field: 'units', op: '<', value: '10' }, 'BIGINT', '"units" < 10'],
    [{ field: 'units', op: '<>', value: 3 }, 'BIGINT', '"units" <> 3'],
    [{ field: 'paid', op: '=', value: 'true' }, 'BOOLEAN', '"paid" = true'],
    [{ field: 'placed', op: '<=', value: '2026-03-01' }, 'DATE', `"placed" <= DATE '2026-03-01'`],
    [{ field: 'at', op: '>', value: '2026-03-01 14:00' }, 'TIMESTAMP', `"at" > CAST('2026-03-01 14:00' AS TIMESTAMP)`],
    [{ field: 'at_tz', op: '>', value: '2026-03-01T14:00:00Z' }, 'TIMESTAMP WITH TIME ZONE', `"at_tz" > CAST('2026-03-01T14:00:00Z' AS TIMESTAMPTZ)`],
    [{ field: 'opens', op: '>=', value: '09:00' }, 'TIME', `"opens" >= TIME '09:00'`],
    [{ field: 'Region', op: 'contains', value: 'Or' }, 'VARCHAR', `contains(lower(CAST("Region" AS VARCHAR)), lower('Or'))`],
    [{ field: 'Region', op: 'starts', value: 'N' }, 'VARCHAR', `starts_with(lower(CAST("Region" AS VARCHAR)), lower('N'))`],
    [{ field: 'Region', op: 'ends', value: 'th' }, 'VARCHAR', `suffix(lower(CAST("Region" AS VARCHAR)), lower('th'))`],
    [{ field: 'Region', op: 'empty' }, 'VARCHAR', `("Region" IS NULL OR trim(CAST("Region" AS VARCHAR)) = '')`],
    [{ field: 'Region', op: 'notEmpty' }, 'VARCHAR', `("Region" IS NOT NULL AND trim(CAST("Region" AS VARCHAR)) <> '')`],
    [{ field: 'price', op: 'between', from: 1.5, to: '9' }, 'DOUBLE', '"price" BETWEEN 1.5 AND 9'],
    [{ field: 'Region', op: 'in', values: ['North', 'South'] }, 'VARCHAR', `"Region" IN ('North', 'South')`],
    [{ field: 'Region', op: 'in', values: [] }, 'VARCHAR', 'false'],
    [{ field: 'Region', op: '=', value: 42 }, 'VARCHAR', `"Region" = '42'`],
  ] satisfies [Filter, string, string][])('%j over %s', (f, type, expected) => {
    expect(compileFilter(f, type)).toBe(expected);
  });
});
