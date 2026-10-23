import { z } from 'zod';
import { DatasetIdZ } from './dataset.ts';
import { QueryZ } from './query.ts';

// One chart: the dataset it reads, the query it asks (query.ts), and how the query's columns are drawn. The query
// does all the summarising, in DuckDB; the chart only says which of its groups and measures go where. Saved with the
// dashboard from Phase 5, so the browser and the server read the same shape.

export const CHART_TYPES = ['bar', 'line', 'pie'] as const;
export const ChartTypeZ = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof ChartTypeZ>;

const place = z.number().int().nonnegative();

/**
 * Which of the query's columns plays which part, by place in its `groups` or `measures`: the category along the axis
 * (the slices of a pie), the values drawn, a group splitting each category into coloured series, and measures shown
 * only in the tooltip.
 */
export const EncodingZ = z.strictObject({
  category: place.optional(),
  values: z.array(place).default([]),
  series: place.optional(),
  tooltips: z.array(place).default([]),
});
export type Encoding = z.infer<typeof EncodingZ>;

export const LEGEND_POSITIONS = ['right', 'bottom', 'top', 'left', 'none'] as const;
/** How a chart writes its numbers: as the query's types say, whole, two decimals, compact (1.2K), or percentages. */
export const NUMBER_FORMATS = ['auto', 'whole', 'decimal', 'compact', 'percent'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];
/** The design system's series colours, or one colour (the brand's) for every series. */
export const COLOUR_SCHEMES = ['categorical', 'brand'] as const;
export type ColourScheme = (typeof COLOUR_SCHEMES)[number];
export type LegendPosition = (typeof LEGEND_POSITIONS)[number];

const BaseOptionsZ = z.strictObject({
  showTitle: z.boolean().default(true),
  /** Write each value on its bar, point or slice. */
  labels: z.boolean().default(false),
  legend: z.enum(LEGEND_POSITIONS).default('right'),
  numberFormat: z.enum(NUMBER_FORMATS).default('auto'),
  colours: z.enum(COLOUR_SCHEMES).default('categorical'),
});

const AxisOptions = {
  axisTitles: z.boolean().default(true),
  /** In place of the field's name. */
  xTitle: z.string().trim().min(1).optional(),
  yTitle: z.string().trim().min(1).optional(),
};

export const BarOptionsZ = BaseOptionsZ.extend({ ...AxisOptions, orientation: z.enum(['vertical', 'horizontal']).default('vertical') });
export const LineOptionsZ = BaseOptionsZ.extend({ ...AxisOptions, points: z.boolean().default(true) });
/** A pie shows its largest slices; the rest make one Others slice. */
export const PieOptionsZ = BaseOptionsZ.extend({ maxSlices: z.number().int().min(2).max(50).default(8) });

export const ChartSpecZ = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bar'), encoding: EncodingZ.prefault({}), options: BarOptionsZ.prefault({}) }),
  z.strictObject({ type: z.literal('line'), encoding: EncodingZ.prefault({}), options: LineOptionsZ.prefault({}) }),
  z.strictObject({ type: z.literal('pie'), encoding: EncodingZ.prefault({}), options: PieOptionsZ.prefault({}) }),
]);
export type ChartSpec = z.infer<typeof ChartSpecZ>;
export type ChartSpecInput = z.input<typeof ChartSpecZ>;
export type BarOptions = z.infer<typeof BarOptionsZ>;
export type LineOptions = z.infer<typeof LineOptionsZ>;
export type PieOptions = z.infer<typeof PieOptionsZ>;
export type ChartOptions = ChartSpec['options'];

/** How much of a dashboard's grid a visual would like: columns of twelve, and rows. Phase 5 lays them out. */
export const SizeZ = z.strictObject({
  cols: z.number().int().min(1).max(12),
  rows: z.number().int().min(1).max(48),
});
export type Size = z.infer<typeof SizeZ>;

export const VisualZ = z
  .strictObject({
    id: z.string().min(1),
    name: z.string(),
    datasetId: DatasetIdZ,
    query: QueryZ,
    chart: ChartSpecZ,
    size: SizeZ.optional(),
    notes: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.query.datasetId !== v.datasetId) ctx.addIssue({ code: 'custom', path: ['query', 'datasetId'], message: 'The query reads another dataset than the visual.' });
    const { category, values, series, tooltips } = v.chart.encoding;
    const groups = v.query.groups.length;
    const measures = v.query.measures.length;
    const at = (...path: (string | number)[]) => ['chart', 'encoding', ...path];
    if (category != null && category >= groups) ctx.addIssue({ code: 'custom', path: at('category'), message: `The query has no group ${category + 1}.` });
    if (series != null && series >= groups) ctx.addIssue({ code: 'custom', path: at('series'), message: `The query has no group ${series + 1}.` });
    if (series != null && series === category) ctx.addIssue({ code: 'custom', path: at('series'), message: 'The legend and the axis show the same group.' });
    values.forEach((m, i) => m >= measures && ctx.addIssue({ code: 'custom', path: at('values', i), message: `The query has no measure ${m + 1}.` }));
    tooltips.forEach((m, i) => m >= measures && ctx.addIssue({ code: 'custom', path: at('tooltips', i), message: `The query has no measure ${m + 1}.` }));
    if (v.chart.type === 'pie') {
      if (values.length > 1) ctx.addIssue({ code: 'custom', path: at('values'), message: 'A pie shows one value.' });
      if (series != null) ctx.addIssue({ code: 'custom', path: at('series'), message: 'A pie has no legend field; its slices are its categories.' });
    }
  });
export type Visual = z.infer<typeof VisualZ>;
export type VisualInput = z.input<typeof VisualZ>;

/** A chart of a type with nothing in its wells, and every option at its default. */
export const defaultChart = (type: ChartType): ChartSpec => ChartSpecZ.parse({ type });

/** A new visual over a dataset: an empty bar chart, until fields are added. */
export const newVisual = (id: string, datasetId: string, type: ChartType = 'bar'): Visual =>
  VisualZ.parse({ id, name: 'Untitled chart', datasetId, query: { datasetId }, chart: { type } });
