// A visual's query as one DuckDB SELECT over its dataset's view, `ds_<id>`:
//
//   SELECT <groups>, <measures>
//   FROM "ds_<id>"
//   WHERE <the query's filters AND the dashboard's>
//   GROUP BY <each group, by position>
//   ORDER BY <the query's sort>, <every group not sorted on yet, ascending>   (so equal rows always come in one order)
//   LIMIT <the top N, or the row limit for visuals when that is smaller>
//
// A top N with an others row is a WITH query instead (see compileTopN), still one statement.
//
// A group is a field as it is, a date truncated to a calendar unit (a DATE, or a TIMESTAMP for hours; zoned times in
// UTC, since their date functions need the icu extension), or a number
// floored to the start of its bin. Empty values group together as one NULL group, which the formatter labels; they
// sort last. Measures come back as BIGINT counts and integer sums, DOUBLE averages, medians and decimal sums, and min
// and max in the field's own type, so the chart knows each column's type before the query runs (describeQuery).
//
// One query reads one dataset. Joining is done in Puddle, before export: Wellyboot BI charts the curated result.
import type { ColumnSchema, Filter, FilterValue, Group, Measure, Query } from '@wellyboot/shared';
import { assertQuery, type CheckOptions } from './check';
import { datasetRelationName } from './datasets';
import { relativeCondition } from './relative';
import { bool, ident, list, num, str } from './sql';
import { AGGREGATE_INFO, asBoolean, asNumber, fieldKind, isDecimalType, isIntegerType, isZonedType } from './types';

export interface CompileOptions extends CheckOptions {
  /** The most rows to return, whatever the query's own limit: the row limit for visuals, plus one to tell it was hit. */
  maxRows?: number;
}

/** One column of a query's result, in order: a group, a measure, or the flag marking the others row. */
export interface ResultColumn {
  name: string;
  /** The DuckDB type DuckDB reports for it. */
  type: string;
  role: 'group' | 'measure' | 'others';
  /** Its place in `groups` or `measures`. */
  index: number;
  /** The type of the dataset field it comes from; none for a count of rows. */
  fieldType?: string;
}

/** The name of the column that is true on the others row. */
export const OTHERS_COLUMN = '__others';

const fold = (name: string) => name.toLowerCase();

/** A group's name in the result: its own, or its field's. */
const groupName = (g: Group) => g.as ?? g.field;

/** A measure's name in the result: its own, or "Sum of amount", "Count" for a count of rows. */
const measureName = (m: Measure) => m.as ?? (m.field == null ? 'Count' : `${AGGREGATE_INFO[m.aggregate].label} of ${m.field}`);

/** The result's column names; one already taken (DuckDB ignores case) is numbered: Region, Region (2). */
function resultNames(query: Query): { groups: string[]; measures: string[] } {
  const taken = new Set<string>([fold(OTHERS_COLUMN)]);
  const name = (wanted: string) => {
    let n = wanted;
    for (let k = 2; taken.has(fold(n)); k++) n = `${wanted} (${k})`;
    taken.add(fold(n));
    return n;
  };
  return { groups: query.groups.map((g) => name(groupName(g))), measures: query.measures.map((m) => name(measureName(m))) };
}

const columnType = (schema: ColumnSchema[], field: string) => schema.find((c) => c.name === field)?.type ?? '';

/**
 * A field as a time with no zone. Date functions on TIMESTAMPTZ need DuckDB's icu extension, which the app doesn't
 * load, so a zoned time is read in UTC (a core cast): buckets and relative dates are UTC days and hours.
 */
export const plainTime = (col: string, type: string) => (isZonedType(type) ? `CAST(${col} AS TIMESTAMP)` : col);

