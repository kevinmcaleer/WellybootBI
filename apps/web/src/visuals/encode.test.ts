import { newVisual, VisualZ, type ColumnSchema, type Visual } from '@wellyboot/shared';
import { addToWell, effectiveQuery, moveInWells, removeFromWell, retarget, setAggregate, setBucket, wellEntries, wellProblem, type EditResult } from './encode';

const DS = 'sales0001';
const SCHEMA: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'Sales', type: 'DECIMAL(18,2)' },
  { name: 'units', type: 'BIGINT' },
  { name: 'placed', type: 'DATE' },
  { name: 'rep', type: 'VARCHAR' },
];

const ok = (r: EditResult): Visual => {
  if (r.error) throw new Error(r.error);
  return VisualZ.parse(r.visual);
};

/** Drop fields into wells one after the other, as the editor does. */
const build = (type: Visual['chart']['type'], ...drops: [Parameters<typeof addToWell>[2], string | null][]) =>
  drops.reduce((v, [well, field]) => ok(addToWell(v, SCHEMA, well, field)), newVisual('v1', DS, type));

describe('addToWell', () => {
  it('groups by a field on the axis and sums a number in Values', () => {
    const v = build('bar', ['category', 'Region'], ['values', 'Sales']);
    expect(v.query.groups).toEqual([{ field: 'Region' }]);
    expect(v.query.measures).toEqual([{ aggregate: 'sum', field: 'Sales' }]);
    expect(v.chart.encoding).toEqual({ category: 0, values: [0], tooltips: [] });
    expect(wellEntries(v, 'values')).toEqual([{ index: 0, field: 'Sales', name: 'Sum of Sales' }]);
  });

  it('counts text, and counts rows for the number of rows', () => {
    const v = build('bar', ['values', 'rep'], ['values', null]);
    expect(v.query.measures).toEqual([{ aggregate: 'count', field: 'rep' }, { aggregate: 'count' }]);
  });

  it('buckets a date by month on the axis and by year in the legend', () => {
    const v = build('line', ['category', 'placed'], ['values', 'units']);
    expect(v.query.groups[0]).toEqual({ field: 'placed', bucket: { kind: 'date', unit: 'month' } });
    expect(build('bar', ['series', 'placed']).query.groups[0]).toEqual({ field: 'placed', bucket: { kind: 'date', unit: 'year' } });
  });

  it('replaces the field of a well that takes one, and drops its group from the query', () => {
    const v = build('bar', ['category', 'Region'], ['values', 'Sales'], ['category', 'rep']);
    expect(v.query.groups).toEqual([{ field: 'rep' }]);
    expect(v.chart.encoding.category).toBe(0);
  });

  it('adds at a place in the well', () => {
    const v = ok(addToWell(build('bar', ['values', 'Sales'], ['values', 'units']), SCHEMA, 'values', null, 0));
    expect(wellEntries(v, 'values').map((e) => e.name)).toEqual(['Count', 'Sum of Sales', 'Sum of units']);
  });

  it('refuses text on a line’s axis, naming the field', () => {
    expect(addToWell(newVisual('v1', DS, 'line'), SCHEMA, 'category', 'Region')).toEqual({ error: 'Axis needs a date or a number; Region is text' });
  });

  it('refuses the number of rows on an axis, and a field that isn’t there', () => {
    expect(wellProblem(newVisual('v1', DS), SCHEMA, 'category', null)).toBe('Axis needs a field to group by; the number of rows can only go in Values');
    expect(wellProblem(newVisual('v1', DS), SCHEMA, 'values', 'Profit')).toBe("There's no field called Profit in this dataset");
  });

  it('refuses the same field on the axis and in the legend', () => {
    expect(addToWell(build('bar', ['category', 'Region']), SCHEMA, 'series', 'Region')).toEqual({ error: 'Region is already in Axis' });
  });

  it('refuses a second value with a legend, and a legend with two values', () => {
    expect(addToWell(build('bar', ['category', 'Region'], ['series', 'rep'], ['values', 'Sales']), SCHEMA, 'values', 'units')).toEqual({
      error: 'With rep in Legend, the chart shows one value; take it out of the legend to add units',
    });
    expect(addToWell(build('bar', ['category', 'Region'], ['values', 'Sales'], ['values', 'units']), SCHEMA, 'series', 'rep')).toEqual({
      error: 'Legend splits one value at a time; take Sum of units out of Values first to split by rep',
    });
  });

  it('keeps one value on a pie, replacing it', () => {
    const v = build('pie', ['category', 'Region'], ['values', 'Sales'], ['values', 'units']);
    expect(v.query.measures).toEqual([{ aggregate: 'sum', field: 'units' }]);
  });
});

