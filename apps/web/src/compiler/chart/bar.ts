// Bars: one per category, side by side for each series (stacking comes in Phase 9), upright or lying down.
import type { BarOptions } from '@wellyboot/shared';
import { describe, frame, names, seriesColour, tooltip } from './common';
import { chartPoints, F, measureColumn, valueAxis } from './data';
import { defineChart } from './define';

export const bar = defineChart({
  type: 'bar',
  label: 'Bar chart',
  wells: [
    { id: 'category', label: 'Axis', holds: 'group', max: 1, empty: 'Drag a field here for the bars' },
    { id: 'values', label: 'Values', holds: 'measure', empty: 'Drag fields here to measure' },
    { id: 'series', label: 'Legend', holds: 'group', max: 1, empty: 'Drag a field here to split the bars' },
    { id: 'tooltips', label: 'Tooltips', holds: 'measure', empty: 'Drag fields here to show on hover' },
  ],
  valuesWithSeries: 1,
  compile(visual, result, ctx) {
    const options = visual.chart.options as BarOptions;
    const points = chartPoints(visual, result, { display: ctx.display });
    const n = names(visual, result);
    const first = measureColumn(result, visual.chart.encoding.values[0] ?? -1);
    const split = n.series ?? (n.values.length > 1 ? 'Value' : undefined);
    const horizontal = options.orientation === 'horizontal';
    const [cat, val] = horizontal ? ['y', 'x'] : ['x', 'y'];
    const titles = options.axisTitles;
    const encoding = {
      [cat]: { field: F.xLabel, type: 'nominal', sort: null, title: titles ? (options.xTitle ?? n.category ?? null) : null, axis: { labelOverlap: true } },
      [val]: { field: F.value, type: 'quantitative', title: titles ? (options.yTitle ?? (n.values.length === 1 ? n.values[0] : null)) : null, axis: valueAxis(first?.hint, options.numberFormat) },
      ...(split && { color: seriesColour(options, ctx, split), [`${cat}Offset`]: { field: F.series, sort: null } }),
      tooltip: tooltip(visual, result),
    };
    const labels = horizontal
      ? { type: 'text', align: 'left', baseline: 'middle', dx: 3 }
      : { type: 'text', align: 'center', baseline: 'bottom', dy: -2 };
    return frame(visual, points, ctx, describe('Bar chart', visual, result, points.length, 'bar'), {
      encoding,
      layer: [{ mark: { type: 'bar' } }, ...(options.labels ? [{ mark: labels, encoding: { text: { field: F.valueLabel } } }] : [])],
    });
  },
});
