// The Node engine with DuckDB's json and parquet extensions loaded from the local copy, as dataset tests use it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EngineClient, tableRows } from '../../src/engine/client';
import { createNodeBackend } from '../helpers/nodeBackend';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));

let engine: EngineClient;

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend({ extensions: true }));
});
afterAll(() => engine.close());

it('reads Parquet and JSON with the local extensions', async () => {
  await engine.registerBuffer('customers.parquet', fixture('customers.parquet'));
  await engine.registerBuffer('items.json', fixture('items.json'));
  expect(tableRows((await engine.query(`SELECT count(*)::INTEGER AS n FROM read_parquet('customers.parquet')`)).table)).toEqual([{ n: 4 }]);
  expect(tableRows((await engine.query(`SELECT count(*)::INTEGER AS n FROM read_json_auto('items.json')`)).table)).toEqual([{ n: 2 }]);
});