describe('removeFromWell', () => {
  it('takes the field out of the query, moving later places up, its sort with it', () => {
    let v = build('bar', ['category', 'Region'], ['values', 'Sales'], ['values', 'units'], ['tooltips', null]);
    v = { ...v, query: { ...v.query, sort: [{ by: 'measure', index: 0, dir: 'desc' }, { by: 'measure', index: 2, dir: 'asc' }] } };
    const out = VisualZ.parse(removeFromWell(v, 'values', 0));
    expect(out.query.measures).toEqual([{ aggregate: 'sum', field: 'units' }, { aggregate: 'count' }]);
    expect(out.chart.encoding).toEqual({ category: 0, values: [0], tooltips: [1] });
    expect(out.query.sort).toEqual([{ by: 'measure', index: 1, dir: 'asc' }]);
  });

  it('drops a top N’s others with the last group', () => {
    let v = build('bar', ['category', 'Region'], ['values', 'Sales']);
    v = { ...v, query: { ...v.query, limit: { n: 3, others: true } } };
    expect(removeFromWell(v, 'category', 0).query.limit).toBeUndefined();
  });
});

describe('moveInWells', () => {
  it('reorders values, and moves a value to the tooltips without touching the query', () => {
    const v = build('bar', ['category', 'Region'], ['values', 'Sales'], ['values', 'units']);
    expect(ok(moveInWells(v, SCHEMA, 'values', 1, 'values', 0)).chart.encoding.values).toEqual([1, 0]);
    const moved = ok(moveInWells(v, SCHEMA, 'values', 1, 'tooltips'));
    expect(moved.chart.encoding).toEqual({ category: 0, values: [0], tooltips: [1] });
    expect(moved.query).toEqual(v.query);
  });

  it('moves the axis field to the legend, replacing what was there', () => {
    const v = build('bar', ['category', 'Region'], ['series', 'rep'], ['values', 'Sales']);
    const moved = ok(moveInWells(v, SCHEMA, 'category', 0, 'series'));
    expect(moved.query.groups).toEqual([{ field: 'Region' }]);
    expect(moved.chart.encoding).toEqual({ series: 0, values: [0], tooltips: [] });
  });

  it('turns a group dragged to Values into a summary', () => {
    const v = build('bar', ['category', 'units']);
    const moved = ok(moveInWells(v, SCHEMA, 'category', 0, 'values'));
    expect(moved.query).toMatchObject({ groups: [], measures: [{ aggregate: 'sum', field: 'units' }] });
  });

  it('refuses a move that doesn’t fit, in words', () => {
    const v = build('line', ['category', 'placed'], ['series', 'rep'], ['values', 'Sales']);
    expect(moveInWells(v, SCHEMA, 'series', 0, 'category')).toEqual({ error: 'Axis needs a date or a number; rep is text' });
  });
});

