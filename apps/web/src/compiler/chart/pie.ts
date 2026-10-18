// A pie: one slice per category, its share of the whole in the tooltip. The largest slices are kept and the rest
// summed into Others by the query's top N (visuals/encode.ts sets it), so the pie stays readable.
import type { PieOptions } from '@wellyboot/shared';
import { describe, frame, names, seriesColour, tooltip } from './common';
import { chartPoints, F, withShares } from './data';
import { defineChart } from './define';

/** The pie's radius, leaving room for labels outside it when they are on. */
const radius = (labels: boolean) => (labels ? 'min(width, height) / 2 - 24' : 'min(width, height) / 2');

export const pie = defineChart({
  type: 'pie',
  label: 'Pie chart',
  wells: [
    { id: 'category', label: 'Legend', holds: 'group', max: 1, empty: 'Drag a field here for the slices' },
    { id: 'values', label: 'Values', holds: 'measure', max: 1, empty: 'Drag a field here to size the slices' },
    { id: 'tooltips', label: 'Tooltips', holds: 'measure', empty: 'Drag fields here to show on hover' },
  ],
  compile(visual, result, ctx) {
    const options = visual.chart.options as PieOptions;
    const points = withShares(chartPoints(visual, result, { display: ctx.display }), ctx.display);
    const n = names(visual, result);
    return frame(visual, points, ctx, describe('Pie chart', visual, result, points.length, 'slice'), {
      encoding: {
        theta: { field: F.value, type: 'quantitative', stack: true },
        color: seriesColour(options, ctx, n.category, F.xLabel),
        order: { field: F.i, type: 'quantitative' },
        tooltip: tooltip(visual, result, [{ field: F.shareLabel, type: 'nominal', title: 'Share' }]),
      },
      layer: [
        { mark: { type: 'arc', outerRadius: { expr: radius(options.labels) } } },
        ...(options.labels ? [{ mark: { type: 'text', radius: { expr: `${radius(true)} + 14` } }, encoding: { text: { field: F.shareLabel } } }] : []),
      ],
    });
  },
});
