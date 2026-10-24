// A query's result reshaped for Vega-Lite: one point per category, series and value, already summarised by DuckDB.
// The spec only names these fields, so a column called "a.b" or "x" can't be misread, and every label is written
// here, in the display locale, the way the rest of the app writes numbers and dates.
import type { NumberFormat, Visual } from '@wellyboot/shared';
import { OTHERS_COLUMN, type ResultColumn } from '../query';
import { EMPTY_LABEL, formatCell, OTHERS_LABEL, type FormatHint } from '../../queries/format';
import type { DisplayFormat } from '../../ui/locale';

export interface ChartColumn extends ResultColumn {
  hint: FormatHint;
}

/** What a chart is drawn from: the query's columns and rows (a QueryRun). */
export interface ChartResult {
  columns: ChartColumn[];
  rows: Record<string, unknown>[];
}

/** One mark's data. */
export interface Point {
  /** Its place in the result, to keep the query's order. */
  i: number;
  /** The category's value: a number for a numeric axis, otherwise its label. */
  x: number | string;
  xLabel: string;
  /** The category's raw value when it is a number or a date (milliseconds), to order a line's points by. */
  at?: number;
  /** The series it belongs to: the legend field's label, or the value's name when several values are drawn. */
  series?: string;
  value: number | null;
  valueLabel: string;
  /** Its share of the whole, for pies. */
  share?: number;
  shareLabel?: string;
  others: boolean;
  /** Tooltip extras, written out: tip0, tip1 … */
  [tip: `tip${number}`]: string;
}

/** The fields Point carries, as the specs name them. */
export const F = { i: 'i', x: 'x', xLabel: 'xLabel', series: 'series', value: 'value', valueLabel: 'valueLabel', share: 'share', shareLabel: 'shareLabel' } as const;
export const tipField = (k: number) => `tip${k}` as const;

export const groupColumn = (r: ChartResult, index: number | undefined) => (index == null ? undefined : r.columns.find((c) => c.role === 'group' && c.index === index));
export const measureColumn = (r: ChartResult, index: number) => r.columns.find((c) => c.role === 'measure' && c.index === index);

/** A number from a result cell; DuckDB's widest integers arrive as their digits. */
const toNumber = (v: unknown): number | null => (v == null ? null : typeof v === 'number' ? v : Number(v));

/** A value's hint under the chart's number format. */
export function valueHint(hint: FormatHint, format: NumberFormat): FormatHint {
  switch (format) {
    case 'whole':
      return { ...hint, decimals: 0, percent: false };
    case 'decimal':
      return { ...hint, decimals: 2, percent: false };
    case 'percent':
      return { kind: 'number', percent: true };
    default:
      return hint;
  }
}

const compactFormats = new Map<string, Intl.NumberFormat>();

/** A value as the chart writes it in labels and tooltips. */
export function formatValue(v: unknown, hint: FormatHint, format: NumberFormat, display?: DisplayFormat): string {
  if (format === 'compact' && v != null) {
    const locale = display?.locale ?? 'en-GB';
    let f = compactFormats.get(locale);
    if (!f) compactFormats.set(locale, (f = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })));
    return f.format(Number(v));
  }
  return formatCell(v, valueHint(hint, format), display);
}

/** The d3 number format for a value axis, matching the labels. */
export function axisFormat(hint: FormatHint, format: NumberFormat): string {
  const h = valueHint(hint, format);
  if (format === 'compact') return '.3~s';
  if (h.percent) return '.0%';
  return h.decimals == null ? ',~f' : `,.${h.decimals}f`;
}

/**
 * A value axis: its format, and for whole numbers (counts, say) ticks a whole number apart, so a small range isn't
 * ticked at halves that the format rounds to the same label twice.
 */
export function valueAxis(hint: FormatHint | undefined, format: NumberFormat): { format: string; tickMinStep?: number } {
  if (!hint) return { format: ',~f' };
  const h = valueHint(hint, format);
  return h.decimals === 0 && !h.percent ? { format: axisFormat(hint, format), tickMinStep: 1 } : { format: axisFormat(hint, format) };
}

const label = (v: unknown, hint: FormatHint, others: boolean, display?: DisplayFormat) => (others ? OTHERS_LABEL : v == null ? EMPTY_LABEL : formatCell(v, hint, display));

/**
 * The points of a chart: for each row, one per value drawn. The category's raw value is kept when the axis is
 * numeric (`numericX`); otherwise the label stands for it.
 */
export function chartPoints(visual: Visual, result: ChartResult, opts: { numericX?: boolean; display?: DisplayFormat } = {}): Point[] {
  const { encoding, options } = visual.chart;
  const cat = groupColumn(result, encoding.category);
  const ser = groupColumn(result, encoding.series);
  const values = encoding.values.map((m) => measureColumn(result, m)).filter((c): c is ChartColumn => !!c);
  const tips = encoding.tooltips.map((m) => measureColumn(result, m)).filter((c): c is ChartColumn => !!c);
  const several = values.length > 1;
  const points: Point[] = [];
  result.rows.forEach((row, i) => {
    const others = row[OTHERS_COLUMN] === true;
    for (const col of values) {
      const raw = cat ? row[cat.name] : undefined;
      const xLabel = cat ? label(raw, cat.hint, others, opts.display) : col.name;
      const series = ser ? label(row[ser.name], ser.hint, others, opts.display) : several ? col.name : undefined;
      const value = toNumber(row[col.name]);
      const p: Point = {
        i,
        x: opts.numericX && cat && raw != null ? Number(raw) : xLabel,
        xLabel,
        ...(typeof raw === 'number' && !others && { at: raw }),
        ...(series != null && { series }),
        value,
        valueLabel: formatValue(value, col.hint, options.numberFormat, opts.display),
        others,
      };
      tips.forEach((t, k) => (p[tipField(k)] = formatValue(row[t.name], t.hint, options.numberFormat, opts.display)));
      points.push(p);
    }
  });
  return points;
}

const shareFormats = new Map<string, Intl.NumberFormat>();

/** Each point's share of the positive total, for a pie's tooltips and labels. */
export function withShares(points: Point[], display?: DisplayFormat): Point[] {
  const total = points.reduce((sum, p) => sum + (p.value != null && p.value > 0 ? p.value : 0), 0);
  const locale = display?.locale ?? 'en-GB';
  let f = shareFormats.get(locale);
  if (!f) shareFormats.set(locale, (f = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })));
  return points.map((p) => {
    const share = total > 0 && p.value != null && p.value > 0 ? p.value / total : 0;
    return { ...p, share, shareLabel: f.format(share) };
  });
}