describe('setAggregate and setBucket', () => {
  it('summarises another way, or says why not', () => {
    const v = build('bar', ['values', 'Sales'], ['values', 'rep']);
    expect(ok(setAggregate(v, SCHEMA, 0, 'avg')).query.measures[0]).toEqual({ aggregate: 'avg', field: 'Sales' });
    expect(setAggregate(v, SCHEMA, 1, 'sum')).toEqual({ error: 'Sum needs a number; rep is text' });
    expect(ok(setAggregate(v, SCHEMA, 1, 'countDistinct')).query.measures[1]).toEqual({ aggregate: 'countDistinct', field: 'rep' });
  });

  it('buckets a date by another unit, or not at all', () => {
    const v = build('line', ['category', 'placed']);
    expect(setBucket(v, 0, { kind: 'date', unit: 'quarter' }).query.groups[0]).toEqual({ field: 'placed', bucket: { kind: 'date', unit: 'quarter' } });
    expect(setBucket(v, 0, undefined).query.groups[0]).toEqual({ field: 'placed' });
  });
});

describe('effectiveQuery', () => {
  it('keeps a pie to its largest slices and an Others slice', () => {
    const v = build('pie', ['category', 'Region'], ['values', 'Sales']);
    expect(effectiveQuery(v)).toMatchObject({ sort: [{ by: 'measure', index: 0, dir: 'desc' }], limit: { n: 7, others: true } });
    const capped = { ...v, chart: { ...v.chart, options: { ...v.chart.options, maxSlices: 4 } } } as Visual;
    expect(effectiveQuery(capped).limit).toEqual({ n: 3, others: true });
  });

  it('leaves an author’s own top N, and other charts, alone', () => {
    const v = build('pie', ['category', 'Region'], ['values', 'Sales']);
    const own = { ...v, query: { ...v.query, limit: { n: 2, others: false } } };
    expect(effectiveQuery(own)).toBe(own.query);
    const b = build('bar', ['category', 'Region'], ['values', 'Sales']);
    expect(effectiveQuery(b)).toBe(b.query);
  });
});

describe('retarget', () => {
  it('keeps the first measure going from bar to pie, and says the second was dropped', () => {
    const v = build('bar', ['category', 'Region'], ['values', 'Sales'], ['values', null]);
    const { visual, dropped } = retarget(v, 'pie', SCHEMA);
    expect(VisualZ.parse(visual).query.measures).toEqual([{ aggregate: 'sum', field: 'Sales' }]);
    expect(visual.chart.encoding).toEqual({ category: 0, values: [0], tooltips: [] });
    expect(dropped).toEqual(['A pie chart shows one value, so Count was dropped']);
  });

  it('drops the legend going to a pie, and text on a line’s axis', () => {
    const v = build('bar', ['category', 'Region'], ['series', 'rep'], ['values', 'Sales']);
    expect(retarget(v, 'pie', SCHEMA).dropped).toEqual(['A pie chart has no legend, so rep was dropped']);
    const line = retarget(v, 'line', SCHEMA);
    expect(line.dropped).toEqual(["A line chart's axis needs a date or a number, so Region was dropped"]);
    expect(VisualZ.parse(line.visual).chart.encoding).toEqual({ series: 0, values: [0], tooltips: [] });
  });

  it('keeps every field that fits, and the options both types have', () => {
    let v = build('bar', ['category', 'placed'], ['series', 'rep'], ['values', 'Sales'], ['tooltips', 'units']);
    v = { ...v, chart: { ...v.chart, options: { ...v.chart.options, legend: 'bottom', labels: true, yTitle: 'Sales (£)', orientation: 'horizontal' } } } as Visual;
    const { visual, dropped } = retarget(v, 'line', SCHEMA);
    expect(dropped).toEqual([]);
    expect(visual.query).toEqual(v.query);
    expect(VisualZ.parse(visual).chart).toEqual({
      type: 'line',
      encoding: v.chart.encoding,
      options: { showTitle: true, labels: true, legend: 'bottom', numberFormat: 'auto', colours: 'categorical', axisTitles: true, points: true, yTitle: 'Sales (£)' },
    });
  });
});
