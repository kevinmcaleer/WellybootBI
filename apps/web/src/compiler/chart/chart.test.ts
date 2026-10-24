import { VisualZ, type ChartSpecInput, type ColumnSchema, type Query, type QueryInput, type Visual } from '@wellyboot/shared';
import Ajv from 'ajv';
import { compile, type TopLevelSpec } from 'vega-lite';
import schema from 'vega-lite/vega-lite-schema.json';
import { formatHints } from '../../queries/format';
import { describeQuery } from '../query';
import { chartProblem, compileChart, themeColours, tokenColour, type ChartResult, type ThemeMode } from './index';
import { seriesPalette } from './theme';

const DS = 'sales0001';
const SCHEMA: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,2)' },
  { name: 'units', type: 'BIGINT' },
  { name: 'placed', type: 'DATE' },
  { name: 'rep', type: 'VARCHAR' },
];
const display = { locale: 'en-GB', dates: 'locale' as const };

/** A visual and a result as runQuery would give it, from rows keyed by the result's column names. */
function chart(query: Omit<QueryInput, 'datasetId'>, spec: ChartSpecInput, rows: Record<string, unknown>[], name = 'Sales'): { visual: Visual; result: ChartResult } {
  const visual = VisualZ.parse({ id: 'v1', name, datasetId: DS, query: { datasetId: DS, ...query }, chart: spec });
  const columns = describeQuery(visual.query as Query, SCHEMA);
  const hints = formatHints(visual.query, columns);
  return { visual, result: { columns: columns.map((c, i) => ({ ...c, hint: hints[i]! })), rows } };
}

const byRegion = (spec: ChartSpecInput = { type: 'bar', encoding: { category: 0, values: [0] } }) =>
  chart({ groups: [{ field: 'Region' }], measures: [{ aggregate: 'sum', field: 'amount' }, { aggregate: 'count' }] }, spec, [
    { Region: 'North', 'Sum of amount': 30.75, Count: 2 },
    { Region: 'South', 'Sum of amount': 12.75, Count: 3 },
    { Region: null, 'Sum of amount': 7, Count: 2 },
  ]);

const byMonthAndRep = (spec: ChartSpecInput) =>
  chart({ groups: [{ field: 'placed', bucket: { kind: 'date', unit: 'month' } }, { field: 'rep' }], measures: [{ aggregate: 'sum', field: 'units' }] }, spec, [
    { placed: Date.UTC(2026, 1, 1), rep: 'Bob', 'Sum of units': 12 },
    { placed: Date.UTC(2026, 0, 1), rep: 'Ann', 'Sum of units': 3 },
    { placed: Date.UTC(2026, 1, 1), rep: 'Ann', 'Sum of units': 1 },
  ]);

const byUnits = chart({ groups: [{ field: 'units', bucket: { kind: 'bin', width: 5 } }], measures: [{ aggregate: 'count' }] }, { type: 'line', encoding: { category: 0, values: [0] } }, [
  { units: 5, Count: 5 },
  { units: 0, Count: 4 },
]);

const topRegions = chart(
  { groups: [{ field: 'Region' }], measures: [{ aggregate: 'sum', field: 'units' }], sort: [{ by: 'measure', index: 0, dir: 'desc' }], limit: { n: 2, others: true } },
  { type: 'pie', encoding: { category: 0, values: [0] }, options: { labels: true } },
  [
    { Region: 'East', 'Sum of units': 6, __others: false },
    { Region: 'South', 'Sum of units': 12, __others: false },
    { Region: null, 'Sum of units': 37, __others: true },
  ],
);

/** Every kind of chart the compiler makes, for the checks that hold for all of them. */
const CASES: Record<string, { visual: Visual; result: ChartResult }> = {
  'a bar chart': byRegion(),
  'bars lying down, labelled, without titles': byRegion({ type: 'bar', encoding: { category: 0, values: [0] }, options: { orientation: 'horizontal', labels: true, axisTitles: false } }),
  'bars of two values': byRegion({ type: 'bar', encoding: { category: 0, values: [0, 1] }, options: { legend: 'bottom' } }),
  'bars split by a legend, in the brand colour': byMonthAndRep({ type: 'bar', encoding: { category: 0, series: 1, values: [0] }, options: { colours: 'brand', legend: 'none' } }),
  'bars with a tooltip extra and compact numbers': byRegion({ type: 'bar', encoding: { category: 0, values: [0], tooltips: [1] }, options: { numberFormat: 'compact' } }),
  'a line over months, one per rep': byMonthAndRep({ type: 'line', encoding: { category: 0, series: 1, values: [0] }, options: { points: false, labels: true } }),
  'a line over a number': byUnits,
  'a pie with labels and others': topRegions,
  'a pie in the brand colour': byRegion({ type: 'pie', encoding: { category: 0, values: [1] }, options: { colours: 'brand', legend: 'bottom' } }),
};

const specOf = (c: { visual: Visual; result: ChartResult }, mode: ThemeMode = 'light') => compileChart(c.visual, c.result, { mode, display });
const data = (spec: TopLevelSpec) => (spec as { data: { values: Record<string, unknown>[] } }).data.values;

