import type { ColumnSchema } from '@wellyboot/shared';
import { ident, num } from './sql';

/** How many of a text field's most common values the profile lists. */
export const TOP_VALUES = 5;

export interface ProfileField extends ColumnSchema {
  /** Whether min and max mean something for the type. */
  orderable: boolean;
  /** Whether to list the most common values (text fields). */
  top: boolean;
}

/**
 * One query that profiles every field of a relation: rows, and per field (by position, `f<i>_...`) the non-null
 * count, distinct count, min and max as text, and for text fields the most common values and their counts as two
 * lists. The aggregates share one scan; each list of top values is a subquery of its own.
 */
export function profileSql(relation: string, fields: ProfileField[]): string {
  const from = ident(relation);
  const cols = ['count(*)::BIGINT AS "rows"'];
  fields.forEach((f, i) => {
    const c = ident(f.name);
    cols.push(`count(${c})::BIGINT AS f${num(i)}_nonnull`, `count(DISTINCT ${c})::BIGINT AS f${num(i)}_distinct`);
    if (f.orderable) cols.push(`min(${c})::VARCHAR AS f${num(i)}_min`, `max(${c})::VARCHAR AS f${num(i)}_max`);
  });
  const tops = fields.flatMap((f, i) => {
    if (!f.top) return [];
    const c = ident(f.name);
    const top = `(SELECT ${c}::VARCHAR AS v, count(*)::BIGINT AS n FROM ${from} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${num(TOP_VALUES)})`;
    return [`(SELECT list(v) FROM ${top}) AS f${num(i)}_top_values`, `(SELECT list(n) FROM ${top}) AS f${num(i)}_top_counts`];
  });
  return `SELECT *${tops.length ? `, ${tops.join(', ')}` : ''} FROM (SELECT ${cols.join(', ')} FROM ${from})`;
}
