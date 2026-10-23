import { DatasetZ, type Dataset } from '@wellyboot/shared';
import { DATASETS, run } from './db';

/**
 * The dataset catalogue: one record per dataset in IndexedDB. Records are checked with DatasetZ as they are read,
 * so one damaged record is left out of the list rather than breaking it.
 */

const byNewest = (a: Dataset, b: Dataset) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

/** Every dataset, most recently added or replaced first. */
export async function listDatasets(): Promise<Dataset[]> {
  const rows = await run<unknown[]>(DATASETS, 'readonly', (s) => s.getAll());
  return rows.flatMap((r) => {
    const parsed = DatasetZ.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  }).sort(byNewest);
}

export async function getDataset(id: string): Promise<Dataset | undefined> {
  const row = await run<unknown>(DATASETS, 'readonly', (s) => s.get(id));
  const parsed = DatasetZ.safeParse(row);
  return parsed.success ? parsed.data : undefined;
}

/** Add or overwrite a dataset's record. */
export async function saveDataset(dataset: Dataset): Promise<Dataset> {
  const valid = DatasetZ.parse(dataset);
  await run(DATASETS, 'readwrite', (s) => s.put(valid));
  return valid;
}

const nowIso = () => new Date().toISOString();

async function existing(id: string): Promise<Dataset> {
  const dataset = await getDataset(id);
  if (!dataset) throw new Error('This dataset has been deleted.');
  return dataset;
}

export async function renameDataset(id: string, name: string): Promise<Dataset> {
  const dataset = await existing(id);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the dataset a name.');
  return saveDataset({ ...dataset, name: trimmed, updatedAt: nowIso() });
}

/** What a newer export changes about a dataset: everything but its id, name and when it was first added. */
export type Replacement = Omit<Dataset, 'id' | 'name' | 'addedAt' | 'updatedAt'>;

/** Point a dataset at a newer export. Its id stays, so dashboards built on it keep working. */
export async function replaceDataset(id: string, next: Replacement): Promise<Dataset> {
  const dataset = await existing(id);
  return saveDataset({ ...next, id, name: dataset.name, addedAt: dataset.addedAt, updatedAt: nowIso() });
}

export const deleteDataset = (id: string) => run(DATASETS, 'readwrite', (s) => s.delete(id)).then(() => undefined);

/** A new dataset id: 16 lower-case letters and digits, safe in a DuckDB view name. */
export function newDatasetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-6);
}
