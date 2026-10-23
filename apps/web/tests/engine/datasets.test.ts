// Datasets registered on real DuckDB-WASM (Node build), with the json and parquet extensions loaded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasetFormat } from '@wellyboot/shared';
import { EngineClient, tableRows } from '../../src/engine/client';
import { countRows, registerDataset, unregisterDataset } from '../../src/datasets/register';
import { createNodeBackend } from '../helpers/nodeBackend';

const fixture = (name: string) => new Blob([readFileSync(join(__dirname, '../fixtures', name))]);
const ds = (id: string, format: DatasetFormat, fileName: string) => ({ id, format, fileName });

let engine: EngineClient;

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend({ extensions: true }));
});
afterAll(() => engine.close());

describe('registering datasets', () => {
  it('reads a CSV file with Puddle’s column names and types', async () => {
    const r = await registerDataset(engine, ds('csv00001', 'csv', 'customers.csv'), { blob: fixture('customers.csv') });
    expect(r).toEqual({
      schema: [
        { name: 'id', type: 'BIGINT' },
        { name: 'name', type: 'VARCHAR' },
        { name: 'email', type: 'VARCHAR' },
        { name: 'joined', type: 'VARCHAR' },
      ],
      rowCount: 4,
    });
  });

  it('reads a TSV file', async () => {
    const r = await registerDataset(engine, ds('tsv00001', 'tsv', 'orders.tsv'), { blob: fixture('orders.tsv') });
    expect(r.schema.map((c) => c.name)).toEqual(['order_id', 'customer_id', 'total']);
    expect(r.rowCount).toBe(3);
  });

  it('reads JSON and NDJSON', async () => {
    const json = await registerDataset(engine, ds('json0001', 'json', 'items.json'), { blob: fixture('items.json') });
    expect(json).toEqual({ schema: [{ name: 'sku', type: 'VARCHAR' }, { name: 'qty', type: 'BIGINT' }], rowCount: 2 });
    const nd = await registerDataset(engine, ds('ndjson01', 'ndjson', 'events.ndjson'), { blob: fixture('events.ndjson') });
    expect(nd).toEqual({ schema: [{ name: 'event', type: 'VARCHAR' }, { name: 'at', type: 'TIMESTAMP' }], rowCount: 3 });
  });

  it('reads Parquet as a view', async () => {
    const r = await registerDataset(engine, ds('pq000001', 'parquet', 'customers.parquet'), { blob: fixture('customers.parquet') });
    expect(r.schema.map((c) => c.name)).toEqual(['id', 'name', 'email', 'joined']);
    expect(r.rowCount).toBe(4);
    const kinds = tableRows((await engine.query(`SELECT table_type FROM information_schema.tables WHERE table_name = 'ds_pq000001'`)).table);
    expect(kinds).toEqual([{ table_type: 'VIEW' }]);
  });

  it('points the same name at a newer export, even in another format', async () => {
    await registerDataset(engine, ds('swap0001', 'csv', 'customers.csv'), { blob: fixture('customers.csv') });
    const r = await registerDataset(engine, ds('swap0001', 'parquet', 'taxi-trips.parquet'), { blob: fixture('taxi-trips.parquet') });
    expect(r.rowCount).toBe(await countRows(engine, { id: 'swap0001' }));
    expect(r.schema.map((c) => c.name)).not.toContain('email');
  });

  it('leaves nothing behind when a file can’t be read, and drops a dataset on delete', async () => {
    await expect(registerDataset(engine, ds('bad00001', 'parquet', 'x.parquet'), { blob: new Blob(['not parquet']) })).rejects.toThrow();
    await registerDataset(engine, ds('gone0001', 'csv', 'customers.csv'), { blob: fixture('customers.csv') });
    await unregisterDataset(engine, ds('gone0001', 'csv', 'customers.csv'));
    await expect(countRows(engine, { id: 'gone0001' })).rejects.toThrow();
  });
});
