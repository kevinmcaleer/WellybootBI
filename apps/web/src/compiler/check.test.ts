import type { ColumnSchema, Query } from '@wellyboot/shared';
import { assertQuery, checkQuery } from './check';
import { CompileError } from './errors';

const SALES: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,2)' },
  { name: 'units', type: 'BIGINT' },
  { name: 'placed', type: 'DATE' },
  { name: 'at', type: 'TIMESTAMP' },
  { name: 'paid', type: 'BOOLEAN' },
  { name: 'tags', type: 'VARCHAR[]' },
];

const query = (q: Partial<Query>): Query => ({ datasetId: 'a1b2c3d4e5f6', groups: [], measures: [], filters: [], sort: [], ...q });
const messages = (q: Partial<Query>) => checkQuery(query(q), SALES).map((p) => p.message);

describe('checkQuery', () => {
  it('passes a query that fits its dataset', () => {
    expect(
      checkQuery(
        query({
          groups: [{ field: 'Region' }, { field: 'placed', bucket: { kind: 'date', unit: 'month' } }, { field: 'units', bucket: { kind: 'bin', width: 10 } }],
          measures: [{ aggregate: 'sum', field: 'amount' }, { aggregate: 'count' }, { aggregate: 'countDistinct', field: 'tags' }, { aggregate: 'max', field: 'placed' }],
          filters: [{ field: 'paid', op: '=', value: true }, { field: 'units', op: '>', value: '3' }, { field: 'placed', op: 'relative', range: { kind: 'last', n: 30, unit: 'day' } }],
          sort: [{ by: 'measure', index: 0, dir: 'desc' }],
          limit: { n: 5, others: true },
        }),
        SALES,
      ),
    ).toEqual([]);
  });

  it('refuses the sum of a text field, naming the field', () => {
    expect(checkQuery(query({ measures: [{ aggregate: 'sum', field: 'Region' }] }), SALES)).toEqual([
      { part: 'measure', index: 0, field: 'Region', message: 'Sum needs a number; Region is text' },
    ]);
  });

  it('refuses averages and medians of dates, and min of a list', () => {
    expect(messages({ measures: [{ aggregate: 'avg', field: 'placed' }, { aggregate: 'median', field: 'paid' }, { aggregate: 'min', field: 'tags' }] })).toEqual([
      'Average needs a number; placed is a date',
      'Median needs a number; paid is true or false',
      'Min needs values that can be put in order; tags is text',
    ]);
  });

  it('names fields the dataset lacks, wherever they are', () => {
    expect(checkQuery(query({ groups: [{ field: 'Country' }], measures: [{ aggregate: 'sum', field: 'profit' }], filters: [{ field: 'x', op: 'empty' }] }), SALES)).toEqual([
      { part: 'group', index: 0, field: 'Country', message: "There's no field called Country in this dataset" },
      { part: 'measure', index: 0, field: 'profit', message: "There's no field called profit in this dataset" },
      { part: 'filter', index: 0, field: 'x', message: "There's no field called x in this dataset" },
    ]);
  });

  it('refuses buckets that do not suit the field', () => {
    expect(
      messages({
        groups: [
          { field: 'Region', bucket: { kind: 'date', unit: 'month' } },
          { field: 'placed', bucket: { kind: 'date', unit: 'hour' } },
          { field: 'placed', bucket: { kind: 'bin', width: 7 } },
        ],
        measures: [{ aggregate: 'count' }],
      }),
    ).toEqual(['A month bucket needs a date; Region is text', 'An hour bucket needs a date and time; placed is a date', 'Bins need a number; placed is a date']);
  });

  it('refuses filter values of the wrong kind, and relative dates on anything but dates', () => {
    expect(
      messages({
        measures: [{ aggregate: 'count' }],
        filters: [
          { field: 'units', op: '>', value: 'many' },
          { field: 'placed', op: 'between', from: '2026-01-01', to: 'March' },
          { field: 'paid', op: 'in', values: [true, 'maybe'] },
          { field: 'Region', op: 'relative', range: { kind: 'this', unit: 'month' } },
        ],
      }),
    ).toEqual([
      'units is a number, so it can\'t be compared with "many"',
      'placed is a date, so it can\'t be compared with "March"',
      'paid is true or false, so it can\'t be compared with "maybe"',
      'A relative date filter needs a date; Region is text',
    ]);
  });

  it('lets text operators read any field as text, and timestamps compare with dates', () => {
    expect(messages({ measures: [{ aggregate: 'count' }], filters: [{ field: 'units', op: 'contains', value: '12' }, { field: 'at', op: '>=', value: '2026-01-01' }] })).toEqual([]);
  });

  it('checks dashboard filters as well as the query’s own', () => {
    expect(checkQuery(query({ measures: [{ aggregate: 'count' }] }), SALES, { extraFilters: [{ field: 'units', op: '=', value: 'x' }] }).map((p) => p.part)).toEqual(['filter']);
  });

  it('refuses a sort by a part the query lacks, others with no group, and an empty query', () => {
    expect(messages({ measures: [{ aggregate: 'count' }], sort: [{ by: 'group', index: 0, dir: 'asc' }], limit: { n: 3, others: true } })).toEqual([
      "The sort is by a group this query doesn't have",
      'Others needs a field to group by',
    ]);
    expect(messages({})).toEqual(['Choose a field to group by or a summary to show']);
  });
});

describe('assertQuery', () => {
  it('throws a CompileError carrying every problem, the first as its message', () => {
    const q = query({ measures: [{ aggregate: 'sum', field: 'Region' }, { aggregate: 'avg', field: 'paid' }] });
    expect(() => assertQuery(q, SALES)).toThrow(CompileError);
    try {
      assertQuery(q, SALES);
    } catch (e) {
      expect((e as CompileError).message).toBe('Sum needs a number; Region is text');
      expect((e as CompileError).place).toEqual({ part: 'measure', index: 0, field: 'Region' });
      expect((e as CompileError).problems).toHaveLength(2);
    }
  });
});