describe('compileChart', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  describe.each(Object.entries(CASES))('%s', (_, c) => {
    it.each(['light', 'dark'] as const)('validates against the Vega-Lite schema and compiles to Vega (%s)', (mode) => {
      const spec = specOf(c, mode);
      expect(validate(spec), JSON.stringify(validate.errors, null, 2)).toBe(true);
      expect(() => compile(spec)).not.toThrow();
    });

    it.each(['light', 'dark'] as const)('has no colour but the theme’s (%s)', (mode) => {
      const allowed = themeColours(mode);
      const hexes = JSON.stringify(specOf(c, mode)).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexes.filter((h) => !allowed.has(h.toLowerCase()))).toEqual([]);
    });

    it('never asks Vega-Lite to aggregate', () => {
      expect(JSON.stringify(specOf(c))).not.toMatch(/"(aggregate|bin|timeUnit)"/);
    });
  });

  it('draws a bar chart from the summarised rows', () => {
    expect(specOf(CASES['a bar chart']!)).toMatchSnapshot();
  });

  it('draws a line over months, ordered along the axis', () => {
    const spec = specOf(CASES['a line over months, one per rep']!);
    expect(data(spec).map((p) => [p.xLabel, p.series, p.value])).toEqual([
      ['Jan 2026', 'Ann', 3],
      ['Feb 2026', 'Bob', 12],
      ['Feb 2026', 'Ann', 1],
    ]);
    expect(spec).toMatchSnapshot();
  });

  it('draws a line over a number on a numeric axis', () => {
    const spec = specOf(byUnits) as { encoding: { x: { type: string; field: string } } };
    expect(spec.encoding.x).toMatchObject({ field: 'x', type: 'quantitative' });
    expect(data(spec as TopLevelSpec).map((p) => p.x)).toEqual([0, 5]);
  });

  it('ticks a count a whole number apart, so its labels never repeat', () => {
    const y = (c: { visual: Visual; result: ChartResult }) => (specOf(c) as { encoding: { y: { axis: { format: string; tickMinStep?: number } } } }).encoding.y.axis;
    expect(y(byUnits)).toEqual({ format: ',.0f', tickMinStep: 1 });
    // A sum of decimals can be ticked between whole numbers.
    expect(y(byRegion({ type: 'line', encoding: { category: 0, values: [0] } })).tickMinStep).toBeUndefined();
    expect(y(byRegion({ type: 'line', encoding: { category: 0, values: [0] }, options: { numberFormat: 'whole' } })).tickMinStep).toBe(1);
  });

  it('draws a pie with each slice’s share and an Others slice', () => {
    const spec = specOf(topRegions);
    expect(data(spec).map((p) => [p.xLabel, p.valueLabel, p.shareLabel])).toEqual([
      ['East', '6', '10.9%'],
      ['South', '12', '21.8%'],
      ['Others', '37', '67.3%'],
    ]);
    expect(spec).toMatchSnapshot();
  });

  it('labels empty groups and writes values as the app does', () => {
    const spec = specOf(byRegion({ type: 'bar', encoding: { category: 0, values: [0] }, options: { numberFormat: 'decimal' } }));
    expect(data(spec).map((p) => [p.xLabel, p.valueLabel])).toEqual([
      ['North', '30.75'],
      ['South', '12.75'],
      ['Empty', '7.00'],
    ]);
  });

  it('draws two values as series named after them', () => {
    const spec = specOf(CASES['bars of two values']!);
    expect(data(spec).map((p) => p.series)).toEqual(['Sum of amount', 'Count', 'Sum of amount', 'Count', 'Sum of amount', 'Count']);
    expect((spec as { encoding: { xOffset: unknown } }).encoding.xOffset).toEqual({ field: 'series', sort: null });
  });

  it('describes itself for screen readers', () => {
    expect((specOf(CASES['a bar chart']!) as { description: string }).description).toBe('Bar chart of Sum of amount by Region, 3 bars');
    expect((specOf(CASES['a line over months, one per rep']!) as { description: string }).description).toBe('Line chart of Sum of units by placed and rep, 3 points');
  });

  it('takes its colours and fonts from the theme', () => {
    const light = specOf(CASES['a bar chart']!, 'light') as { config: { background: string; range: { category: string[] } } };
    const dark = specOf(CASES['a bar chart']!, 'dark') as { config: { background: string; range: { category: string[] } } };
    expect(light.config.background).toBe(tokenColour('surface-raised', 'light'));
    expect(dark.config.background).toBe(tokenColour('surface-raised', 'dark'));
    expect(dark.config.range.category).toEqual(seriesPalette('dark'));
  });

  it('leaves the title off when asked, or when the chart has no name', () => {
    expect(specOf(byRegion({ type: 'bar', encoding: { category: 0, values: [0] }, options: { showTitle: false } }))).not.toHaveProperty('title');
    expect(specOf(byRegion())).toHaveProperty('title', 'Sales');
  });
});

describe('the series palette', () => {
  it.each(['light', 'dark'] as const)('has six different colours in the %s theme', (mode) => {
    expect(new Set(seriesPalette(mode)).size).toBe(6);
  });

  it('follows token references', () => {
    expect(tokenColour('node-transform', 'light')).toBe(tokenColour('brand', 'light'));
  });
});

describe('chartProblem', () => {
  it('asks for a value, and for a line’s axis', () => {
    expect(chartProblem(byRegion({ type: 'bar', encoding: { category: 0 } }).visual)).toBe('Add a field to Values to draw this bar chart');
    expect(chartProblem(byRegion({ type: 'line', encoding: { values: [0] } }).visual)).toBe('Add a date or a number to Axis to draw this line chart');
    expect(chartProblem(byRegion().visual)).toBeUndefined();
  });
});
