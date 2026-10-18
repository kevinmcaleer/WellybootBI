import type { ColumnSchema, Query } from '@wellyboot/shared';
import { describeQuery } from '../compiler/query';
import { EMPTY_LABEL, formatCell, formatHints } from './format';

const SCHEMA: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,2)' },
  { name: 'units', type: 'BIGINT' },
  { name: 'price', type: 'DOUBLE' },
  { name: 'placed', type: 'DATE' },
  { name: 'at', type: 'TIMESTAMP' },
];
const GB = { locale: 'en-GB', dates: 'locale' as const };
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe('formatHints', () => {
  it('takes decimals from the type and the summary, granularity from the bucket, and the percent flag', () => {
    const q: Query = {
      datasetId: 'a1b2c3d4e5f6',
      groups: [{ field: 'placed', bucket: { kind: 'date', unit: 'month' } }, { field: 'at', bucket: { kind: 'date', unit: 'hour' } }, { field: 'price', bucket: { kind: 'bin', width: 0.5 } }, { field: 'Region' }],
      measures: [
        { aggregate: 'sum', field: 'amount' },
        { aggregate: 'sum', field: 'units' },
        { aggregate: 'avg', field: 'units' },
        { aggregate: 'avg', field: 'amount' },
        { aggregate: 'max', field: 'price', percent: true },
        { aggregate: 'count' },
        { aggregate: 'min', field: 'placed' },
      ],
      filters: [],
      sort: [],
      limit: { n: 5, others: true },
    };
    expect(formatHints(q, describeQuery(q, SCHEMA))).toEqual([
      { kind: 'date', granularity: 'month' },
      { kind: 'datetime', granularity: 'hour' },
      { kind: 'number', decimals: 1 },
      { kind: 'text' },
      { kind: 'number', decimals: 2 },
      { kind: 'number', decimals: 0 },
      { kind: 'number' },
      { kind: 'number', decimals: 2 },
      { kind: 'number', percent: true },
      { kind: 'number', decimals: 0 },
      { kind: 'date' },
      { kind: 'boolean' },
    ]);
  });
});

describe('formatCell', () => {
  it.each([
    [1234.5, { kind: 'number', decimals: 2 }, '1,234.50'],
    [1234.567, { kind: 'number' }, '1,234.57'],
    [0.125, { kind: 'number', percent: true }, '12.5%'],
    ['9007199254740993', { kind: 'number', decimals: 0 }, '9,007,199,254,740,993'],
    [day('2026-03-01'), { kind: 'date', granularity: 'year' }, '2026'],
    [day('2026-08-01'), { kind: 'date', granularity: 'quarter' }, 'Q3 2026'],
    [day('2026-03-01'), { kind: 'date', granularity: 'month' }, 'Mar 2026'],
    [day('2026-03-02'), { kind: 'date', granularity: 'week' }, 'Week of 02/03/2026'],
    [day('2026-03-02'), { kind: 'date', granularity: 'day' }, '02/03/2026'],
    [Date.parse('2026-03-02T14:00:00Z'), { kind: 'datetime', granularity: 'hour' }, '02/03/2026, 14:00'],
    [Date.parse('2026-03-02T14:05:09Z'), { kind: 'datetime' }, '02/03/2026, 14:05:09'],
    [null, { kind: 'text' }, EMPTY_LABEL],
    ['North', { kind: 'text' }, 'North'],
  ] as const)('%j as %j is %s', (value, hint, text) => {
    expect(formatCell(value, hint, GB)).toBe(text);
  });

  it('writes numbers the display locale’s way', () => {
    expect(formatCell(1234.5, { kind: 'number', decimals: 2 }, { locale: 'de-DE', dates: 'locale' })).toBe('1.234,50');
  });
});
