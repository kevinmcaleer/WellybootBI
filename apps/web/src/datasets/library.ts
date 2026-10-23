import type { Dataset, Provenance } from '@wellyboot/shared';
import { create } from 'zustand';
import { whenEngine } from '../app/engine';
import type { EngineClient } from '../engine';
import { deleteDataset, listDatasets, newDatasetId, renameDataset, replaceDataset, saveDataset } from './catalogue';
import { detectFormat, datasetName } from './detect';
import { schemaDiff, type SchemaDiff } from './diff';
import type { PickedFile } from './handles';
import { headHash } from './hash';
import { readProvenance } from './provenance';
import { registerDataset, unregisterDataset, type DatasetBytes } from './register';
import { forgetBytes, keepBytes, loadBytes, type StoreOptions } from './store';
import { fetchAddress, nameFromAddress, parseAddress } from './url';
import { writeInWorker } from './opfsWriter';

/**
 * The datasets in this browser and whether each is ready to query in this tab. Reopening the app reads the
 * catalogue and registers every dataset whose bytes are still to hand; the rest wait for a click (a stored handle)
 * or for the file to be chosen again, as Puddle's reconnect banner does.
 */

export type Attach =
  | { state: 'loading' }
  | { state: 'ready'; /** The file chosen again doesn't start like the one the dataset was built on. */ mismatch?: boolean; note?: string }
  | { state: 'prompt'; reason: string }
  | { state: 'missing'; reason: string }
  | { state: 'failed'; reason: string };

interface LibraryState {
  loaded: boolean;
  /** Why the catalogue couldn't be read (no IndexedDB, say). */
  error?: string;
  datasets: Dataset[];
  attach: Record<string, Attach>;
}

export const useDatasets = create<LibraryState>(() => ({ loaded: false, datasets: [], attach: {} }));

export interface LibraryDeps {
  engine: () => Promise<EngineClient>;
  store?: StoreOptions;
}

let deps: LibraryDeps | null = null;

/** Where the library finds the engine and keeps bytes: the app's engine by default, a test engine in tests. */
export function configureLibrary(next: LibraryDeps) {
  deps = next;
}

const engineOf = () => (deps?.engine ?? whenEngine)();
const storeOpts = () => deps?.store ?? { writeInWorker };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const setAttach = (id: string, a: Attach) => useDatasets.setState((s) => ({ attach: { ...s.attach, [id]: a } }));
const refresh = async () => useDatasets.setState({ datasets: await listDatasets() });

/** Read the catalogue and register every dataset that can be, without asking for anything. */
export async function loadLibrary(): Promise<void> {
  let datasets: Dataset[];
  try {
    datasets = await listDatasets();
  } catch (e) {
    return useDatasets.setState({ loaded: true, datasets: [], attach: {}, error: `This browser’s storage can’t be read, so datasets can’t be kept: ${message(e)}` });
  }
  useDatasets.setState({ loaded: true, datasets, attach: Object.fromEntries(datasets.map((d) => [d.id, { state: 'loading' } as Attach])) });
  await Promise.all(datasets.map((d) => connect(d, false)));
}

/** Register a dataset from what was kept, asking for a handle's permission when `ask` (it must follow a click). */
async function connect(ds: Dataset, ask: boolean): Promise<void> {
  try {
    let bytes: DatasetBytes;
    if (ds.storage === 'none' && ds.url) bytes = await fetched(ds.url);
    else {
      const loaded = await loadBytes(ds.id, ds.storage, { ...storeOpts(), ask });
      if (loaded.state !== 'ready') return setAttach(ds.id, loaded);
      bytes = { blob: loaded.file };
    }
    await registerDataset(await engineOf(), ds, bytes);
    setAttach(ds.id, { state: 'ready' });
  } catch (e) {
    setAttach(ds.id, { state: 'failed', reason: message(e) });
  }
}

async function fetched(url: string): Promise<DatasetBytes> {
  const f = await fetchAddress(url);
  return f.ranged ? { url } : { blob: new Blob([new Uint8Array(f.data!)]) };
}

/** Reconnect a dataset kept by its file handle: one permission click, no file dialog. */
export async function reconnect(id: string): Promise<void> {
  const ds = useDatasets.getState().datasets.find((d) => d.id === id);
  if (ds) await connect(ds, true);
}

/** A file or address read and registered under a staging name, not yet in the catalogue. */
export interface Staged {
  id: string;
  record: Omit<Dataset, 'id' | 'name' | 'addedAt' | 'updatedAt' | 'storage'>;
  name: string;
  bytes: DatasetBytes;
  picked?: PickedFile;
}

