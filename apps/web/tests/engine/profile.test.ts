// Field profiles and Puddle provenance on real DuckDB-WASM (Node build), with the parquet extension loaded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EngineClient } from '../../src/engine/client';
import { isCancelled } from '../../src/engine/errors';
import { profileDataset } from '../../src/datasets/profile';
import { readProvenance } from '../../src/datasets/provenance';
import { registerDataset } from '../../src/datasets/register';
import { createNodeBackend } from '../helpers/nodeBackend';

const fixture = (name: string) => new Blob([readFileSync(join(__dirname, '../fixtures', name))]);

let engine: EngineClient;

beforeAll(async () => {
  engine = new EngineClient(await createNodeBackend({ extensions: true }));
});
afterAll(() => engine.close());

describe('profiling a dataset', () => {
  it('counts nulls and distinct values, and finds min, max and top values', async () => {
    const csv = 'id,city,score,seen\n1,Leeds,3.5,2024-01-02\n2,York,,2024-03-01\n3,Leeds,1.0,\n4,,2.0,2024-02-10\n5,Leeds,2.0,2024-01-02\n';
    const ds = { id: 'prof0001', format: 'csv' as const, fileName: 'p.csv' };
    const { schema } = await registerDataset(engine, ds, { blob: new Blob([csv]) });
    const profile = await profileDataset(engine, ds, schema);
    expect(profile.rows).toBe(5);
    expect(profile.fields).toEqual([
      { name: 'id', type: 'BIGINT', nulls: 0, distinct: 5, min: '1', max: '5' },
      { name: 'city', type: 'VARCHAR', nulls: 1, distinct: 2, min: 'Leeds', max: 'York', top: [{ value: 'Leeds', count: 3 }, { value: 'York', count: 1 }] },
      { name: 'score', type: 'DOUBLE', nulls: 1, distinct: 3, min: '1.0', max: '3.5' },
      { name: 'seen', type: 'DATE', nulls: 1, distinct: 3, min: '2024-01-02', max: '2024-03-01' },
    ]);
  });

  it('profiles an empty field without min or max', async () => {
    const ds = { id: 'prof0002', format: 'csv' as const, fileName: 'e.csv' };
    const { schema } = await registerDataset(engine, ds, { blob: new Blob(['a,b\n1,\n2,\n']) });
    const [, b] = (await profileDataset(engine, ds, schema)).fields;
    expect(b).toMatchObject({ name: 'b', nulls: 2, distinct: 0 });
    expect(b?.min).toBeUndefined();
  });

  it('profiles a Parquet dataset', async () => {
    const ds = { id: 'prof0003', format: 'parquet' as const, fileName: 'customers.parquet' };
    const { schema } = await registerDataset(engine, ds, { blob: fixture('customers.parquet') });
    const profile = await profileDataset(engine, ds, schema);
    expect(profile.rows).toBe(4);
    expect(profile.fields.map((f) => f.name)).toEqual(['id', 'name', 'email', 'joined']);
  });

  it('is cancelled when the dialog closes', async () => {
    const ds = { id: 'prof0004', format: 'csv' as const, fileName: 'c.csv' };
    const { schema } = await registerDataset(engine, ds, { blob: new Blob(['a\n1\n']) });
    const ac = new AbortController();
    ac.abort();
    expect(isCancelled(await profileDataset(engine, ds, schema, ac.signal).catch((e: unknown) => e))).toBe(true);
  });
});

describe('provenance', () => {
  it('reads the puddle keys from a Parquet export', async () => {
    const r = await engine.exportFile('prov.parquet', (path) =>
      `COPY (SELECT 1 AS id) TO '${path}' (FORMAT parquet, KV_METADATA {'puddle.project': 'Shop', 'puddle.node': 'Clean orders', 'puddle.exportedAt': '2026-10-17T12:00:00Z', 'puddle.rulesPassed': '["No missing ids"]', 'other': 'x'})`,
    );
    const ds = { id: 'prov0001', format: 'parquet' as const, fileName: 'prov.parquet' };
    await registerDataset(engine, ds, { blob: r.blob });
    expect(await readProvenance(engine, ds)).toEqual({ project: 'Shop', node: 'Clean orders', exportedAt: '2026-10-17T12:00:00Z', rulesPassed: ['No missing ids'] });
  });

  it('is undefined for a Parquet file without it, and for other formats', async () => {
    const pq = { id: 'prov0002', format: 'parquet' as const, fileName: 'customers.parquet' };
    await registerDataset(engine, pq, { blob: fixture('customers.parquet') });
    expect(await readProvenance(engine, pq)).toBeUndefined();
    expect(await readProvenance(engine, { id: 'prof0001', format: 'csv' })).toBeUndefined();
  });
});