/** A group's value for each row. */
export function compileGroup(g: Group, type: string): string {
  const col = ident(g.field);
  if (g.bucket?.kind === 'date') {
    const at = plainTime(col, type);
    return g.bucket.unit === 'hour' ? `date_trunc('hour', ${at})` : `CAST(date_trunc(${str(g.bucket.unit)}, ${at}) AS DATE)`;
  }
  if (g.bucket?.kind === 'bin') return `floor(CAST(${col} AS DOUBLE) / ${num(g.bucket.width)}) * ${num(g.bucket.width)}`;
  // Decimals come back from DuckDB-WASM as Arrow decimals, which JavaScript reads as raw words; doubles chart.
  return isDecimalType(type) ? `CAST(${col} AS DOUBLE)` : col;
}

const groupType = (g: Group, type: string) =>
  g.bucket?.kind === 'date' ? (g.bucket.unit === 'hour' ? 'TIMESTAMP' : 'DATE') : g.bucket?.kind === 'bin' || isDecimalType(type) ? 'DOUBLE' : type;

/** A measure's summary of the rows in a group. */
export function compileMeasure(m: Measure, type: string): string {
  if (m.field == null) return 'count(*)';
  const col = ident(m.field);
  switch (m.aggregate) {
    case 'count':
      return `count(${col})`;
    case 'countDistinct':
      return `count(DISTINCT ${col})`;
    case 'sum':
      return isIntegerType(type) ? `CAST(sum(${col}) AS BIGINT)` : `CAST(sum(${col}) AS DOUBLE)`;
    case 'avg':
      return `avg(CAST(${col} AS DOUBLE))`;
    case 'median':
      return `median(CAST(${col} AS DOUBLE))`;
    case 'min':
    case 'max':
      return isDecimalType(type) ? `CAST(${m.aggregate}(${col}) AS DOUBLE)` : `${m.aggregate}(${col})`;
  }
}

function measureType(m: Measure, type: string): string {
  if (m.aggregate === 'count' || m.aggregate === 'countDistinct') return 'BIGINT';
  if (m.aggregate === 'sum') return isIntegerType(type) ? 'BIGINT' : 'DOUBLE';
  if (m.aggregate === 'avg' || m.aggregate === 'median') return 'DOUBLE';
  return isDecimalType(type) ? 'DOUBLE' : type;
}

/** The columns a query returns, with the types DuckDB will report, without running it. */
export function describeQuery(query: Query, schema: ColumnSchema[]): ResultColumn[] {
  const names = resultNames(query);
  const groups = query.groups.map((g, index): ResultColumn => {
    const fieldType = columnType(schema, g.field);
    return { name: names.groups[index]!, type: groupType(g, fieldType), role: 'group', index, fieldType };
  });
  const measures = query.measures.map((m, index): ResultColumn => {
    const fieldType = m.field == null ? undefined : columnType(schema, m.field);
    return { name: names.measures[index]!, type: measureType(m, fieldType ?? ''), role: 'measure', index, ...(fieldType != null && { fieldType }) };
  });
  const others: ResultColumn[] = query.limit?.others && query.groups.length ? [{ name: OTHERS_COLUMN, type: 'BOOLEAN', role: 'others', index: 0 }] : [];
  return [...groups, ...measures, ...others];
}

/** A filter value as a literal of the field's type. */
function literal(v: FilterValue, type: string): string {
  switch (fieldKind(type)) {
    case 'number':
      return num(asNumber(v)!);
    case 'boolean':
      return bool(asBoolean(v)!);
    case 'date':
      return `DATE ${str(String(v).trim())}`;
    case 'datetime':
      return `CAST(${str(String(v).trim())} AS ${/TIME ZONE|TIMESTAMPTZ/i.test(type) ? 'TIMESTAMPTZ' : 'TIMESTAMP'})`;
    case 'time':
      return `TIME ${str(String(v).trim())}`;
    case 'text':
      return str(String(v));
  }
}

export interface FilterOptions {
  /** Today, as an ISO date, for relative date filters; DuckDB's current_date when not given. */
  today?: string;
}