async function stage(source: PickedFile | string, signal?: AbortSignal): Promise<Staged> {
  const id = newDatasetId();
  let bytes: DatasetBytes;
  let fileName: string;
  let format: Dataset['format'];
  let hash: string;
  let size: number;
  let url: string | undefined;
  if (typeof source === 'string') {
    const address = parseAddress(source);
    const f = await fetchAddress(address, { signal });
    url = address.href;
    fileName = nameFromAddress(address);
    ({ format, headHash: hash } = f);
    size = f.size ?? f.data?.byteLength ?? 0;
    bytes = f.ranged ? { url } : { blob: new Blob([new Uint8Array(f.data!)]) };
  } else {
    fileName = source.file.name;
    format = await detectFormat(source.file);
    hash = await headHash(source.file);
    size = source.file.size;
    bytes = { blob: source.file };
  }
  const engine = await engineOf();
  const ref = { id, format, fileName };
  const { schema, rowCount } = await registerDataset(engine, ref, bytes);
  let provenance: Provenance | undefined;
  try {
    provenance = await readProvenance(engine, ref);
  } catch {
    // A file without readable metadata is still a dataset.
  }
  return {
    id,
    name: datasetName(fileName),
    bytes,
    picked: typeof source === 'string' ? undefined : source,
    record: { fileName, format, schema, rowCount, headHash: hash, size, ...(url ? { url } : {}), ...(provenance ? { provenance } : {}) },
  };
}

async function keep(id: string, staged: Staged): Promise<{ storage: Dataset['storage']; note?: string }> {
  if ('url' in staged.bytes) {
    await forgetBytes(id, storeOpts());
    return { storage: 'none', note: 'It’s read from its address each time, a part at a time.' };
  }
  return keepBytes(id, staged.bytes.blob, staged.picked?.handle, storeOpts());
}

/** Add a dataset from a dropped or chosen file, or an https address. Throws, in plain words, when it can't be read. */
export async function addDataset(source: PickedFile | string): Promise<Dataset> {
  const staged = await stage(source);
  const kept = await keep(staged.id, staged);
  const now = new Date().toISOString();
  const dataset = await saveDataset({ ...staged.record, id: staged.id, name: staged.name, storage: kept.storage, addedAt: now, updatedAt: now });
  setAttach(dataset.id, { state: 'ready', note: kept.note });
  await refresh();
  return dataset;
}

/** Read a newer export for a dataset, and what it changes, before anything is replaced. */
export async function prepareReplacement(id: string, source: PickedFile | string): Promise<{ staged: Staged; diff: SchemaDiff }> {
  const ds = useDatasets.getState().datasets.find((d) => d.id === id);
  if (!ds) throw new Error('This dataset has been deleted.');
  const staged = await stage(source);
  return { staged, diff: schemaDiff(ds.schema, staged.record.schema) };
}

/** Replace a dataset with a prepared export. Its id stays, so dashboards built on it keep working. */
export async function replaceWith(id: string, staged: Staged): Promise<Dataset> {
  const engine = await engineOf();
  const record = staged.record;
  await registerDataset(engine, { id, format: record.format, fileName: record.fileName }, staged.bytes);
  await discard(staged);
  const kept = await keep(id, staged);
  const dataset = await replaceDataset(id, { ...record, storage: kept.storage });
  setAttach(id, { state: 'ready', note: kept.note });
  await refresh();
  return dataset;
}

/** Drop a prepared export that wasn't used. */
export async function discard(staged: Staged): Promise<void> {
  await unregisterDataset(await engineOf(), staged).catch(() => undefined);
}

/** Choose a missing dataset's file again. Warns, but goes on, when it doesn't start like the original. */
export async function chooseAgain(id: string, picked: PickedFile): Promise<void> {
  const ds = useDatasets.getState().datasets.find((d) => d.id === id);
  if (!ds) return;
  try {
    const hash = await headHash(picked.file);
    const format = await detectFormat(picked.file);
    const ref = { ...ds, format };
    await registerDataset(await engineOf(), ref, { blob: picked.file });
    const kept = await keepBytes(id, picked.file, picked.handle, storeOpts());
    await saveDataset({ ...ds, format, storage: kept.storage });
    setAttach(id, { state: 'ready', mismatch: hash !== ds.headHash, note: kept.note });
    await refresh();
  } catch (e) {
    setAttach(id, { state: 'failed', reason: message(e) });
  }
}

export async function rename(id: string, name: string): Promise<void> {
  await renameDataset(id, name);
  await refresh();
}

/** Delete a dataset: its record, its kept bytes or handle, and its view in DuckDB. */
export async function remove(id: string): Promise<void> {
  const ds = useDatasets.getState().datasets.find((d) => d.id === id);
  await deleteDataset(id);
  await forgetBytes(id, storeOpts());
  if (ds) await unregisterDataset(await engineOf(), ds).catch(() => undefined);
  useDatasets.setState((s) => {
    const { [id]: _, ...attach } = s.attach;
    return { attach };
  });
  await refresh();
}
