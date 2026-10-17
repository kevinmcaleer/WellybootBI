import type { FileHandle } from './handles';
import { fakeOpfs, memoryHandles } from '../../tests/helpers/fakeOpfs';
import { DEFAULT_CAP, MB, datasetCap, forgetBytes, keepBytes, loadBytes, type StoreOptions } from './store';

function fakeHandle(name: string, permission: PermissionState = 'granted', body = 'a,b\n1,2\n'): FileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([body], name),
    queryPermission: async () => permission,
    requestPermission: async () => 'granted',
  };
}

const blob = (text: string) => new Blob([text]);
const text = async (loaded: Awaited<ReturnType<typeof loadBytes>>) => (loaded.state === 'ready' ? loaded.file.text() : loaded.state);

describe('keeping a dataset’s bytes', () => {
  let opfs: ReturnType<typeof fakeOpfs>;
  let handles: ReturnType<typeof memoryHandles>;
  let opts: StoreOptions;
  beforeEach(() => {
    opfs = fakeOpfs();
    handles = memoryHandles();
    opts = { root: opfs.root, handles, cap: 10 };
  });

  it('copies a file under the cap into OPFS and reads it back', async () => {
    expect(await keepBytes('ds1', blob('a,b\n1,2'), undefined, opts)).toEqual({ storage: 'opfs' });
    expect(await text(await loadBytes('ds1', 'opfs', opts))).toBe('a,b\n1,2');
  });

  it('keeps the handle of a file above the cap, and opens it when permission is remembered', async () => {
    const kept = await keepBytes('ds1', blob('x'.repeat(11)), fakeHandle('big.parquet'), opts);
    expect(kept).toMatchObject({ storage: 'handle', note: expect.stringContaining('larger than the') });
    expect(opfs.files().has('ds1')).toBe(false);
    expect(await text(await loadBytes('ds1', 'handle', opts))).toBe('a,b\n1,2\n');
  });

  it('waits for a click when the handle needs permission again, and asks on the click', async () => {
    await keepBytes('ds1', blob('x'.repeat(11)), fakeHandle('big.parquet', 'prompt'), opts);
    expect(await loadBytes('ds1', 'handle', opts)).toMatchObject({ state: 'prompt', reason: 'Wellyboot BI can open big.parquet again once you allow it.' });
    expect((await loadBytes('ds1', 'handle', { ...opts, ask: true })).state).toBe('ready');
  });

  it('says to choose the file again where there is neither room nor a handle', async () => {
    expect(await keepBytes('ds1', blob('x'.repeat(11)), undefined, opts)).toMatchObject({ storage: 'none', note: expect.stringContaining('choose the file again') });
    expect(await loadBytes('ds1', 'none', opts)).toEqual({ state: 'missing', reason: 'This file isn’t kept in this browser. Choose the file again to use this dataset.' });
  });

  it('falls back to the handle when OPFS is out of room', async () => {
    const full = fakeOpfs({ quota: 2 });
    const kept = await keepBytes('ds1', blob('abcdef'), fakeHandle('a.csv'), { ...opts, root: full.root });
    expect(kept).toMatchObject({ storage: 'handle', note: expect.stringContaining('can’t keep a copy') });
    expect(full.files().has('ds1')).toBe(false);
  });

  it('writes through the worker where the main thread can’t write OPFS (Safari)', async () => {
    const safari = fakeOpfs({ noWritable: true });
    const writes: string[] = [];
    const kept = await keepBytes('ds1', blob('abc'), undefined, { ...opts, root: safari.root, writeInWorker: async (dir, name) => void writes.push(`${dir}/${name}`) });
    expect(kept).toEqual({ storage: 'opfs' });
    expect(writes).toEqual(['datasets/ds1']);
  });

  it('works without OPFS at all', async () => {
    expect((await keepBytes('ds1', blob('abc'), undefined, { ...opts, root: async () => undefined })).storage).toBe('none');
  });

  it('says so when the browser has cleared its copy', async () => {
    expect(await loadBytes('gone', 'opfs', opts)).toMatchObject({ state: 'missing', reason: expect.stringContaining('no longer has its copy') });
  });

  it('replaces the old copy and handle when a newer export is kept, and forgets both on delete', async () => {
    await keepBytes('ds1', blob('x'.repeat(11)), fakeHandle('big.parquet'), opts);
    await keepBytes('ds1', blob('small'), undefined, opts);
    expect(handles.map.has('ds1')).toBe(false);
    expect(await text(await loadBytes('ds1', 'opfs', opts))).toBe('small');
    await forgetBytes('ds1', opts);
    expect(opfs.files().has('ds1')).toBe(false);
  });
});

describe('the cap', () => {
  const saved = (value: string | null) => ({ getItem: (key: string) => (key === 'wellyboot.datasetCapMb' ? value : null) });

  it('is 500 MB unless set', () => {
    expect(datasetCap(saved(null))).toBe(DEFAULT_CAP);
    expect(datasetCap(undefined)).toBe(DEFAULT_CAP);
    expect(DEFAULT_CAP).toBe(500 * MB);
  });

  it('can be set in megabytes, ignoring nonsense', () => {
    expect(datasetCap(saved('2000'))).toBe(2000 * MB);
    expect(datasetCap(saved('lots'))).toBe(DEFAULT_CAP);
    expect(datasetCap(saved('-5'))).toBe(DEFAULT_CAP);
  });
});
