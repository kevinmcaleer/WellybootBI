// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { newVisual, VisualZ, type ColumnSchema, type Visual } from '@wellyboot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldList } from './FieldList';
import { FilterEditor } from './FilterEditor';
import { Wells } from './Wells';

afterEach(cleanup);

const SCHEMA: ColumnSchema[] = [
  { name: 'Date', type: 'DATE' },
  { name: 'Region', type: 'VARCHAR' },
  { name: 'Sales', type: 'DOUBLE' },
];

const TARGETS = [
  { id: 'category', label: 'Axis' },
  { id: 'values', label: 'Values' },
  { id: 'filters', label: 'Filters' },
];

function pick(trigger: HTMLElement, item: string, role: 'menuitem' | 'menuitemradio' = 'menuitem') {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole(role, { name: item }));
}

describe('FieldList', () => {
  it('groups the fields by kind, with the number of rows first', () => {
    render(<FieldList name="shop" schema={SCHEMA} targets={TARGETS} onAdd={vi.fn()} onChangeDataset={vi.fn()} />);
    const names = screen.getAllByTestId('field').map((f) => f.dataset.field);
    expect(names).toEqual(['', 'Sales', 'Region', 'Date']);
    expect(within(screen.getByRole('region', { name: 'Text' })).getByText('Region')).toBeTruthy();
  });

  it('adds a field to a well from its menu, for the keyboard', () => {
    const onAdd = vi.fn();
    render(<FieldList name="shop" schema={SCHEMA} targets={TARGETS} onAdd={onAdd} onChangeDataset={vi.fn()} />);
    pick(screen.getByRole('button', { name: 'Add Region' }), 'Add to Axis');
    expect(onAdd).toHaveBeenCalledWith('category', 'Region');
  });

  // Regression: the field was a <button>, and Firefox never starts a drag from a button. It is a focusable element
  // with the button role instead, so it must still open its menu from the keyboard.
  it('is draggable, and opens its menu with Enter or Space', () => {
    render(<FieldList name="shop" schema={SCHEMA} targets={TARGETS} onAdd={vi.fn()} onChangeDataset={vi.fn()} />);
    const region = screen.getByRole('button', { name: 'Add Region' });
    expect(region.tagName).not.toBe('BUTTON');
    expect(region.getAttribute('draggable')).toBe('true');
    expect(region.tabIndex).toBe(0);
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: 'Add to Axis' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add Sales' }), { key: ' ' });
    expect(screen.getByRole('menu', { name: /Sales/ })).toBeTruthy();
  });

  it('only offers to count rows in the wells that take a value', () => {
    render(<FieldList name="shop" schema={SCHEMA} targets={TARGETS} onAdd={vi.fn()} onChangeDataset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Number of rows' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Add to Values']);
  });

  it('searches the fields and says when none match', () => {
    render(<FieldList name="shop" schema={SCHEMA} targets={TARGETS} onAdd={vi.fn()} onChangeDataset={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search fields'), { target: { value: 'reg' } });
    expect(screen.getAllByTestId('field').map((f) => f.dataset.field)).toEqual(['Region']);
    fireEvent.change(screen.getByLabelText('Search fields'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No field matches/)).toBeTruthy();
  });
});

function WellsHarness({ initial, onNewFilter = vi.fn() }: { initial: Visual; onNewFilter?: (f: string) => void }) {
  const [visual, setVisual] = useState(initial);
  return (
    <>
      <Wells visual={visual} schema={SCHEMA} commit={(r) => r.visual && setVisual(r.visual)} onNewFilter={onNewFilter} onEditFilter={vi.fn()} />
      <output data-testid="query">{JSON.stringify(visual.query)}</output>
    </>
  );
}

const query = () => JSON.parse(screen.getByTestId('query').textContent!);

describe('Wells', () => {
  const visual: Visual = VisualZ.parse({
    ...newVisual('visual01', 'dataset1'),
    query: {
      datasetId: 'dataset1',
      groups: [{ field: 'Region' }],
      measures: [
        { field: 'Sales', aggregate: 'sum' },
        { aggregate: 'count' },
      ],
      filters: [{ field: 'Region', op: '<>', value: 'West' }],
      sort: [],
    },
    chart: { type: 'bar', encoding: { category: 0, values: [0, 1] } },
  });

  it('shows each well’s fields and the filters', () => {
    render(<WellsHarness initial={visual} />);
    expect(within(screen.getByTestId('well-category')).getByRole('button', { name: 'Axis: Region' })).toBeTruthy();
    expect(within(screen.getByTestId('well-values')).getAllByTestId('well-chip')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Edit filter: Region is not West' })).toBeTruthy();
  });

  it('changes how a value is summarised', () => {
    render(<WellsHarness initial={visual} />);
    pick(screen.getByRole('button', { name: 'Summarise Sales: Sum' }), 'Average', 'menuitemradio');
    expect(query().measures[0]).toEqual({ field: 'Sales', aggregate: 'avg' });
  });

  it('moves and removes chips from their menu', () => {
    render(<WellsHarness initial={visual} />);
    pick(screen.getByRole('button', { name: 'Values: Sum of Sales' }), 'Move down');
    expect(within(screen.getByTestId('well-values')).getAllByTestId('well-chip').map((c) => c.textContent)).toEqual([expect.stringContaining('Count'), expect.stringContaining('Sales')]);
    pick(screen.getByRole('button', { name: 'Axis: Region' }), 'Remove');
    expect(query().groups).toEqual([]);
  });
});

describe('FilterEditor', () => {
  it('adds a new filter only once it is complete', () => {
    const onChange = vi.fn();
    render(<FilterEditor field="Sales" type="DOUBLE" onChange={onChange} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Condition' }), { target: { value: '>' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: 'lots' } });
    expect(screen.getByText('Sales needs a number')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add filter' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(onChange).toHaveBeenCalledWith({ field: 'Sales', op: '>', value: 50 });
  });

  it('changes a filter being edited as it is typed, and can remove it', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    render(<FilterEditor field="Sales" type="DOUBLE" filter={{ field: 'Sales', op: '>', value: 5 }} onChange={onChange} onRemove={onRemove} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith({ field: 'Sales', op: '>', value: 7 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('suggests the field’s common values', () => {
    render(<FilterEditor field="Region" type="VARCHAR" profile={{ name: 'Region', top: [{ value: 'North', count: 3 }] } as never} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Most common: North')).toBeTruthy();
    expect(document.querySelector('datalist option')?.getAttribute('value')).toBe('North');
  });
});
