import { droppedFiles, handleFailure, openHandle, pickFiles, supportsFileHandles, type FileHandle } from './handles';

const file = (name: string) => new File(['a,b\n1,2\n'], name);

function fakeHandle(name: string, opts: { query?: PermissionState; request?: PermissionState; getFile?: Error } = {}): FileHandle {
  return {
    kind: 'file',
    name,
    getFile: () => (opts.getFile ? Promise.reject(opts.getFile) : Promise.resolve(file(name))),
    queryPermission: () => Promise.resolve(opts.query ?? 'prompt'),
    requestPermission: () => Promise.resolve(opts.request ?? 'granted'),
  };
}

const firefoxLike = {};
const chromiumLike = (picker: () => Promise<FileHandle[]>) => ({ showOpenFilePicker: picker });

it('uses handles only where the browser has the file picker', () => {
  expect(supportsFileHandles(chromiumLike(() => Promise.resolve([])))).toBe(true);
  expect(supportsFileHandles(firefoxLike)).toBe(false);
  expect(supportsFileHandles(undefined)).toBe(false);
});

describe('pickFiles', () => {
  it('falls back to the file input without the picker', async () => {
    expect(await pickFiles(firefoxLike)).toBeNull();
  });

  it('returns the file and its handle', async () => {
    const h = fakeHandle('orders.parquet');
    const [picked] = (await pickFiles(chromiumLike(() => Promise.resolve([h]))))!;
    expect(picked?.handle).toBe(h);
    expect(picked?.file.name).toBe('orders.parquet');
  });

  it('returns nothing when cancelled, and falls back when the picker refuses', async () => {
    expect(await pickFiles(chromiumLike(() => Promise.reject(new DOMException('', 'AbortError'))))).toEqual([]);
    expect(await pickFiles(chromiumLike(() => Promise.reject(new DOMException('', 'SecurityError'))))).toBeNull();
  });
});

it('pairs dropped files with their handles by name', async () => {
  const h = fakeHandle('b.csv');
  const dropped = await droppedFiles(
    { files: [file('a.csv'), file('b.csv')], items: [{ kind: 'file', getAsFileSystemHandle: async () => null }, { kind: 'file', getAsFileSystemHandle: async () => h }] },
    chromiumLike(() => Promise.resolve([])),
  );
  expect(dropped.map((d) => [d.file.name, d.handle?.name])).toEqual([
    ['a.csv', undefined],
    ['b.csv', 'b.csv'],
  ]);
});

describe('opening a stored handle', () => {
  it('opens it when the browser remembers the permission', async () => {
    expect(await openHandle(fakeHandle('a.csv', { query: 'granted' }), false)).toHaveProperty('file');
  });

  it('waits for a click otherwise, then asks', async () => {
    expect(await openHandle(fakeHandle('a.csv'), false)).toEqual({ reason: 'Wellyboot BI can open a.csv again once you allow it.', prompt: true });
    expect(await openHandle(fakeHandle('a.csv'), true)).toHaveProperty('file');
  });

  it('says why when permission is refused or the file has moved', async () => {
    expect(await openHandle(fakeHandle('a.csv', { request: 'denied' }), true)).toEqual({ reason: 'Permission to read a.csv was refused. Choose it again.', prompt: false });
    expect(await openHandle(fakeHandle('a.csv', { query: 'granted', getFile: new DOMException('', 'NotFoundError') }), false)).toMatchObject({
      reason: expect.stringContaining('isn’t where it was'),
    });
  });
});

it('words handle failures plainly', () => {
  expect(handleFailure('a.csv', new DOMException('', 'NotAllowedError'))).toBe('Wellyboot BI wasn’t allowed to read a.csv. Choose it again.');
  expect(handleFailure('a.csv', new Error('boom'))).toBe('a.csv couldn’t be opened again (boom). Choose it again.');
});
