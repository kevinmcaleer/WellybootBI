// What each kind of field can be summarised, bucketed and compared with, after Puddle's src/compiler/types.ts.
// Field kinds come from DuckDB types (datasets/fields.ts), so the picker's type tags and the compiler agree.
import type { Aggregate, Bucket, FilterValue } from '@wellyboot/shared';
import { fieldKind, isOrderable, type FieldKind } from '../datasets/fields';

export { fieldKind, type FieldKind };

const KIND_WORDS: Record<FieldKind, string> = {
  number: 'a number',
  text: 'text',
  date: 'a date',
  datetime: 'a date and time',
  time: 'a time',
  boolean: 'true or false',
};

/** A type in words, to finish "Region is …": "a number", "text", "a date". */
export const describeType = (type: string) => KIND_WORDS[fieldKind(type)];

/** Dates and timestamps compare with each other; otherwise a kind fits only itself. */
const family = (k: FieldKind) => (k === 'datetime' ? 'date' : k);

/** Whether values of two DuckDB types can meet without a cast (in a filter, or one dashboard filter across datasets). */
export const typesFit = (a: string, b: string) => family(fieldKind(a)) === family(fieldKind(b));

export const isIntegerType = (type: string) => /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)$/i.test(type.trim());

/** DECIMAL(18,3) has 3 decimals; other types none that the type itself fixes. */
export function decimalScale(type: string): number | undefined {
  const m = /^DECIMAL\s*\(\s*\d+\s*,\s*(\d+)\s*\)$/i.exec(type.trim());
  if (m) return Number(m[1]);
  if (isIntegerType(type)) return 0;
  return undefined;
}

/** TIMESTAMP WITH TIME ZONE: its date functions need DuckDB's icu extension, which the app doesn't load. */
export const isZonedType = (type: string) => /^TIMESTAMP\s*WITH\s*TIME\s*ZONE$|^TIMESTAMPTZ$/i.test(type.trim());

export const isDecimalType = (type: string) => /^DECIMAL/i.test(type.trim());

interface AggregateInfo {
  label: string;
  /** Whether a field of this DuckDB type can be summarised this way. */
  fits: (type: string) => boolean;
  /** What it needs, to finish "Sum needs …". */
  needs: string;
}

const numeric = (type: string) => fieldKind(type) === 'number';

export const AGGREGATE_INFO: Record<Aggregate, AggregateInfo> = {
  sum: { label: 'Sum', fits: numeric, needs: 'a number' },
  avg: { label: 'Average', fits: numeric, needs: 'a number' },
  median: { label: 'Median', fits: numeric, needs: 'a number' },
  min: { label: 'Min', fits: isOrderable, needs: 'values that can be put in order' },
  max: { label: 'Max', fits: isOrderable, needs: 'values that can be put in order' },
  count: { label: 'Count', fits: () => true, needs: 'a field' },
  countDistinct: { label: 'Count distinct', fits: () => true, needs: 'a field' },
};

const DATE_BUCKET_LABEL = { year: 'A year', quarter: 'A quarter', month: 'A month', week: 'A week', day: 'A day', hour: 'An hour' } as const;

/** Why a field can't be bucketed this way, or undefined when it can. */
export function bucketProblem(bucket: Bucket, field: string, type: string): string | undefined {
  const kind = fieldKind(type);
  if (bucket.kind === 'bin') return kind === 'number' ? undefined : `Bins need a number; ${field} is ${describeType(type)}`;
  if (bucket.unit === 'hour') return kind === 'datetime' ? undefined : `An hour bucket needs a date and time; ${field} is ${describeType(type)}`;
  return kind === 'date' || kind === 'datetime' ? undefined : `${DATE_BUCKET_LABEL[bucket.unit]} bucket needs a date; ${field} is ${describeType(type)}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;
const TIME = /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

/** A number given as a number or as its text. */
export const asNumber = (v: FilterValue): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim()))) return Number(v.trim());
  return undefined;
};

export const asBoolean = (v: FilterValue): boolean | undefined => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined);

/** Whether a filter value can be compared with a field of this type: a number with a number, ISO text with a date. */
export function valueFits(v: FilterValue, type: string): boolean {
  switch (fieldKind(type)) {
    case 'number':
      return asNumber(v) !== undefined;
    case 'boolean':
      return asBoolean(v) !== undefined;
    case 'date':
      return typeof v === 'string' && DATE.test(v.trim());
    case 'datetime':
      return typeof v === 'string' && DATETIME.test(v.trim());
    case 'time':
      return typeof v === 'string' && TIME.test(v.trim());
    case 'text':
      return true;
  }
}
