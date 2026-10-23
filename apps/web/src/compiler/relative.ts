// Relative date filters as a range of whole days, start included and end not, worked out from today in SQL so a
// saved dashboard keeps meaning "last 30 days" as time passes:
//
//   last n units   the n whole units before the current one   (last 1 month on 2026-03-14: 2026-02-01 to 2026-02-28)
//   this unit      the whole current unit                      (this month: 2026-03-01 to 2026-03-31)
//   unit to date   the current unit up to and including today  (year to date: 2026-01-01 to 2026-03-14)
//
// Weeks start on Monday, as date_trunc has them. Times are compared by their date; zoned times in UTC.
import type { RelativeDate, RelativeUnit } from '@wellyboot/shared';
import { num, str } from './sql';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today in SQL: the given ISO date (tests fix the clock with it), or DuckDB's current_date. */
export function todaySql(today?: string): string {
  if (today == null) return 'current_date';
  if (!ISO_DATE.test(today)) throw new RangeError(`Not an ISO date: ${today}`);
  return `DATE ${str(today)}`;
}

/** An interval of n units, in the units DuckDB intervals are made of. */
function interval(n: number, unit: RelativeUnit): string {
  switch (unit) {
    case 'day':
      return `INTERVAL ${num(n)} DAY`;
    case 'week':
      return `INTERVAL ${num(7 * n)} DAY`;
    case 'month':
      return `INTERVAL ${num(n)} MONTH`;
    case 'quarter':
      return `INTERVAL ${num(3 * n)} MONTH`;
    case 'year':
      return `INTERVAL ${num(n)} YEAR`;
  }
}

/** The first day of the unit a date is in (date_trunc gives a TIMESTAMP, so it's cast back). */
const startOf = (unit: RelativeUnit, date: string) => (unit === 'day' ? date : `CAST(date_trunc(${str(unit)}, ${date}) AS DATE)`);

const plus = (date: string, n: number, unit: RelativeUnit) => `CAST(${date} ${n < 0 ? '-' : '+'} ${interval(Math.abs(n), unit)} AS DATE)`;

/** A relative range as its first day and the day after its last, both DATE expressions. */
export function relativeBounds(range: RelativeDate, today?: string): { start: string; end: string } {
  const t = todaySql(today);
  const current = startOf(range.unit, t);
  switch (range.kind) {
    case 'last':
      return { start: plus(current, -range.n, range.unit), end: current };
    case 'this':
      return { start: current, end: plus(current, 1, range.unit) };
    case 'toDate':
      return { start: current, end: plus(t, 1, 'day') };
  }
}

/** Whether a date (a DATE expression) falls in a relative range. */
export function relativeCondition(date: string, range: RelativeDate, today?: string): string {
  const { start, end } = relativeBounds(range, today);
  return `(${date} >= ${start} AND ${date} < ${end})`;
}
