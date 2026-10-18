// The dataset library end to end on real DuckDB-WASM (Node build): add, rename, replace, reload, reconnect, delete.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { EngineClient } from '../../src/engine/client';
import { closeDb } from '../../src/datasets/db';
import { addDataset, chooseAgain, configureLibrary, discard, loadLibrary, prepareReplacement, remove, rename, replaceWith, useDatasets } from '../../src/datasets/library';
import { countRows } from '../../src/datasets/register';
import { createNodeBackend } from '../helpers/nodeBackend';
import { fakeOpfs, memoryHandles } from '../helpers/fakeOpfs';

let engine: EngineClient;
let opfs: ReturnType<typeof fakeOpfs>;

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend());
});
afterAll(() => engine.close());

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  opfs = fakeOpfs();
  configureLibrary({ engine: async () => engine, store: { root: opfs.root, handles: memoryHandles(), cap: 1024 } });
  useDatasets.setState({ loaded: false, datasets: [], attach: {} });
});

const csv = (name: string, text: string) => ({ file: new File([text], name) });

describe('the dataset library', () => {
  it('adds a dataset with its schema and row count, kept in the browser', async () => {
    const ds = await addDataset(csv('orders.csv', 'id,total\n1,2.5\n2,3.0\n'));
    expect(ds).toMatchObject({ name: 'orders', fileName: 'orders.csv', format: 'csv', rowCount: 2, storage: 'opfs', schema: [{ name: 'id', type: 'BIGINT' }, { name: 'total', type: 'DOUBLE' }] });
    expect(useDatasets.getState().datasets.map((d) => d.id)).toEqual([ds.id]);
    expect(useDatasets.getState().attach[ds.id]).toEqual({ state: 'ready' });
  });

  it('is still listed and queryable after a reload', async () => {
    const ds = await addDataset(csv('orders.csv', 'id\n1\n2\n3\n'));
    await engine.query(`DROP TABLE "ds_${ds.id}"`);
    useDatasets.setState({ loaded: false, datasets: [], attach: {} });
    await closeDb();
    await loadLibrary();
    expect(useDatasets.getState().datasets.map((d) => d.name)).toEqual(['orders']);
    expect(useDatasets.getState().attach[ds.id]).toEqual({ state: 'ready' });
    expect(await countRows(engine, ds)).toBe(3);
  });

  it('asks for a file above the cap again after a reload, and warns when the one chosen is different', async () => {
    const big = 'id\n' + Array.from({ length: 400 }, (_, i) => i).join('\n') + '\n';
    const ds = await addDataset(csv('big.csv', big));
    expect(ds.storage).toBe('none');
    await loadLibrary();
    expect(useDatasets.getState().attach[ds.id]).toMatchObject({ state: 'missing', reason: expect.stringContaining('Choose the file again') });
    await chooseAgain(ds.id, csv('big.csv', big.replace('\n0\n', '\n9\n')));
    expect(useDatasets.getState().attach[ds.id]).toMatchObject({ state: 'ready', mismatch: true });
    expect(await countRows(engine, ds)).toBe(400);
  });

  it('renames a dataset', async () => {
    const ds = await addDataset(csv('orders.csv', 'id\n1\n'));
    await rename(ds.id, 'Shop orders');
    expect(useDatasets.getState().datasets[0]).toMatchObject({ id: ds.id, name: 'Shop orders' });
  });

  it('replaces a dataset with a newer export, keeping its id and showing the schema diff', async () => {
    const ds = await addDataset(csv('orders.csv', 'id,total,note\n1,2.5,a\n'));
    const { staged, diff } = await prepareReplacement(ds.id, csv('orders-v2.csv', 'id,total,placed\n1,x,2024-01-01\n2,y,2024-01-02\n'));
    expect(diff).toEqual({
      added: [{ name: 'placed', type: 'DATE' }],
      removed: [{ name: 'note', type: 'VARCHAR' }],
      retyped: [{ name: 'total', from: 'DOUBLE', to: 'VARCHAR' }],
    });
    const replaced = await replaceWith(ds.id, staged);
    expect(replaced).toMatchObject({ id: ds.id, name: 'orders', fileName: 'orders-v2.csv', rowCount: 2 });
    expect(await countRows(engine, ds)).toBe(2);
    await expect(countRows(engine, { id: staged.id })).rejects.toThrow();
  });

  it('leaves a dataset as it was when a replacement is cancelled', async () => {
    const ds = await addDataset(csv('orders.csv', 'id\n1\n'));
    const { staged } = await prepareReplacement(ds.id, csv('other.csv', 'x\n1\n2\n'));
    await discard(staged);
    expect(await countRows(engine, ds)).toBe(1);
    expect(useDatasets.getState().datasets[0]?.fileName).toBe('orders.csv');
  });

  it('deletes a dataset, its kept copy and its table', async () => {
    const ds = await addDataset(csv('orders.csv', 'id\n1\n'));
    await remove(ds.id);
    expect(useDatasets.getState().datasets).toEqual([]);
    expect(opfs.files().size).toBe(0);
    await expect(countRows(engine, ds)).rejects.toThrow();
  });

  it('refuses a file it can’t read, saving nothing', async () => {
    await expect(addDataset(csv('book.xlsx', 'x'))).rejects.toThrow(/Export the Output node from Puddle as Parquet/);
    expect(useDatasets.getState().datasets).toEqual([]);
  });
});
