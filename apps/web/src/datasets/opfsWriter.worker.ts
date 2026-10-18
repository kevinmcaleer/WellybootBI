// Writes one OPFS file through a sync access handle, for browsers whose main thread can't (see opfsWriter.ts).

interface SyncHandle {
  truncate(size: number): void;
  write(data: Uint8Array, opts: { at: number }): number;
  flush(): void;
  close(): void;
}

const CHUNK = 8 * 1024 * 1024;

self.onmessage = async (e: MessageEvent<{ dir: string; name: string; data: Blob }>) => {
  const { dir, name, data } = e.data;
  let access: SyncHandle | undefined;
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getDirectoryHandle(dir, { create: true })).getFileHandle(name, { create: true });
    access = await (file as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
    access.truncate(0);
    for (let at = 0; at < data.size; at += CHUNK) access.write(new Uint8Array(await data.slice(at, at + CHUNK).arrayBuffer()), { at });
    access.flush();
    self.postMessage({ ok: true });
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  } finally {
    access?.close();
  }
};
