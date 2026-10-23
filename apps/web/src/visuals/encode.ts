// What each chart type can show, and the edits the wells make: a field dropped in a well adds a group or a summary
// to the visual's query and points the chart's encoding at it; taking it out removes both. Every refusal is a sentence
// naming the field, for the editor to show as it is. Switching chart type keeps what fits and says what didn't.
import {
  defaultChart,
  type Aggregate,
  type Bucket,
  type ChartSpec,
  type ChartType,
  type ColumnSchema,
  type Encoding,
  type Group,
  type Measure,
  type Query,
  type Visual,
} from '@wellyboot/shared';
import { chartDefinition, type WellDefinition, type WellId } from '../compiler/chart';
import { describeQuery } from '../compiler/query';
import { AGGREGATE_INFO, describeType, fieldKind } from '../compiler/types';

/** A field from the field list: a dataset field, or the rows themselves (`null`), which can only be counted. */
export type FieldRef = string | null;

/** An edit's outcome: the changed visual, or why it can't be made. */
export type EditResult = { visual: Visual; error?: undefined } | { error: string; visual?: undefined };

/** What fills a place in a well, for the editor to draw. */
export interface WellEntry {
  /** Its place in the query's groups or measures. */
  index: number;
  /** The dataset field; none for a count of rows. */
  field?: string;
  /** Its name in the result: Region, Sum of amount, Count. */
  name: string;
}

export const ROWS_LABEL = 'Number of rows';

const words = (f: FieldRef) => f ?? 'the number of rows';

const typeOf = (schema: ColumnSchema[], field: string) => schema.find((c) => c.name === field)?.type;

export const wellsOf = (type: ChartType) => chartDefinition(type).wells;
export const wellOf = (type: ChartType, id: WellId) => wellsOf(type).find((w) => w.id === id);

