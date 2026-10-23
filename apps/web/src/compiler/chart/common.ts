// What every chart type's spec shares: the data, title, description, size, theme, legend and tooltip.
import type { ChartOptions, Visual } from '@wellyboot/shared';
import type { TopLevelSpec } from 'vega-lite';
import type { CompileContext } from './define';
import { F, groupColumn, measureColumn, tipField, type ChartResult, type Point } from './data';
import { chartConfig, seriesPalette } from './theme';

type Encoding = Record<string, unknown>;

/** The names of what a chart draws, for its description and titles. */
export function names(visual: Visual, result: ChartResult) {
  const e = visual.chart.encoding;
  return {
    category: groupColumn(result, e.category)?.name,
    series: groupColumn(result, e.series)?.name,
    values: e.values.map((m) => measureColumn(result, m)?.name).filter((n): n is string => !!n),
    tooltips: e.tooltips.map((m) => measureColumn(result, m)?.name ?? ''),
  };
}

const list = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** A chart in a sentence, for screen readers: "Bar chart of Sum of amount by Region, 4 bars". */
export function describe(kind: string, visual: Visual, result: ChartResult, marks: number, markWord: string): string {
  const n = names(visual, result);
  const by = [n.category, n.series].filter(Boolean) as string[];
  return `${kind} of ${list(n.values) || 'nothing yet'}${by.length ? ` by ${list(by)}` : ''}, ${marks} ${markWord}${marks === 1 ? '' : 's'}`;
}

/** The tooltip: the category, the series, the value, then the extras, all as the chart writes them. */
export function tooltip(visual: Visual, result: ChartResult, extra: Encoding[] = []): Encoding[] {
  const n = names(visual, result);
  const several = n.values.length > 1;
  return [
    ...(n.category ? [{ field: F.xLabel, type: 'nominal', title: n.category }] : []),
    ...(n.series ? [{ field: F.series, type: 'nominal', title: n.series }] : several ? [{ field: F.series, type: 'nominal', title: 'Value' }] : []),
    { field: F.valueLabel, type: 'nominal', title: several ? 'Amount' : (n.values[0] ?? 'Value') },
    ...extra,
    ...n.tooltips.map((title, k) => ({ field: tipField(k), type: 'nominal', title })),
  ];
}

/** The colour channel for series: a legend where asked, the design system's colours or the brand's alone. */
export function seriesColour(options: ChartOptions, ctx: CompileContext, title: string | undefined, field: string = F.series): Encoding {
  return {
    field,
    type: 'nominal',
    sort: null,
    title: title ?? null,
    ...(options.colours === 'brand' && { scale: { range: [seriesPalette(ctx.mode)[0]] } }),
    legend: options.legend === 'none' ? null : { orient: options.legend },
  };
}

/** The spec's outside: data, size, theme, title and description. */
export function frame(visual: Visual, points: Point[], ctx: CompileContext, description: string, body: Record<string, unknown>): TopLevelSpec {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description,
    ...(visual.chart.options.showTitle && visual.name.trim() && { title: visual.name.trim() }),
    data: { values: points },
    width: 'container',
    height: 'container',
    autosize: { type: 'fit', contains: 'padding' },
    config: chartConfig(ctx.mode),
    ...body,
  } as TopLevelSpec;
}
