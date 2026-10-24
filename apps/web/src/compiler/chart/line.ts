// Lines: values along a date or a number, one line per series, with a point at each value to hover.
import type { LineOptions } from '@wellyboot/shared';
import { describe, frame, names, seriesColour, tooltip } from './common';
import { axisFormat, chartPoints, F, groupColumn, measureColumn, valueAxis, type Point } from './data';
import { defineChart } from './define';

/**
 * In order along the axis, so each line's points and the axis's categories run left to right whatever the query's
 * sort; empty dates last.
 */
const alongAxis = (a: Point, b: Point) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.i - b.i;

export const line = defineChart({
  type: 'line',
  label: 'Line chart',
  wells: [
    { id: 'category', label: 'Axis', holds: 'group', max: 1, kinds: { accepts: ['date', 'datetime', 'time', 'number'], words: 'a date or a number' }, empty: 'Drag a date here' },
    { id: 'values', label: 'Values', holds: 'measure', empty: 'Drag fields here to measure' },
    { id: 'series', label: 'Legend', holds: 'group', max: 1, empty: 'Drag a field here for a line each' },
    { id: 'tooltips', label: 'Tooltips', holds: 'measure', empty: 'Drag fields here to show on hover' },
  ],
  valuesWithSeries: 1,
  compile(visual, result, ctx) {
    const options = visual.chart.options as LineOptions;
    const cat = groupColumn(result, visual.chart.encoding.category);
    const numericX = cat?.hint.kind === 'number';
    // The others row of a top N has no place along an axis.
    const points = chartPoints(visual, result, { numericX, display: ctx.display })
      .filter((p) => !p.others)
      .sort(alongAxis);
    const n = names(visual, result);
    const first = measureColumn(result, visual.chart.encoding.values[0] ?? -1);
    const split = n.series ?? (n.values.length > 1 ? 'Value' : undefined);
    const titles = options.axisTitles;
    const encoding = {
      x: numericX
        ? { field: F.x, type: 'quantitative', title: titles ? (options.xTitle ?? n.category ?? null) : null, scale: { zero: false }, axis: { format: axisFormat(cat!.hint, 'auto') } }
        : { field: F.xLabel, type: 'ordinal', sort: null, title: titles ? (options.xTitle ?? n.category ?? null) : null, axis: { labelOverlap: true, labelAngle: 0 } },
      y: { field: F.value, type: 'quantitative', title: titles ? (options.yTitle ?? (n.values.length === 1 ? n.values[0] : null)) : null, axis: valueAxis(first?.hint, options.numberFormat) },
      ...(split && { color: seriesColour(options, ctx, split) }),
    };
    return frame(visual, points, ctx, describe('Line chart', visual, result, points.length, 'point'), {
      encoding,
      layer: [
        { mark: { type: 'line', interpolate: 'linear' } },
        // Points carry the tooltip; with points off they are there but unseen, so hovering still reads a value.
        { mark: { type: 'point', opacity: options.points ? 1 : 0 }, encoding: { tooltip: tooltip(visual, result) } },
        ...(options.labels ? [{ mark: { type: 'text', baseline: 'bottom', dy: -6 }, encoding: { text: { field: F.valueLabel } } }] : []),
      ],
    });
  },
});
