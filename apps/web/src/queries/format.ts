// How each column of a query's result is written: what kind of value it holds, how many decimals its type or summary
// gives it, the calendar unit its dates were bucketed by, and whether it is a percentage. Built on ui/format.ts, in
// the display locale, so charts write numbers and dates as the rest of the app does.
import type { DateBucket, Query } from '@wellyboot/shared';
import type { ResultColumn } from '../compiler/query';
import { decimalScale, fieldKind, type FieldKind } from '../compiler/types';
import { formatDateText, formatNumberText } from '../ui/format';
import { displayFormat, type DisplayFormat } from '../ui/locale';

export interface FormatHint {
  kind: FieldKind;
  /** Exactly this many decimals; as many as the value needs (up to 2) when not set. */
  decimals?: number;
  /** The unit dates were bucketed by, so a month reads "Mar 2026" rather than a first day. */
  granularity?: DateBucket;
  /** Values are fractions, written as percentages. */
  percent?: boolean;
}

/** What an empty group and the others row are called. */
export const EMPTY_LABEL = 'Empty';
export const OTHERS_LABEL = 'Others';

const decimalsOf = (n: number) => (Number.isInteger(n) ? 0 : (String(n).split('.')[1]?.length ?? 0));

/** A formatting hint for each column of a query's result, in the same order. */
export function formatHints(query: Query, columns: ResultColumn[]): FormatHint[] {
  return columns.map((c): FormatHint => {
    if (c.role === 'others') return { kind: 'boolean' };
    if (c.role === 'group') {
      const bucket = query.groups[c.index]!.bucket;
      if (bucket?.kind === 'date') return { kind: bucket.unit === 'hour' ? 'datetime' : 'date', granularity: bucket.unit };
      if (bucket?.kind === 'bin') return { kind: 'number', decimals: decimalsOf(bucket.width) };
      return withDecimals(fieldKind(c.fieldType ?? c.type), c.fieldType);
    }
    const m = query.measures[c.index]!;
    const percent = m.percent ? { percent: true } : {};
    if (m.aggregate === 'count' || m.aggregate === 'countDistinct') return { kind: 'number', decimals: 0, ...percent };
    if (m.aggregate === 'sum' || m.aggregate === 'min' || m.aggregate === 'max') return { ...withDecimals(fieldKind(c.fieldType ?? c.type), c.fieldType), ...percent };
    // An average or median of whole numbers isn't one; of decimals, it keeps their places.
    const scale = c.fieldType ? decimalScale(c.fieldType) : undefined;
    return { kind: 'number', ...(scale ? { decimals: scale } : {}), ...percent };
  });
}

function withDecimals(kind: FieldKind, type?: string): FormatHint {
  const decimals = kind === 'number' && type ? decimalScale(type) : undefined;
  return decimals == null ? { kind } : { kind, decimals };
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, decimals: number | undefined, percent: boolean) {
  const key = `${locale}|${decimals}|${percent}`;
  let f = numberFormats.get(key);
  if (!f) {
    const digits = decimals == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    numberFormats.set(key, (f = new Intl.NumberFormat(locale, { ...digits, ...(percent && { style: 'percent' }) })));
  }
  return f;
}

const monthFormats = new Map<string, Intl.DateTimeFormat>();
const monthFormat = (locale: string) => {
  let f = monthFormats.get(locale);
  if (!f) monthFormats.set(locale, (f = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })));
  return f;
};

/** An Arrow date or timestamp (milliseconds since 1970, UTC) as DuckDB writes it: 2026-03-01, 2026-03-01 14:00:00. */
const isoText = (ms: number, time: boolean) => {
  const iso = new Date(ms).toISOString();
  return time ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
};

/** One value of a query's result as it is shown. Empty values read "Empty". */
export function formatCell(value: unknown, hint: FormatHint, f: DisplayFormat = displayFormat()): string {
  if (value == null) return EMPTY_LABEL;
  switch (hint.kind) {
    case 'number':
      // A BIGINT past a double's precision comes back as its digits.
      if (typeof value === 'string') return formatNumberText(value, f.locale);
      return numberFormat(f.locale, hint.decimals, !!hint.percent).format(Number(value));
    case 'date':
    case 'datetime': {
      if (typeof value !== 'number') return String(value);
      const date = new Date(value);
      switch (hint.granularity) {
        case 'year':
          return String(date.getUTCFullYear());
        case 'quarter':
          return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
        case 'month':
          return monthFormat(f.locale).format(date);
        case 'week':
          return `Week of ${formatDateText(isoText(value, false), f)}`;
        case 'hour':
          return formatDateText(isoText(value, true), f).replace(/:00$/, '');
        default:
          return formatDateText(isoText(value, hint.kind === 'datetime'), f);
      }
    }
    default:
      return String(value);
  }
}
