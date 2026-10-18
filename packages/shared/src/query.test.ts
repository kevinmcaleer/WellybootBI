import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AGGREGATES,
  COMPARE_OPS,
  DATE_BUCKETS,
  DEFAULT_QUERY,
  EMPTY_OPS,
  QueryZ,
  RELATIVE_UNITS,
  TEXT_OPS,
  type Filter,
  type Query,
} from './index.ts';

const fieldName = fc.string({ minLength: 1, maxLength: 12 });
const value = fc.oneof(fc.string(), fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => n + 0), fc.boolean());

const bucket = fc.oneof(
  fc.record({ kind: fc.constant('date' as const), unit: fc.constantFrom(...DATE_BUCKETS) }),
  fc.record({ kind: fc.constant('bin' as const), width: fc.double({ min: 0.001, max: 1e6, noNaN: true }) }),
);

const group = fc.record({ field: fieldName, bucket: bucket, as: fc.string({ minLength: 1 }).filter((s) => s.trim() === s && s !== '') }, { requiredKeys: ['field'] });

const measure = fc.oneof(
  fc.record({ aggregate: fc.constantFrom(...AGGREGATES), field: fieldName, percent: fc.boolean() }, { requiredKeys: ['aggregate', 'field'] }),
  fc.constant({ aggregate: 'count' as const }),
);

const range = fc.oneof(
  fc.record({ kind: fc.constant('last' as const), n: fc.integer({ min: 1, max: 400 }), unit: fc.constantFrom(...RELATIVE_UNITS) }),
  fc.record({ kind: fc.constantFrom('this' as const, 'toDate' as const), unit: fc.constantFrom('week' as const, 'month' as const, 'quarter' as const, 'year' as const) }),
);

const filter: fc.Arbitrary<Filter> = fc.oneof(
  fc.record({ field: fieldName, op: fc.constantFrom(...COMPARE_OPS), value }),
  fc.record({ field: fieldName, op: fc.constantFrom(...TEXT_OPS), value: fc.string() }),
  fc.record({ field: fieldName, op: fc.constantFrom(...EMPTY_OPS) }),
  fc.record({ field: fieldName, op: fc.constant('between' as const), from: value, to: value }),
  fc.record({ field: fieldName, op: fc.constant('in' as const), values: fc.array(value, { maxLength: 5 }) }),
  fc.record({ field: fieldName, op: fc.constant('relative' as const), range }),
);

const queryArb: fc.Arbitrary<Query> = fc.record(
  {
    datasetId: fc.stringMatching(/^[a-z0-9]{8,32}$/),
    groups: fc.array(group, { maxLength: 3 }),
    measures: fc.array(measure, { maxLength: 3 }),
    filters: fc.array(filter, { maxLength: 4 }),
    sort: fc.array(fc.record({ by: fc.constantFrom('group' as const, 'measure' as const), index: fc.nat(3), dir: fc.constantFrom('asc' as const, 'desc' as const) }), { maxLength: 2 }),
    limit: fc.record({ n: fc.integer({ min: 1, max: 1000 }), others: fc.boolean() }),
  },
  { requiredKeys: ['datasetId', 'groups', 'measures', 'filters', 'sort'] },
);

const query = (q: Partial<Query> = {}) => ({ datasetId: 'a1b2c3d4e5f6', ...q });
const pathOf = (input: unknown) => QueryZ.safeParse(input).error?.issues.map((i) => i.path.join('.'));

describe('QueryZ', () => {
  it('parses any generated query, and it round-trips through JSON', () => {
    fc.assert(
      fc.property(queryArb, (q) => {
        const parsed = QueryZ.parse(q);
        expect(parsed).toEqual(q);
        expect(QueryZ.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      }),
      { numRuns: 300 },
    );
  });

  it('fills in empty lists for a bare query, and the default query is a count of rows', () => {
    expect(QueryZ.parse(query())).toEqual({ datasetId: 'a1b2c3d4e5f6', groups: [], measures: [], filters: [], sort: [] });
    expect(QueryZ.parse(query(DEFAULT_QUERY)).measures).toEqual([{ aggregate: 'count' }]);
  });

  it('defaults a limit to no others bucket', () => {
    expect(QueryZ.parse(query({ limit: { n: 5 } as Query['limit'] })).limit).toEqual({ n: 5, others: false });
  });

  it('rejects an unknown aggregate, naming where', () => {
    expect(pathOf(query({ measures: [{ aggregate: 'mode' as 'sum', field: 'a' }] }))).toEqual(['measures.0.aggregate']);
  });

  it('rejects a bucket on a measure', () => {
    expect(pathOf(query({ measures: [{ aggregate: 'sum', field: 'a', bucket: { kind: 'date', unit: 'month' } } as never] }))).toEqual(['measures.0']);
  });

  it('rejects a sum with no field; a count needs none', () => {
    expect(pathOf(query({ measures: [{ aggregate: 'sum' }] }))).toEqual(['measures.0.field']);
    expect(pathOf(query({ measures: [{ aggregate: 'count' }] }))).toBeUndefined();
  });

  it('rejects a negative or zero limit and a bin of no width', () => {
    expect(pathOf(query({ limit: { n: -1, others: false } }))).toEqual(['limit.n']);
    expect(pathOf(query({ limit: { n: 0, others: false } }))).toEqual(['limit.n']);
    expect(pathOf(query({ groups: [{ field: 'a', bucket: { kind: 'bin', width: 0 } }] }))).toEqual(['groups.0.bucket.width']);
  });

  it('rejects a text operator with a number, and a filter with an unknown operator', () => {
    expect(pathOf(query({ filters: [{ field: 'a', op: 'contains', value: 3 as unknown as string }] }))).toEqual(['filters.0.value']);
    expect(pathOf(query({ filters: [{ field: 'a', op: 'like', value: 'x' } as never] }))).toEqual(['filters.0.op']);
  });

  it('rejects "this day", which is just today', () => {
    expect(pathOf(query({ filters: [{ field: 'a', op: 'relative', range: { kind: 'this', unit: 'day' as 'week' } }] }))).toEqual(['filters.0.range.unit']);
  });

  it('keeps the expressions slot reserved and empty', () => {
    expect(QueryZ.safeParse(query({ expressions: [] })).success).toBe(true);
    expect(pathOf(query({ expressions: ['sum(a) / 2' as never] }))).toEqual(['expressions']);
  });
});
