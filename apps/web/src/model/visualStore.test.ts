import { newVisual, type ColumnSchema, type Visual } from '@wellyboot/shared';
import { addToWell } from '../visuals/encode';
import { COALESCE_MS, useVisualStore } from './visualStore';

const SCHEMA: ColumnSchema[] = [
  { name: 'Region', type: 'VARCHAR' },
  { name: 'Sales', type: 'DOUBLE' },
];
const store = () => useVisualStore.getState();
const present = () => store().history!.present;
const rename = (name: string) => (v: Visual) => ({ ...v, name });

beforeEach(() => {
  vi.useFakeTimers();
  useVisualStore.setState({ limit: 200 });
  store().open(newVisual('v1', 'sales0001'), SCHEMA);
});
afterEach(() => vi.useRealTimers());

describe('the visual store', () => {
  it('undoes and redoes well edits', () => {
    store().apply(addToWell(present(), SCHEMA, 'category', 'Region'));
    store().apply(addToWell(present(), SCHEMA, 'values', 'Sales'));
    expect(present().query.measures).toHaveLength(1);
    store().undo();
    expect(present().query).toMatchObject({ groups: [{ field: 'Region' }], measures: [] });
    store().undo();
    expect(present().query.groups).toEqual([]);
    store().redo();
    store().redo();
    expect(present().query.measures).toEqual([{ aggregate: 'sum', field: 'Sales' }]);
  });

  it('shows a refused edit as a note and changes nothing', () => {
    const before = present();
    expect(store().apply(addToWell(before, SCHEMA, 'category', 'Profit'))).toBe(false);
    expect(store().note).toEqual({ tone: 'fail', text: "There's no field called Profit in this dataset" });
    expect(present()).toBe(before);
    expect(store().history!.past).toHaveLength(0);
  });

  it('makes typing one undo step', () => {
    for (const name of ['S', 'Sa', 'Sal', 'Sales']) {
      store().edit(rename(name), { coalesce: 'name' });
      vi.advanceTimersByTime(200);
    }
    expect(present().name).toBe('Sales');
    expect(store().history!.past).toHaveLength(1);
    store().undo();
    expect(present().name).toBe('Untitled chart');
  });

  it('starts a new step after a pause, or when another field is typed in', () => {
    store().edit(rename('Sales'), { coalesce: 'name' });
    vi.advanceTimersByTime(COALESCE_MS + 1);
    store().edit(rename('Sales by region'), { coalesce: 'name' });
    store().edit((v) => ({ ...v, notes: 'Q1' }), { coalesce: 'notes' });
    expect(store().history!.past).toHaveLength(3);
  });

  it('starts a new step after an undo, even when typing goes on', () => {
    store().edit(rename('Sales'), { coalesce: 'name' });
    store().undo();
    store().edit(rename('Region'), { coalesce: 'name' });
    expect(store().history!.past).toHaveLength(1);
    expect(store().history!.future).toHaveLength(0);
  });

  it('keeps at most its limit of steps', () => {
    useVisualStore.setState({ limit: 5 });
    for (let i = 0; i < 12; i++) store().edit(rename(`Chart ${i}`));
    expect(store().history!.past).toHaveLength(5);
    for (let i = 0; i < 10; i++) store().undo();
    expect(present().name).toBe('Chart 6');
  });

  it('ignores an edit that changes nothing', () => {
    store().edit((v) => v);
    expect(store().history!.past).toHaveLength(0);
  });
});
