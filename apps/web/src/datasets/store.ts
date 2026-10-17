import type { DatasetStorage } from '@wellyboot/shared';
import { deleteHandle, loadHandle, openHandle, saveHandle, type FileHandle } from './handles';

/**
 * Where a dataset's bytes are kept between visits. Datasets are curated exports, so copying them into the origin
 * private file system (OPFS) is the default and dashboards reopen without choosing the file again. Above a cap the
 * copy isn't made: Chromium keeps a file handle instead, and other browsers ask for the file on the next visit.
 */

export const MB = 1024 * 1024;
export const DEFAULT_CAP = 500 * MB;
const CAP_KEY = 'wellyboot.datasetCapMb';
const DIR = 'datasets';

/** The per-dataset cap in bytes: 500 MB, or the number of megabytes saved under `wellyboot.datasetCapMb`. */
export function datasetCap(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): number {
  try {
    const mb = Number(storage?.getItem(CAP_KEY));
    if (Number.isFinite(mb) && mb > 0) return mb * MB;
  } catch {
    // No storage: the default applies.
  }
  return DEFAULT_CAP;
}

/** The members of the OPFS API used here, so tests can hand in a fake. */
export interface OpfsFile {
  getFile(): Promise<File>;
  createWritable?(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
}
export interface OpfsDir {
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<OpfsDir>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<OpfsFile>;
  removeEntry(name: string): Promise<void>;
}

/** Write a file where the main thread can't (Safari has no createWritable): see opfsWriter.ts. */
export type WriteInWorker = (dir: string, name: string, data: Blob) => Promise<void>;

/** Where file handles are kept: IndexedDB by default; tests hand in a map, as a fake handle can't be cloned. */
export interface HandleStore {
  save(datasetId: string, handle: FileHandle): Promise<void>;
  load(datasetId: string): Promise<FileHandle | undefined>;
  remove(datasetId: string): Promise<void>;
}

const idbHandles: HandleStore = { save: saveHandle, load: loadHandle, remove: deleteHandle };

export interface StoreOptions {
  handles?: HandleStore;
  /** The OPFS root; navigator.storage.getDirectory() by default. Resolves undefined where there is none. */
  root?: () => Promise<OpfsDir | undefined>;
  writeInWorker?: WriteInWorker;
  cap?: number;
}

async function defaultRoot(): Promise<OpfsDir | undefined> {
  try {
    return (await navigator.storage?.getDirectory?.()) as OpfsDir | undefined;
  } catch {
    return undefined;
  }
}

async function datasetsDir(opts: StoreOptions, create: boolean): Promise<OpfsDir | undefined> {
  const root = await (opts.root ?? defaultRoot)();
  if (!root) return undefined;
  try {
    return await root.getDirectoryHandle(DIR, { create });
  } catch {
    return undefined;
  }
}

async function writeOpfs(dir: OpfsDir, id: string, data: Blob, opts: StoreOptions): Promise<boolean> {
  try {
    const handle = await dir.getFileHandle(id, { create: true });
    if (handle.createWritable) {
      const out = await handle.createWritable();
      try {
        await out.write(data);
        await out.close();
      } catch (e) {
        await out.abort?.().catch(() => undefined);
        throw e;
      }
      return true;
    }
    if (opts.writeInWorker) {
      await opts.writeInWorker(DIR, id, data);
      return true;
    }
  } catch (e) {
    // Out of quota, or OPFS refused: forget the partial copy and fall back.
    console.warn(`The browser didn't keep a copy of the file (${e instanceof Error ? e.message : String(e)}).`);
  }
  await dir.removeEntry(id).catch(() => undefined);
  return false;
}

/** Where a dataset's bytes were kept, and why not in the browser when they weren't. */
export interface Kept {
  storage: DatasetStorage;
  /** Said in the dataset's panel when the bytes aren't copied into the browser. */
  note?: string;
}

const sizeText = (bytes: number) => `${Math.round(bytes / MB).toLocaleString('en')} MB`;

/**
 * Keep a dataset's bytes for next time: a copy in OPFS when it fits under the cap, else its file handle where
 * the browser gave one, else nothing (the file is chosen again after a reload). Replaces anything kept before.
 */
export async function keepBytes(id: string, data: Blob, handle: FileHandle | undefined, opts: StoreOptions = {}): Promise<Kept> {
  const cap = opts.cap ?? datasetCap();
  await forgetBytes(id, opts);
  if (data.size <= cap) {
    const dir = await datasetsDir(opts, true);
    if (dir && (await writeOpfs(dir, id, data, opts))) return { storage: 'opfs' };
  }
  const why = data.size > cap ? `It’s larger than the ${sizeText(cap)} kept in this browser` : 'This browser can’t keep a copy';
  if (handle) {
    try {
      await (opts.handles ?? idbHandles).save(id, handle);
      return { storage: 'handle', note: `${why}, so Wellyboot BI opens it from where it is, with your permission.` };
    } catch {
      // Fall through: the file is chosen again.
    }
  }
  return { storage: 'none', note: `${why}, so you’ll choose the file again after a reload.` };
}

/** What reading a dataset's kept bytes found. */
export type Loaded =
  | { state: 'ready'; file: Blob }
  /** A stored handle that needs a permission click (Reconnect). */
  | { state: 'prompt'; handle: FileHandle; reason: string }
  /** Nothing kept, or what was kept can't be read: the file is chosen again. */
  | { state: 'missing'; reason: string };

const CHOOSE_AGAIN = 'Choose the file again to use this dataset.';

/** Read back a dataset's bytes. `ask` asks for permission on a stored handle, which must follow a click. */
export async function loadBytes(id: string, storage: DatasetStorage, opts: StoreOptions & { ask?: boolean } = {}): Promise<Loaded> {
  if (storage === 'opfs') {
    const dir = await datasetsDir(opts, false);
    try {
      if (dir) return { state: 'ready', file: await (await dir.getFileHandle(id)).getFile() };
    } catch {
      // Cleared by the browser (storage pressure, or site data cleared).
    }
    return { state: 'missing', reason: `This browser no longer has its copy of the file. ${CHOOSE_AGAIN}` };
  }
  if (storage === 'handle') {
    const handle = await (opts.handles ?? idbHandles).load(id).catch(() => undefined);
    if (!handle) return { state: 'missing', reason: CHOOSE_AGAIN };
    const opened = await openHandle(handle, opts.ask ?? false);
    if ('file' in opened) return { state: 'ready', file: opened.file };
    return opened.prompt ? { state: 'prompt', handle, reason: opened.reason } : { state: 'missing', reason: opened.reason };
  }
  return { state: 'missing', reason: `This file isn’t kept in this browser. ${CHOOSE_AGAIN}` };
}

/** Forget a dataset's bytes and handle (on delete, or before keeping a newer export). */
export async function forgetBytes(id: string, opts: StoreOptions = {}): Promise<void> {
  const dir = await datasetsDir(opts, false);
  await dir?.removeEntry(id).catch(() => undefined);
  await (opts.handles ?? idbHandles).remove(id).catch(() => undefined);
}
