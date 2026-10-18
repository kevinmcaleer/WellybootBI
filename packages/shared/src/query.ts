import { z } from 'zod';
import { DatasetIdZ } from './dataset.ts';

// What a visual asks of one dataset: the fields to group by (dates bucketed, numbers binned), the summaries to show,
// the filters, the sort and a top N. The web app's compiler turns it into one DuckDB SELECT; it saves with the
// dashboard, so the browser and the server read the same shape. It knows nothing of charts, so the same query can
// back a bar chart and a table.

/** Date buckets, from the coarsest. Hour keeps the time of day; the rest give a date. */
export const DATE_BUCKETS = ['year', 'quarter', 'month', 'week', 'day', 'hour'] as const;
export const DateBucketZ = z.enum(DATE_BUCKETS);
export type DateBucket = z.infer<typeof DateBucketZ>;

/** How a group's values are bucketed: dates by a calendar unit, numbers into bins of a width (0 to 10, 10 to 20). */
export const BucketZ = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('date'), unit: DateBucketZ }),
  z.strictObject({ kind: z.literal('bin'), width: z.number().positive().finite() }),
]);
export type Bucket = z.infer<typeof BucketZ>;

/** A field to group by, its name in the result (the field's own unless given), and its bucket. */
export const GroupZ = z.strictObject({
  field: z.string().min(1),
  bucket: BucketZ.optional(),
  as: z.string().trim().min(1).optional(),
});
export type Group = z.infer<typeof GroupZ>;

export const AGGREGATES = ['sum', 'avg', 'median', 'min', 'max', 'count', 'countDistinct'] as const;
export const AggregateZ = z.enum(AGGREGATES);
export type Aggregate = z.infer<typeof AggregateZ>;

/**
 * A summary: an aggregate of a field, or a count of rows (count with no field). `percent` says its values are
 * fractions to show as percentages.
 */
export const MeasureZ = z
  .strictObject({
    aggregate: AggregateZ,
    field: z.string().min(1).optional(),
    as: z.string().trim().min(1).optional(),
    percent: z.boolean().optional(),
  })
  .refine((m) => m.field != null || m.aggregate === 'count', { message: 'Only a count can go without a field.', path: ['field'] });
export type Measure = z.infer<typeof MeasureZ>;

/** Puddle's criteria operators (QUERY_CRITERIA_OPS in its src/model/schema.ts). */
export const COMPARE_OPS = ['=', '<>', '<', '<=', '>', '>='] as const;
export const TEXT_OPS = ['contains', 'starts', 'ends'] as const;
export const EMPTY_OPS = ['empty', 'notEmpty'] as const;
export const FILTER_OPS = [...COMPARE_OPS, ...TEXT_OPS, ...EMPTY_OPS, 'between', 'in', 'relative'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** A value to compare with. Dates and times are ISO text: 2026-03-01, 2026-03-01 14:00:00. */
export const FilterValueZ = z.union([z.string(), z.number().finite(), z.boolean()]);
export type FilterValue = z.infer<typeof FilterValueZ>;

export const RELATIVE_UNITS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export const RelativeUnitZ = z.enum(RELATIVE_UNITS);
export type RelativeUnit = z.infer<typeof RelativeUnitZ>;

/**
 * A stretch of time that moves with today. `last`: the n whole units before the current one (last 3 months on
 * 2026-03-14 is December to February). `this`: the whole current unit. `toDate`: the current unit up to and including
 * today (year to date).
 */
export const RelativeDateZ = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('last'), n: z.number().int().min(1).max(10_000), unit: RelativeUnitZ }),
  z.strictObject({ kind: z.literal('this'), unit: RelativeUnitZ.exclude(['day']) }),
  z.strictObject({ kind: z.literal('toDate'), unit: RelativeUnitZ.exclude(['day']) }),
]);
export type RelativeDate = z.infer<typeof RelativeDateZ>;

const field = z.string().min(1);

/** A condition on one field; a query's filters all hold at once. */
export const FilterZ = z.discriminatedUnion('op', [
  z.strictObject({ field, op: z.enum(COMPARE_OPS), value: FilterValueZ }),
  z.strictObject({ field, op: z.enum(TEXT_OPS), value: z.string() }),
  z.strictObject({ field, op: z.enum(EMPTY_OPS) }),
  z.strictObject({ field, op: z.literal('between'), from: FilterValueZ, to: FilterValueZ }),
  z.strictObject({ field, op: z.literal('in'), values: z.array(FilterValueZ) }),
  z.strictObject({ field, op: z.literal('relative'), range: RelativeDateZ }),
]);
export type Filter = z.infer<typeof FilterZ>;

/** Sort by a group or a measure of the query, by its position in `groups` or `measures`. */
export const SortZ = z.strictObject({
  by: z.enum(['group', 'measure']),
  index: z.number().int().nonnegative(),
  dir: z.enum(['asc', 'desc']),
});
export type Sort = z.infer<typeof SortZ>;

/** Keep the first n rows in sort order; with `others`, the rest are summarised as one more row. */
export const LimitZ = z.strictObject({
  n: z.number().int().min(1).max(1_000_000),
  others: z.boolean().default(false),
});
export type Limit = z.infer<typeof LimitZ>;

export const QueryZ = z.strictObject({
  datasetId: DatasetIdZ,
  groups: z.array(GroupZ).default([]),
  measures: z.array(MeasureZ).default([]),
  filters: z.array(FilterZ).default([]),
  sort: z.array(SortZ).default([]),
  limit: LimitZ.optional(),
  /** Reserved for calculated fields, so they can arrive without a format migration. Always empty for now. */
  expressions: z.array(z.never()).max(0).optional(),
});
export type Query = z.infer<typeof QueryZ>;
export type QueryInput = z.input<typeof QueryZ>;

/** A new visual's query: a count of rows, ungrouped. */
export const DEFAULT_QUERY = { groups: [], measures: [{ aggregate: 'count' }], filters: [], sort: [] } as const satisfies Omit<QueryInput, 'datasetId'>;

export const isDateBucket = (b: Bucket | undefined): b is Extract<Bucket, { kind: 'date' }> => b?.kind === 'date';
export const isBin = (b: Bucket | undefined): b is Extract<Bucket, { kind: 'bin' }> => b?.kind === 'bin';
export const isCountRows = (m: Measure) => m.aggregate === 'count' && m.field == null;
export const hasValue = (f: Filter): f is Extract<Filter, { value: unknown }> => 'value' in f;