/** A filter as a condition on its field, as Puddle compiles criteria: text operators ignore case. */
export function compileFilter(f: Filter, type: string, opts: FilterOptions = {}): string {
  const col = ident(f.field);
  const text = `lower(CAST(${plainTime(col, type)} AS VARCHAR))`;
  switch (f.op) {
    case 'contains':
      return `contains(${text}, lower(${str(f.value)}))`;
    case 'starts':
      return `starts_with(${text}, lower(${str(f.value)}))`;
    case 'ends':
      return `suffix(${text}, lower(${str(f.value)}))`;
    case 'empty':
      return `(${col} IS NULL OR trim(CAST(${plainTime(col, type)} AS VARCHAR)) = '')`;
    case 'notEmpty':
      return `(${col} IS NOT NULL AND trim(CAST(${plainTime(col, type)} AS VARCHAR)) <> '')`;
    case 'between':
      return `${col} BETWEEN ${literal(f.from, type)} AND ${literal(f.to, type)}`;
    case 'in':
      return f.values.length ? `${col} IN (${list(f.values.map((v) => literal(v, type)))})` : 'false';
    case 'relative':
      return relativeCondition(fieldKind(type) === 'date' ? col : `CAST(${plainTime(col, type)} AS DATE)`, f.range, opts.today);
    default:
      return `${col} ${f.op} ${literal(f.value, type)}`;
  }
}

export interface QueryOptions extends CompileOptions, FilterOptions {}

/** Turn a query into one DuckDB SELECT over its dataset. Throws a CompileError, naming the part, when it doesn't fit. */
export function compileQuery(query: Query, schema: ColumnSchema[], opts: QueryOptions = {}): string {
  assertQuery(query, schema, opts);
  if (query.limit?.others && query.groups.length) return compileTopN(query, schema, opts);
  const names = resultNames(query);
  const type = (field: string) => columnType(schema, field);
  const select = [
    ...query.groups.map((g, i) => `${compileGroup(g, type(g.field))} AS ${ident(names.groups[i]!)}`),
    ...query.measures.map((m, i) => `${compileMeasure(m, m.field == null ? '' : type(m.field))} AS ${ident(names.measures[i]!)}`),
  ];
  const parts = [`SELECT ${list(select)}`, `FROM ${ident(datasetRelationName({ id: query.datasetId }))}`];
  const where = whereClause(query, schema, opts);
  if (where) parts.push(where);
  if (query.groups.length) parts.push(`GROUP BY ${list(query.groups.map((_, i) => String(i + 1)))}`);
  const order = orderTerms(query, (by, i) => ident((by === 'group' ? names.groups : names.measures)[i]!));
  if (order.length) parts.push(`ORDER BY ${list(order)}`);
  const limit = Math.min(query.limit?.n ?? Infinity, opts.maxRows ?? Infinity);
  if (Number.isFinite(limit)) parts.push(`LIMIT ${num(limit)}`);
  return parts.join(' ');
}

function whereClause(query: Query, schema: ColumnSchema[], opts: QueryOptions): string | undefined {
  const filters = [...query.filters, ...(opts.extraFilters ?? [])];
  return filters.length ? `WHERE ${filters.map((f) => compileFilter(f, columnType(schema, f.field), opts)).join(' AND ')}` : undefined;
}

/**
 * The query's sort, then every group not sorted on yet, ascending, so rows that tie always come in the same order;
 * empty values last. `term` writes the group or measure being sorted on.
 */
function orderTerms(query: Query, term: (by: 'group' | 'measure', index: number) => string): string[] {
  const terms = query.sort.map((s) => `${term(s.by, s.index)} ${s.dir.toUpperCase()} NULLS LAST`);
  const sorted = new Set(query.sort.filter((s) => s.by === 'group').map((s) => s.index));
  query.groups.forEach((_, i) => sorted.has(i) || terms.push(`${term('group', i)} ASC NULLS LAST`));
  return terms;
}

/** A group's value in the top N's working rows. */
const groupKey = (i: number) => ident(`__wb_g${i}`);

