// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Dataset } from '@wellyboot/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSourcePicker } from './DataSourcePicker';
import { useDatasets } from './library';
import { DiffList } from './ReplaceDatasetDialog';

beforeAll(() => {
  // jsdom has <dialog> but not its modal methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const dataset = (id: string, over: Partial<Dataset> = {}): Dataset => ({
  id,
  name: `Dataset ${id}`,
  fileName: `${id}.parquet`,
  format: 'parquet',
  schema: [
    { name: 'order_id', type: 'BIGINT' },
    { name: 'city', type: 'VARCHAR' },
    { name: 'placed', type: 'DATE' },
  ],
  rowCount: 1204,
  headHash: 'a'.repeat(64),
  size: 2048,
  storage: 'opfs',
  addedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const orders = dataset('orders01', {
  name: 'Orders',
  provenance: { project: 'Shop', node: 'Clean orders', exportedAt: '2026-10-17T12:00:00.000Z' },
});
const customers = dataset('custom01', { name: 'Customers', format: 'csv', fileName: 'customers.csv', storage: 'none' });

beforeEach(() => {
  useDatasets.setState({ loaded: true, datasets: [orders, customers], attach: { orders01: { state: 'ready' }, custom01: { state: 'missing', reason: 'This file isn’t kept in this browser. Choose the file again to use this dataset.' } } });
});
afterEach(cleanup);

const list = () => within(screen.getByTestId('dataset-list'));

describe('the data source picker', () => {
  it('lists datasets in the catalogue’s order and shows the first', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    expect(list().getAllByRole('button').map((b) => b.querySelector('.text-body-strong')?.textContent)).toEqual(['Orders', 'Customers']);
    expect(screen.getByTestId('dataset-name')).toHaveTextContent('Orders');
    expect(screen.getByTestId('dataset-summary')).toHaveTextContent('Parquet · 1,204 rows · 3 columns · 2 KB');
  });

  it('shows each field with a type tag and its kind', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    const fields = screen.getAllByTestId('dataset-field');
    expect(fields.map((f) => f.textContent)).toEqual(['123order_idNumber', 'AbccityText', 'placedDate']);
  });

  it('shows where the dataset came from in Puddle', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    const card = screen.getByTestId('provenance');
    expect(card).toHaveTextContent('ProjectShop');
    expect(card).toHaveTextContent('Output nodeClean orders');
    expect(card).toHaveTextContent('Exported');
  });

  it('searches by name', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search datasets' }), { target: { value: 'cust' } });
    expect(list().getAllByRole('button')).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search datasets' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No dataset matches “zzz”.')).toBeInTheDocument();
  });

  it('asks for the file of a dataset that isn’t kept', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    fireEvent.click(list().getByText('Customers'));
    expect(screen.getByRole('status')).toHaveTextContent('Choose the file again');
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(list().getByText(/needs its file/)).toBeInTheDocument();
  });

  it('offers to reconnect files kept by handle with one click', () => {
    useDatasets.setState((s) => ({ attach: { ...s.attach, orders01: { state: 'prompt', reason: 'Wellyboot BI can open orders01.parquet again once you allow it.' } } }));
    render(<DataSourcePicker onClose={() => {}} />);
    expect(screen.getByTestId('reconnect-banner')).toHaveTextContent('Reconnect 1 file');
  });

  it('opens the add, rename, replace and delete dialogs in place of the picker', () => {
    render(<DataSourcePicker onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Orders');
    expect(screen.queryByTestId('data-source-picker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Delete Orders?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByRole('dialog', { name: 'Replace Orders' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add dataset' }));
    expect(screen.getByRole('dialog', { name: 'Add dataset' })).toHaveTextContent('are kept in this browser');
  });

  it('says how to start when there are no datasets', () => {
    useDatasets.setState({ loaded: true, datasets: [], attach: {} });
    render(<DataSourcePicker onClose={() => {}} />);
    expect(screen.getByText(/No datasets yet/)).toBeInTheDocument();
  });
});

it('lists the columns a newer export adds, removes and retypes', () => {
  render(
    <DiffList
      diff={{
        added: [{ name: 'placed', type: 'DATE' }],
        removed: [{ name: 'note', type: 'VARCHAR' }],
        retyped: [{ name: 'total', from: 'DOUBLE', to: 'VARCHAR' }],
      }}
    />,
  );
  expect(within(screen.getByRole('region', { name: 'Added columns' })).getByText('placed')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Removed columns' })).getByText('note')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Retyped columns' })).toHaveTextContent('totalDOUBLE to VARCHAR');
});
