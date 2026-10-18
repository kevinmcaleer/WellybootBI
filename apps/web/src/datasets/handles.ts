import { HANDLES, run } from './db';
import { ACCEPT } from './detect';

/**
 * Chromium's File System Access API, after Puddle's src/sources/handles.ts: a dataset too big to copy into the
 * browser keeps a handle to its file, so reopening it needs a permission click instead of a file dialog. Other
 * browsers lack it and choose the file again. Only the members used here are typed; TypeScript's DOM library
 * doesn't carry the Chromium-only ones.
 */
export interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission?(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' }): Promise<PermissionState>;
}

interface PickerHost {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    id?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileHandle[]>;
}

/** A file and, where the browser gave one, the handle to open it again later. */
export interface PickedFile {
  file: File;
  handle?: FileHandle;
}

/** True where files can be opened through handles that survive a reload (Chromium). */
export const supportsFileHandles = (host: unknown = globalThis): boolean => typeof (host as PickerHost | undefined)?.showOpenFilePicker === 'function';

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Choose a file with the browser's file picker and keep its handle. Returns null where the picker isn't available
 * (or refuses, e.g. in a cross-origin frame), meaning: fall back to an `<input type="file">`. Cancelling returns [].
 */
export async function pickFiles(host: unknown = globalThis): Promise<PickedFile[] | null> {
  if (!supportsFileHandles(host)) return null;
  let handles: FileHandle[];
  try {
    handles = await (host as Required<PickerHost>).showOpenFilePicker({
      multiple: false,
      id: 'wellyboot-datasets',
      types: [{ description: 'Data files', accept: { 'application/octet-stream': ACCEPT.split(',') } }],
    });
  } catch (e) {
    if (isAbort(e)) return [];
    return null;
  }
  return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
}

interface DropItem {
  kind: string;
  getAsFileSystemHandle?: () => Promise<{ kind: string; name: string } | null>;
}

/**
 * The files dropped, each with its handle where the browser gives one. Handles must be asked for during the drop
 * event itself, before anything is awaited, so this does that first.
 */
export async function droppedFiles(data: { items?: ArrayLike<DropItem>; files: ArrayLike<File> }, host: unknown = globalThis): Promise<PickedFile[]> {
  const files = Array.from(data.files);
  if (!supportsFileHandles(host) || !data.items) return files.map((file) => ({ file }));
  const pending = Array.from(data.items)
    .filter((i) => i.kind === 'file')
    .map((i) => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)));
  const handles = (await Promise.all(pending)).filter((h): h is FileHandle => h?.kind === 'file');
  return files.map((file) => {
    const at = handles.findIndex((h) => h.name === file.name);
    return at < 0 ? { file } : { file, handle: handles.splice(at, 1)[0] };
  });
}

/** The plain-words reason a stored handle couldn't be read. */
export function handleFailure(name: string, e: unknown): string {
  const kind = e instanceof DOMException ? e.name : '';
  if (kind === 'NotFoundError') return `${name} isn’t where it was. It may have been moved, renamed or deleted; choose it again.`;
  if (kind === 'NotAllowedError' || kind === 'SecurityError') return `Wellyboot BI wasn’t allowed to read ${name}. Choose it again.`;
  return `${name} couldn’t be opened again (${e instanceof Error ? e.message : String(e)}). Choose it again.`;
}

interface StoredHandle {
  datasetId: string;
  handle: FileHandle;
}

export const saveHandle = (datasetId: string, handle: FileHandle) =>
  run(HANDLES, 'readwrite', (s) => s.put({ datasetId, handle } satisfies StoredHandle)).then(() => undefined);

export const loadHandle = (datasetId: string) =>
  run<StoredHandle | undefined>(HANDLES, 'readonly', (s) => s.get(datasetId) as IDBRequest<StoredHandle | undefined>).then((r) => r?.handle);

export const deleteHandle = (datasetId: string) => run(HANDLES, 'readwrite', (s) => s.delete(datasetId)).then(() => undefined);

/**
 * Open the file behind a stored handle. `ask` requests permission, which needs a click; without it only a
 * permission the browser already remembers is used. Returns the file, or the reason it can't be read.
 */
export async function openHandle(handle: FileHandle, ask: boolean): Promise<{ file: File } | { reason: string; prompt: boolean }> {
  let state: PermissionState = 'granted';
  try {
    if (ask && handle.requestPermission) state = await handle.requestPermission({ mode: 'read' });
    else if (handle.queryPermission) state = await handle.queryPermission({ mode: 'read' });
  } catch {
    state = 'prompt';
  }
  if (state === 'prompt') return { reason: `Wellyboot BI can open ${handle.name} again once you allow it.`, prompt: true };
  if (state === 'denied') return { reason: `Permission to read ${handle.name} was refused. Choose it again.`, prompt: false };
  try {
    return { file: await handle.getFile() };
  } catch (e) {
    return { reason: handleFailure(handle.name, e), prompt: false };
  }
}