/** The places a well's encoding points at, in order. */
export function wellIndexes(encoding: Encoding, id: WellId): number[] {
  const v = encoding[id];
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** What a well holds, with the names the result gives each. */
export function wellEntries(visual: Visual, id: WellId): WellEntry[] {
  const well = wellOf(visual.chart.type, id);
  if (!well) return [];
  const names = describeQuery(visual.query, []);
  return wellIndexes(visual.chart.encoding, id).map((index) => {
    const part = well.holds === 'group' ? visual.query.groups[index] : visual.query.measures[index];
    const col = names.find((c) => c.role === well.holds && c.index === index);
    return { index, ...(part?.field != null && { field: part.field }), name: col?.name ?? '' };
  });
}

/** A column's name in the result, for messages: Region, Sum of amount. */
const nameOf = (query: Query, holds: 'group' | 'measure', index: number) =>
  describeQuery(query, []).find((c) => c.role === holds && c.index === index)?.name ?? '';

function setWell(encoding: Encoding, id: WellId, indexes: number[]): Encoding {
  const next = { ...encoding };
  if (id === 'values' || id === 'tooltips') next[id] = indexes;
  else if (indexes.length) next[id] = indexes[0];
  else delete next[id];
  return next;
}

const withChart = (v: Visual, encoding: Encoding, query: Query = v.query): Visual => ({ ...v, query, chart: { ...v.chart, encoding } as ChartSpec });

/** The query and encoding without one of the query's groups or measures, every place after it moved up. */
function dropPart(query: Query, encoding: Encoding, holds: 'group' | 'measure', index: number): { query: Query; encoding: Encoding } {
  const shift = (i: number) => (i > index ? i - 1 : i);
  const ids: WellId[] = holds === 'group' ? ['category', 'series'] : ['values', 'tooltips'];
  let e = encoding;
  for (const id of ids) e = setWell(e, id, wellIndexes(e, id).filter((i) => i !== index).map(shift));
  const sort = query.sort.filter((s) => !(s.by === holds && s.index === index)).map((s) => (s.by === holds ? { ...s, index: shift(s.index) } : s));
  const q: Query =
    holds === 'group'
      ? { ...query, groups: query.groups.filter((_, i) => i !== index), sort }
      : { ...query, measures: query.measures.filter((_, i) => i !== index), sort };
  // Others needs a group to be the others of.
  if (!q.groups.length && q.limit?.others) delete q.limit;
  return { query: q, encoding: e };
}

/** The summary a field gets when dropped on Values: a sum of a number, a count of anything else. */
export const defaultMeasure = (field: FieldRef, schema: ColumnSchema[]): Measure => {
  if (field == null) return { aggregate: 'count' };
  const type = typeOf(schema, field);
  return { aggregate: type && fieldKind(type) === 'number' ? 'sum' : 'count', field };
};

/** The group a field makes: dates by month on an axis and by year in a legend, everything else as it is. */
export const defaultGroup = (field: string, schema: ColumnSchema[], id: WellId): Group => {
  const kind = fieldKind(typeOf(schema, field) ?? '');
  if (kind === 'date' || kind === 'datetime') return { field, bucket: { kind: 'date', unit: id === 'series' ? 'year' : 'month' } };
  return { field };
};

/** Why a field can't go in a well, or undefined when it can. */
export function wellProblem(visual: Visual, schema: ColumnSchema[], id: WellId, field: FieldRef): string | undefined {
  const def = chartDefinition(visual.chart.type);
  const well = def.wells.find((w) => w.id === id);
  if (!well) return `A ${def.label.toLowerCase()} has no ${id} well`;
  if (field != null && !typeOf(schema, field)) return `There's no field called ${field} in this dataset`;
  const e = visual.chart.encoding;
  if (well.holds === 'group') {
    if (field == null) return `${well.label} needs a field to group by; the number of rows can only go in ${wellOf(visual.chart.type, 'values')?.label ?? 'Values'}`;
    const type = typeOf(schema, field)!;
    if (well.kinds && !well.kinds.accepts.includes(fieldKind(type))) return `${well.label} needs ${well.kinds.words}; ${field} is ${describeType(type)}`;
    const other: WellId = id === 'category' ? 'series' : 'category';
    const there = wellIndexes(e, other).find((i) => visual.query.groups[i]?.field === field);
    if (there != null) return `${field} is already in ${wellOf(visual.chart.type, other)?.label}`;
    if (id === 'series' && def.valuesWithSeries != null && e.values.length > def.valuesWithSeries)
      return `${well.label} splits one value at a time; take ${nameOf(visual.query, 'measure', e.values[1]!)} out of Values first to split by ${field}`;
    return undefined;
  }
  if (id === 'values' && e.series != null && def.valuesWithSeries != null && e.values.length >= def.valuesWithSeries && well.max !== 1)
    return `With ${nameOf(visual.query, 'group', e.series)} in ${wellOf(visual.chart.type, 'series')?.label}, the chart shows one value; take it out of the legend to add ${words(field)}`;
  return undefined;
}

/**
 * Put a field in a well, at a place in it (the end by default). A well that takes one field has it replaced. The
 * query gains the group or summary the well needs.
 */
export function addToWell(visual: Visual, schema: ColumnSchema[], id: WellId, field: FieldRef, at?: number): EditResult {
  const problem = wellProblem(visual, schema, id, field);
  if (problem) return { error: problem };
  const well = wellOf(visual.chart.type, id)!;
  let query = visual.query;
  let encoding = visual.chart.encoding;
  // A well of one field gives up the one it has.
  if (well.max === 1) for (const old of wellIndexes(encoding, id)) ({ query, encoding } = dropPart(query, encoding, well.holds, old));
  let index: number;
  if (well.holds === 'group') {
    query = { ...query, groups: [...query.groups, defaultGroup(field!, schema, id)] };
    index = query.groups.length - 1;
  } else {
    query = { ...query, measures: [...query.measures, defaultMeasure(field, schema)] };
    index = query.measures.length - 1;
  }
  const list = wellIndexes(encoding, id);
  list.splice(at ?? list.length, 0, index);
  return { visual: withChart(visual, setWell(encoding, id, list), query) };
}

/** Take the field at a place in a well out of the well and out of the query. */
export function removeFromWell(visual: Visual, id: WellId, position: number): Visual {
  const well = wellOf(visual.chart.type, id);
  const index = wellIndexes(visual.chart.encoding, id)[position];
  if (!well || index == null) return visual;
  const { query, encoding } = dropPart(visual.query, visual.chart.encoding, well.holds, index);
  return withChart(visual, encoding, query);
}

/**
 * Move a field from one place to another, in the same well or another one that holds the same kind of part (a
 * group from Axis to Legend, a summary from Values to Tooltips). The query keeps the part; only the encoding moves.
 */
export function moveInWells(visual: Visual, schema: ColumnSchema[], from: WellId, position: number, to: WellId, at?: number): EditResult {
  const src = wellOf(visual.chart.type, from);
  const dst = wellOf(visual.chart.type, to);
  const index = wellIndexes(visual.chart.encoding, from)[position];
  if (!src || !dst || index == null) return { visual };
  const part = src.holds === 'group' ? visual.query.groups[index] : visual.query.measures[index];
  const field = part?.field ?? null;
  if (src.holds !== dst.holds) {
    // A group dropped on a summary well, or the other way round, goes in as a new part.
    return addToWell(removeFromWell(visual, from, position), schema, to, field, at);
  }
  const without = setWell(visual.chart.encoding, from, wellIndexes(visual.chart.encoding, from).filter((_, p) => p !== position));
  if (from !== to) {
    const problem = wellProblem(withChart(visual, without), schema, to, field);
    if (problem) return { error: problem };
  }
  let encoding = without;
  let query = visual.query;
  if (from !== to && dst.max === 1) for (const old of wellIndexes(encoding, to)) ({ query, encoding } = dropPart(query, encoding, dst.holds, old));
  // Dropping a part may have moved this one's place up.
  const moved = src.holds === 'group' ? query.groups.indexOf(part as Group) : query.measures.indexOf(part as Measure);
  const list = wellIndexes(encoding, to);
  list.splice(Math.min(at ?? list.length, list.length), 0, moved);
  return { visual: withChart(visual, setWell(encoding, to, list), query) };
}

/** Summarise a value another way. Refused, in words, when the field can't be summarised so. */
export function setAggregate(visual: Visual, schema: ColumnSchema[], index: number, aggregate: Aggregate): EditResult {
  const m = visual.query.measures[index];
  if (!m) return { visual };
  if (m.field == null) return aggregate === 'count' ? { visual } : { error: `${AGGREGATE_INFO[aggregate].label} needs a field; the number of rows can only be counted` };
  const type = typeOf(schema, m.field) ?? '';
  const info = AGGREGATE_INFO[aggregate];
  if (!info.fits(type)) return { error: `${info.label} needs ${info.needs}; ${m.field} is ${describeType(type)}` };
  const { as: _, ...rest } = m;
  const measures = visual.query.measures.map((x, i) => (i === index ? { ...rest, aggregate } : x));
  return { visual: { ...visual, query: { ...visual.query, measures } } };
}

/** Bucket a date group by another unit, or show its values as they are. */
export function setBucket(visual: Visual, index: number, bucket: Bucket | undefined): Visual {
  const groups = visual.query.groups.map((g, i) => {
    if (i !== index) return g;
    const { bucket: _, ...rest } = g;
    return bucket ? { ...rest, bucket } : rest;
  });
  return { ...visual, query: { ...visual.query, groups } };
}

/**
 * The query a visual runs. A pie with nothing else limiting it shows its largest slices, by its value, and sums the
 * rest into one Others slice, so it never has more slices than it can show.
 */
export function effectiveQuery(visual: Visual): Query {
  const { chart, query } = visual;
  if (chart.type !== 'pie' || chart.encoding.category == null || chart.encoding.values[0] == null || query.limit) return query;
  return {
    ...query,
    sort: query.sort.length ? query.sort : [{ by: 'measure', index: chart.encoding.values[0], dir: 'desc' }],
    limit: { n: chart.options.maxSlices - 1, others: true },
  };
}

/** A new type's options, keeping those both types have (the legend, labels, number format, axis titles). */
function carriedOptions(from: ChartSpec, to: ChartType): ChartSpec['options'] {
  const fresh = defaultChart(to).options as Record<string, unknown>;
  const old = from.options as Record<string, unknown>;
  const next = Object.fromEntries(Object.keys(fresh).map((k) => [k, k in old ? old[k] : fresh[k]]));
  if ('axisTitles' in fresh) for (const k of ['xTitle', 'yTitle']) if (old[k] != null) next[k] = old[k];
  return next as ChartSpec['options'];
}

export interface Retargeted {
  visual: Visual;
  /** What didn't fit the new type, a sentence each: "A pie shows one value, so Count was dropped". */
  dropped: string[];
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'An' : 'A');

/** Switch a visual to another chart type, keeping every field that fits and saying which didn't. */
export function retarget(visual: Visual, type: ChartType, schema: ColumnSchema[]): Retargeted {
  if (visual.chart.type === type) return { visual, dropped: [] };
  const def = chartDefinition(type);
  const kind = def.label.toLowerCase().replace(/ chart$/, '');
  const a = `${article(kind)} ${kind} chart`;
  const e = visual.chart.encoding;
  const toDrop: { holds: 'group' | 'measure'; index: number; why: string }[] = [];
  const well = (id: WellId): WellDefinition | undefined => def.wells.find((w) => w.id === id);

  for (const id of ['category', 'series'] as const) {
    const index = e[id];
    if (index == null) continue;
    const w = well(id);
    const fieldType = typeOf(schema, visual.query.groups[index]!.field) ?? '';
    if (!w) toDrop.push({ holds: 'group', index, why: `${a} has no ${(wellOf(visual.chart.type, id)?.label ?? id).toLowerCase()}` });
    else if (w.kinds && !w.kinds.accepts.includes(fieldKind(fieldType))) toDrop.push({ holds: 'group', index, why: `${a}'s ${w.label.toLowerCase()} needs ${w.kinds.words}` });
  }
  const keepsSeries = e.series != null && !toDrop.some((d) => d.holds === 'group' && d.index === e.series);
  const max = well('values')?.max ?? (keepsSeries ? def.valuesWithSeries : undefined);
  if (max != null) for (const index of e.values.slice(max)) toDrop.push({ holds: 'measure', index, why: `${a} shows ${max === 1 ? 'one value' : `${max} values`}` });

  const dropped = toDrop.map((d) => `${d.why}, so ${nameOf(visual.query, d.holds, d.index)} was dropped`);
  // From the last place back, so dropping one doesn't move the others.
  let query = visual.query;
  let encoding: Encoding = e;
  for (const d of [...toDrop].sort((x, y) => y.index - x.index)) ({ query, encoding } = dropPart(query, encoding, d.holds, d.index));

  const chart = { type, encoding, options: carriedOptions(visual.chart, type) } as ChartSpec;
  return { visual: { ...visual, query, chart }, dropped };
}
