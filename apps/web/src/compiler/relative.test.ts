import type { RelativeDate } from '@wellyboot/shared';
import { compileFilter } from './query';
import { relativeBounds, relativeCondition, todaySql } from './relative';

describe('relative dates', () => {
  it('uses DuckDB’s current_date unless today is given', () => {
    expect(todaySql()).toBe('current_date');
    expect(todaySql('2026-03-01')).toBe(`DATE '2026-03-01'`);
    expect(() => todaySql("2026-03-01'; DROP")).toThrow(RangeError);
  });

  it.each<[RelativeDate, { start: string; end: string }]>([
    [
      { kind: 'last', n: 30, unit: 'day' },
      { start: `CAST(DATE '2026-03-01' - INTERVAL 30 DAY AS DATE)`, end: `DATE '2026-03-01'` },
    ],
    [
      { kind: 'last', n: 2, unit: 'week' },
      { start: `CAST(CAST(date_trunc('week', DATE '2026-03-01') AS DATE) - INTERVAL 14 DAY AS DATE)`, end: `CAST(date_trunc('week', DATE '2026-03-01') AS DATE)` },
    ],
    [
      { kind: 'this', unit: 'quarter' },
      { start: `CAST(date_trunc('quarter', DATE '2026-03-01') AS DATE)`, end: `CAST(CAST(date_trunc('quarter', DATE '2026-03-01') AS DATE) + INTERVAL 3 MONTH AS DATE)` },
    ],
    [
      { kind: 'toDate', unit: 'year' },
      { start: `CAST(date_trunc('year', DATE '2026-03-01') AS DATE)`, end: `CAST(DATE '2026-03-01' + INTERVAL 1 DAY AS DATE)` },
    ],
  ])('%j', (range, bounds) => {
    expect(relativeBounds(range, '2026-03-01')).toEqual(bounds);
  });

  it('compares a date field as it is, and timestamps by their date, zoned ones in UTC', () => {
    const range: RelativeDate = { kind: 'last', n: 1, unit: 'month' };
    const filter = (field: string) => ({ field, op: 'relative' as const, range });
    expect(compileFilter(filter('placed'), 'DATE', { today: '2026-03-01' })).toBe(relativeCondition('"placed"', range, '2026-03-01'));
    expect(compileFilter(filter('at'), 'TIMESTAMP', { today: '2026-03-01' })).toBe(relativeCondition('CAST("at" AS DATE)', range, '2026-03-01'));
    expect(compileFilter(filter('at_tz'), 'TIMESTAMP WITH TIME ZONE')).toBe(relativeCondition('CAST(CAST("at_tz" AS TIMESTAMP) AS DATE)', range));
  });
});
