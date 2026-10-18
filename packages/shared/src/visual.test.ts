import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AGGREGATES, CHART_TYPES, ChartSpecZ, VisualZ, defaultChart, newVisual, type ChartType, type Visual, type VisualInput } from './index.ts';

const DS = 'a1b2c3d4e5f6';

const visual = (over: Partial<VisualInput> = {}): VisualInput => ({
  id: 'v1',
  name: 'Sales by region',
  datasetId: DS,
  query: { datasetId: DS, groups: [{ field: 'Region' }, { field: 'rep' }], measures: [{ aggregate: 'sum', field: 'amount' }, { aggregate: 'count' }] },
  chart: { type: 'bar', encoding: { category: 0, values: [0, 1] } },
  ...over,
});

const pathOf = (input: unknown) => VisualZ.safeParse(input).error?.issues.map((i) => i.path.join('.'));

/** Any visual whose encodings point at columns its query has. */
const visualArb: fc.Arbitrary<Visual> = fc
  .record({ type: fc.constantFrom(...CHART_TYPES), groups: fc.integer({ min: 0, max: 3 }), measures: fc.integer({ min: 0, max: 3 }), seed: fc.nat() })
  .map(({ type, groups, measures, seed }) => {
    const values = type === 'pie' ? (measures ? [0] : []) : [...Array(measures).keys()].filter((i) => (seed >> i) & 1);
    const encoding = {
      ...(groups ? { category: 0 } : {}),
      ...(type !== 'pie' && groups > 1 ? { series: 1 } : {}),
      values,
      tooltips: [...Array(measures).keys()].filter((i) => !values.includes(i)),
    };
    return VisualZ.parse({
      id: `v${seed}`,
      name: `Chart ${seed}`,
      datasetId: DS,
      query: { datasetId: DS, groups: [...Array(groups).keys()].map((i) => ({ field: `g${i}` })), measures: [...Array(measures).keys()].map((i) => ({ aggregate: AGGREGATES[i % AGGREGATES.length]!, field: `m${i}` })) },
      chart: { type, encoding },
      ...(seed % 2 ? { size: { cols: 6, rows: 4 }, notes: 'Checked by finance' } : {}),
    });
  });

describe('VisualZ', () => {
  it('parses every chart type’s default', () => {
    for (const type of CHART_TYPES) {
      const v = newVisual('v1', DS, type);
      expect(v.chart.type).toBe(type);
      expect(v.chart.encoding).toEqual({ values: [], tooltips: [] });
      expect(v.chart.options.legend).toBe('right');
      expect(VisualZ.parse(v)).toEqual(v);
    }
  });

  it('fills in each type’s own options', () => {
    expect(defaultChart('bar').options).toMatchObject({ orientation: 'vertical', axisTitles: true });
    expect(defaultChart('line').options).toMatchObject({ points: true, axisTitles: true });
    expect(defaultChart('pie').options).toMatchObject({ maxSlices: 8 });
    expect(defaultChart('pie').options).not.toHaveProperty('axisTitles');
  });

  it('round-trips any visual through JSON', () => {
    fc.assert(
      fc.property(visualArb, (v) => {
        expect(VisualZ.parse(JSON.parse(JSON.stringify(v)))).toEqual(v);
      }),
      { numRuns: 200 },
    );
  });

  it('refuses an unknown chart type, naming where', () => {
    expect(pathOf(visual({ chart: { type: 'donut' as ChartType } }))).toEqual(['chart.type']);
  });

  it('refuses an encoding pointing at a column the query doesn’t have', () => {
    expect(pathOf(visual({ chart: { type: 'bar', encoding: { category: 2, values: [0] } } }))).toEqual(['chart.encoding.category']);
    expect(pathOf(visual({ chart: { type: 'bar', encoding: { category: 0, values: [0, 5] } } }))).toEqual(['chart.encoding.values.1']);
    expect(pathOf(visual({ chart: { type: 'bar', encoding: { category: 0, values: [0], tooltips: [3] } } }))).toEqual(['chart.encoding.tooltips.0']);
  });

  it('refuses a legend that shows the axis’s group', () => {
    expect(pathOf(visual({ chart: { type: 'line', encoding: { category: 0, series: 0, values: [0] } } }))).toEqual(['chart.encoding.series']);
  });

  it('refuses a pie with two values or a legend field', () => {
    expect(pathOf(visual({ chart: { type: 'pie', encoding: { category: 0, values: [0, 1] } } }))).toEqual(['chart.encoding.values']);
    expect(pathOf(visual({ chart: { type: 'pie', encoding: { category: 0, series: 1, values: [0] } } }))).toEqual(['chart.encoding.series']);
  });

  it('refuses a query over another dataset', () => {
    const v = visual();
    expect(pathOf({ ...v, query: { ...v.query, datasetId: 'ffffffffffff' } })).toEqual(['query.datasetId']);
  });

  it('refuses an option of another chart type, and a size off the grid', () => {
    expect(pathOf(visual({ chart: { type: 'pie', options: { orientation: 'horizontal' } as never } }))).toEqual(['chart.options']);
    expect(pathOf(visual({ size: { cols: 13, rows: 4 } }))).toEqual(['size.cols']);
  });

  it('keeps a chart’s options when parsed again', () => {
    const spec = ChartSpecZ.parse({ type: 'bar', options: { orientation: 'horizontal', labels: true, yTitle: 'Sales' } });
    expect(ChartSpecZ.parse(spec)).toEqual(spec);
  });
});
