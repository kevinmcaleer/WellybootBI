import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { Dataset } from '@wellyboot/shared';
import { deleteDataset, getDataset, listDatasets, newDatasetId, renameDataset, replaceDataset, saveDataset } from './catalogue';
import { closeDb, DATASETS, DB_VERSION, run } from './db';

const dataset = (id: string, over: Partial<Dataset> = {}): Dataset => ({
  id,
  name: `Dataset ${id}`,
  fileName: `${id}.parquet`,
  format: 'parquet',
  schema: [{ name: 'a', type: 'INTEGER' }],
  rowCount: 3,
  headHash: 'a'.repeat(64),
  size: 100,
  storage: 'opfs',
  addedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

beforeEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('the dataset catalogue', () => {
  it('lists datasets newest first', async () => {
    await saveDataset(dataset('aaaaaaaa', { updatedAt: '2026-10-01T00:00:00.000Z' }));
    await saveDataset(dataset('bbbbbbbb', { updatedAt: '2026-10-03T00:00:00.000Z' }));
    await saveDataset(dataset('cccccccc', { updatedAt: '2026-10-02T00:00:00.000Z' }));
    expect((await listDatasets()).map((d) => d.id)).toEqual(['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
  });

  it('refuses to save a record that isn’t a dataset', async () => {
    await expect(saveDataset({ ...dataset('aaaaaaaa'), rowCount: -1 })).rejects.toThrow();
    expect(await listDatasets()).toEqual([]);
  });

  it('leaves a damaged record out of the list instead of failing', async () => {
    await saveDataset(dataset('aaaaaaaa'));
    await run(DATASETS, 'readwrite', (s) => s.put({ id: 'broken', name: 1 }));
    expect((await listDatasets()).map((d) => d.id)).toEqual(['aaaaaaaa']);
    expect(await getDataset('broken')).toBeUndefined();
  });

  it('renames a dataset, refusing a blank name', async () => {
    await saveDataset(dataset('aaaaaaaa'));
    expect((await renameDataset('aaaaaaaa', '  Orders ')).name).toBe('Orders');
    await expect(renameDataset('aaaaaaaa', '  ')).rejects.toThrow('Give the dataset a name.');
    expect((await getDataset('aaaaaaaa'))?.name).toBe('Orders');
  });

  it('replaces a dataset with a newer export, keeping its id, name and when it was added', async () => {
    await saveDataset(dataset('aaaaaaaa', { name: 'Orders' }));
    const { id: _i, name: _n, addedAt: _a, updatedAt: _u, ...next } = dataset('zzzzzzzz', { fileName: 'orders-v2.parquet', rowCount: 9, schema: [{ name: 'b', type: 'VARCHAR' }] });
    const replaced = await replaceDataset('aaaaaaaa', next);
    expect(replaced).toMatchObject({ id: 'aaaaaaaa', name: 'Orders', fileName: 'orders-v2.parquet', rowCount: 9, addedAt: '2026-10-01T00:00:00.000Z' });
    expect(replaced.updatedAt > '2026-10-01T00:00:00.000Z').toBe(true);
    expect(await listDatasets()).toHaveLength(1);
  });

  it('can’t replace or rename a deleted dataset', async () => {
    await saveDataset(dataset('aaaaaaaa'));
    await deleteDataset('aaaaaaaa');
    expect(await getDataset('aaaaaaaa')).toBeUndefined();
    await expect(renameDataset('aaaaaaaa', 'x')).rejects.toThrow('This dataset has been deleted.');
  });

  it('keeps its records when the page reloads (a new connection)', async () => {
    await saveDataset(dataset('aaaaaaaa'));
    await closeDb();
    expect((await listDatasets()).map((d) => d.id)).toEqual(['aaaaaaaa']);
  });

  it('creates its stores from an empty database at the current version', async () => {
    await listDatasets();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('wellyboot');
      req.onsuccess = () => resolve(req.result);
    });
    expect(db.version).toBe(DB_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['datasets', 'handles']);
    db.close();
  });
});

it('makes ids that are safe in a view name and don’t repeat', () => {
  const ids = new Set(Array.from({ length: 200 }, newDatasetId));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9]{8,32}$/);
});
