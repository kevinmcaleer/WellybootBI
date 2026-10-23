// Whether a query fits its dataset, checked before any SQL is built: every field it names exists, every summary,
// bucket and filter suits the field's type, and its sort and limit refer to parts it has. Each problem is in plain
// words and points at the part of the query it is in.
import { COMPARE_OPS, type ColumnSchema, type Filter, type FilterValue, type Query } from '@wellyboot/shared';
import { CompileError, type QueryProblem } from './errors';
import { AGGREGATE_INFO, bucketProblem, describeType, fieldKind, valueFits } from './types';

const isCompare = (op: string): op is (typeof COMPARE_OPS)[number] => (COMPARE_OPS as readonly string[]).includes(op);

/** The values a filter compares the field with. Text operators read any field as text, so theirs always fit. */
export const filterValues = (f: Filter): FilterValue[] => (f.op === 'between' ? [f.from, f.to] : f.op === 'in' ? f.values : isCompare(f.op) && 'value' in f ? [f.value] : []);

function filterProblem(f: Filter, col: ColumnSchema): string | undefined {
  if (f.op === 'relative') {
    const kind = fieldKind(col.type);
    return kind === 'date' || kind === 'datetime' ? undefined : `A relative date filter needs a date; ${f.field} is ${describeType(col.type)}`;
  }
  const bad = filterValues(f).find((v) => !valueFits(v, col.type));
  if (bad !== undefined) return `${f.field} is ${describeType(col.type)}, so it can't be compared with ${JSON.stringify(bad)}`;
  return undefined;
}

export interface CheckOptions {
  /** Dashboard filters and slicers, which join the query's own. */
  extraFilters?: Filter[];
}

/** Every problem with a query against a dataset's columns, in the order the editor shows its parts. */
export function checkQuery(query: Query, schema: ColumnSchema[], opts: CheckOptions = {}): QueryProblem[] {
  const byName = new Map(schema.map((c) => [c.name, c]));
  const problems: QueryProblem[] = [];
  const missing = (field: string) => `There's no field called ${field} in this dataset`;

  if (!query.groups.length && !query.measures.length) problems.push({ part: 'query', message: 'Choose a field to group by or a summary to show' });

  query.groups.forEach((g, index) => {
    const col = byName.get(g.field);
    const message = !col ? missing(g.field) : g.bucket && bucketProblem(g.bucket, g.field, col.type);
    if (message) problems.push({ part: 'group', index, field: g.field, message });
  });

  query.measures.forEach((m, index) => {
    if (m.field == null) return;
    const col = byName.get(m.field);
    const info = AGGREGATE_INFO[m.aggregate];
    const message = !col ? missing(m.field) : !info.fits(col.type) && `${info.label} needs ${info.needs}; ${m.field} is ${describeType(col.type)}`;
    if (message) problems.push({ part: 'measure', index, field: m.field, message });
  });

  [...query.filters, ...(opts.extraFilters ?? [])].forEach((f, index) => {
    const col = byName.get(f.field);
    const message = !col ? missing(f.field) : filterProblem(f, col);
    if (message) problems.push({ part: 'filter', index, field: f.field, message });
  });

  query.sort.forEach((s, index) => {
    const parts = s.by === 'group' ? query.groups : query.measures;
    if (s.index >= parts.length) problems.push({ part: 'sort', index, message: `The sort is by a ${s.by} this query doesn't have` });
  });

  if (query.limit?.others && !query.groups.length) problems.push({ part: 'limit', message: 'Others needs a field to group by' });

  return problems;
}

/** Throw the query's problems as a CompileError, or return when it has none. */
export function assertQuery(query: Query, schema: ColumnSchema[], opts: CheckOptions = {}): void {
  const [first, ...rest] = checkQuery(query, schema, opts);
  if (first) throw new CompileError([first, ...rest]);
}