/**
 * Top N with others: the first n groups in sort order, then one more row, flagged in OTHERS_COLUMN, summarising every
 * other row. Groups are ranked once; each row is then summarised with its group's rank, so the others row's average,
 * median and distinct count are taken over its rows rather than over the other groups' summaries. Its group columns
 * are empty. The others row is left out when nothing is left over.
 *
 *   WITH "rows" AS (SELECT *, <group> AS "__wb_g0", ... FROM <dataset> WHERE <filters>),
 *        "ranked" AS (SELECT <group keys>, row_number() OVER (ORDER BY <sort>) AS "__wb_rank" FROM "rows" GROUP BY <group keys>),
 *        "kept" AS (SELECT "rows".*, "__wb_rank" FROM "rows" JOIN "ranked" ON <group keys match, empty matching empty>)
 *   SELECT <columns> FROM (
 *     SELECT <group keys>, <measures>, false, min("__wb_rank") FROM "kept" WHERE "__wb_rank" <= n GROUP BY <group keys>
 *     UNION ALL
 *     SELECT <NULL for each group>, <measures>, true, n + 1 FROM "kept" WHERE "__wb_rank" > n HAVING count(*) > 0
 *   ) ORDER BY "__wb_order"
 */
export function compileTopN(query: Query, schema: ColumnSchema[], opts: QueryOptions = {}): string {
  const n = query.limit!.n;
  const names = resultNames(query);
  const type = (field: string) => columnType(schema, field);
  const keys = query.groups.map((_, i) => groupKey(i));
  const measures = query.measures.map((m, i) => `${compileMeasure(m, m.field == null ? '' : type(m.field))} AS ${ident(names.measures[i]!)}`);
  const where = whereClause(query, schema, opts);
  const rows = `SELECT *, ${list(query.groups.map((g, i) => `${compileGroup(g, type(g.field))} AS ${keys[i]}`))} FROM ${ident(datasetRelationName({ id: query.datasetId }))}${where ? ` ${where}` : ''}`;
  const rank = orderTerms(query, (by, i) => (by === 'group' ? keys[i]! : compileMeasure(query.measures[i]!, query.measures[i]!.field == null ? '' : type(query.measures[i]!.field!))));
  const ranked = `SELECT ${list(keys)}, row_number() OVER (ORDER BY ${list(rank)}) AS "__wb_rank" FROM "rows" GROUP BY ${list(keys)}`;
  const kept = `SELECT "rows".*, "ranked"."__wb_rank" FROM "rows" JOIN "ranked" ON ${keys.map((k) => `"rows".${k} IS NOT DISTINCT FROM "ranked".${k}`).join(' AND ')}`;
  const top = `SELECT ${list([...keys.map((k, i) => `${k} AS ${ident(names.groups[i]!)}`), ...measures, `false AS ${ident(OTHERS_COLUMN)}`, 'min("__wb_rank") AS "__wb_order"'])} FROM "kept" WHERE "__wb_rank" <= ${num(n)} GROUP BY ${list(keys)}`;
  const nulls = query.groups.map((g, i) => `CAST(NULL AS ${groupType(g, type(g.field))}) AS ${ident(names.groups[i]!)}`);
  const others = `SELECT ${list([...nulls, ...measures, `true AS ${ident(OTHERS_COLUMN)}`, `${num(n + 1)} AS "__wb_order"`])} FROM "kept" WHERE "__wb_rank" > ${num(n)} HAVING count(*) > 0`;
  const columns = [...names.groups, ...names.measures, OTHERS_COLUMN].map(ident);
  const limit = opts.maxRows != null ? ` LIMIT ${num(opts.maxRows)}` : '';
  return `WITH "rows" AS (${rows}), "ranked" AS (${ranked}), "kept" AS (${kept}) SELECT ${list(columns)} FROM (${top} UNION ALL ${others}) ORDER BY "__wb_order"${limit}`;
}
