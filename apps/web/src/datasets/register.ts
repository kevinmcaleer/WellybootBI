import type { ColumnSchema, Dataset } from '@wellyboot/shared';
import { countDataset, createRelation, datasetFileName, dropRelation, existingRelation, selectDataset } from '../compiler/datasets';
import { tableRows, type EngineClient } from '../engine';

/** Where DuckDB reads a dataset's file from: bytes in hand (a File or a copy from OPFS), or an address it reads by ranges. */
export type DatasetBytes = { blob: Blob } | { url: string };

type DatasetRef = Pick<Dataset, 'id' | 'format' | 'fileName'>;

/** The file each dataset's view or table reads now, by dataset id, so the one before can be dropped. */
const registered = new Map<string, string>();
let version = 0;

/** The name a registered dataset's file goes by in DuckDB, for reading its metadata. */
export const registeredFileName = (id: string) => registered.get(id);

/**
 * Register a dataset's file with DuckDB and create its view or table, replacing what was registered under its id
 * before (a newer export, or another format). Returns the schema and row count DuckDB sees.
 */
export async function registerDataset(engine: EngineClient, ds: DatasetRef, bytes: DatasetBytes): Promise<{ schema: ColumnSchema[]; rowCount: number }> {
  const label = { label: 'Reading the dataset', priority: 'preview' as const };
  const name = datasetFileName(ds, ++version);
  if ('url' in bytes) await engine.registerUrl(name, bytes.url);
  // A File of its own for each name, so dropping one name never closes the file another name reads.
  else await engine.registerFile(name, new File([bytes.blob], ds.fileName));
  try {
    for (const row of tableRows((await engine.query(existingRelation(ds), label)).table)) await engine.query(dropRelation(ds, String(row.table_type)), label);
    await engine.query(createRelation(ds, name), label);
  } catch (e) {
    await engine.dropFile(name).catch(() => undefined);
    throw e;
  }
  const before = registered.get(ds.id);
  registered.set(ds.id, name);
  if (before) await engine.dropFile(before).catch(() => undefined);
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

/** Drop a dataset's view or table and its file (on delete, or a replacement that wasn't used). */
export async function unregisterDataset(engine: EngineClient, ds: Pick<Dataset, 'id'>): Promise<void> {
  for (const row of tableRows((await engine.query(existingRelation(ds))).table)) await engine.query(dropRelation(ds, String(row.table_type)));
  const name = registered.get(ds.id);
  registered.delete(ds.id);
  if (name) await engine.dropFile(name).catch(() => undefined);
}
