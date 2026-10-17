// Real DuckDB-WASM (Node build) behind the EngineClient.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EngineClient, tableRows } from '../../src/engine/client';
import { isCancelled } from '../../src/engine/errors';
import { createNodeBackend } from '../helpers/nodeBackend';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

let engine: EngineClient;

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend());
});
afterAll(() => engine.close());

const rows = async (sql: string) => tableRows((await engine.query(sql)).table);

describe('engine', () => {
  it('reports the DuckDB version', () => {
    expect(engine.info.version).toMatch(/^v1\./);
  });

  it('runs SELECT 1', async () => {
    const r = await engine.query('SELECT 1 AS one');
    expect(r.numRows).toBe(1);
    expect(r.columns).toEqual([{ name: 'one', type: 'INTEGER' }]);
    expect(tableRows(r.table)).toEqual([{ one: 1 }]);
  });

  it('reads a registered CSV file and describes its columns', async () => {
    await engine.registerBuffer('customers.csv', fixture('customers.csv'));
    expect(await rows(`SELECT count(*)::INTEGER AS n FROM read_csv('customers.csv')`)).toEqual([{ n: 4 }]);
    expect((await engine.describe(`SELECT * FROM read_csv('customers.csv')`)).map((c) => c.name)).toEqual(['id', 'name', 'email', 'joined']);
  });

  it('says in plain words what went wrong', async () => {
    await expect(engine.query('SELECT nope FROM range(1)')).rejects.toMatchObject({ code: 'missing', message: expect.stringContaining('nope') });
  });

  it('cancels a query whose signal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const e = await engine.query('SELECT 1', { signal: ac.signal }).catch((x: unknown) => x);
    expect(isCancelled(e)).toBe(true);
  });

  it('turns a JSON read into a plain missing-extension error when the extension can’t load', async () => {
    await engine.registerText('items.json', '[{"a":1}]');
    await expect(engine.query(`SELECT * FROM read_json_auto('items.json')`)).rejects.toMatchObject({ code: 'missing-extension' });
  });
});
