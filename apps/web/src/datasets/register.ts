import type { ColumnSchema, Dataset } from '@wellyboot/shared';
import { countDataset, createRelation, datasetFileName, dropRelation, existingRelation, selectDataset } from '../compiler/datasets';
import { tableRows, type EngineClient } from '../engine';

/** Where DuckDB reads a dataset's file from: bytes in hand (a File or a copy from OPFS), or an address it reads by ranges. */
export type DatasetBytes = { blob: Blob } | { url: string };

type DatasetRef = Pick<Dataset, 'id' | 'format' | 'fileName'>;

/**
 * Register a dataset's file with DuckDB and create its view or table, replacing what was registered under its id
 * before (a newer export, or another format). Returns the schema and row count DuckDB sees.
 */
export async function registerDataset(engine: EngineClient, ds: DatasetRef, bytes: DatasetBytes): Promise<{ schema: ColumnSchema[]; rowCount: number }> {
  const label = { label: 'Reading the dataset', priority: 'preview' as const };
  for (const row of tableRows((await engine.query(existingRelation(ds), label)).table)) await engine.query(dropRelation(ds, String(row.table_type)), label);
  const name = datasetFileName(ds);
  await engine.dropFile(name).catch(() => undefined);
  if ('url' in bytes) await engine.registerUrl(name, bytes.url);
  else await engine.registerFile(name, bytes.blob instanceof File ? bytes.blob : new File([bytes.blob], ds.fileName));
  try {
    await engine.query(createRelation(ds), label);
  } catch (e) {
    await engine.dropFile(name).catch(() => undefined);
    throw e;
  }
  const schema = await describeDataset(engine, ds);
  const rowCount = await countRows(engine, ds);
  return { schema, rowCount };
}

/** A registered dataset's columns, with DuckDB's exact types. */
export const describeDataset = (engine: EngineClient, ds: Pick<Dataset, 'id'>) => engine.describe(selectDataset(ds), { priority: 'preview' });

export async function countRows(engine: EngineClient, ds: Pick<Dataset, 'id'>): Promise<number> {
  const rows = tableRows((await engine.query(countDataset(ds), { label: 'Counting rows', priority: 'preview' })).table);
  return Number(rows[0]?.n ?? 0);
}

/** Drop a dataset's view or table and its file (on delete). */
export async function unregisterDataset(engine: EngineClient, ds: DatasetRef): Promise<void> {
  for (const row of tableRows((await engine.query(existingRelation(ds))).table)) await engine.query(dropRelation(ds, String(row.table_type)));
  await engine.dropFile(datasetFileName(ds)).catch(() => undefined);
}
