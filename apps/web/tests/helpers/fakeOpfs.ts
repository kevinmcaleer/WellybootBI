// Stand-ins for the origin private file system and the handle store, for dataset storage tests.
import type { FileHandle } from '../../src/datasets/handles';
import type { HandleStore, OpfsDir, OpfsFile } from '../../src/datasets/store';

/** An in-memory OPFS: directories of files, with createWritable unless `noWritable` (Safari's main thread). */
export function fakeOpfs(opts: { noWritable?: boolean; quota?: number } = {}) {
  const dirs = new Map<string, Map<string, Blob>>();
  const dir = (files: Map<string, Blob>): OpfsDir => ({
    async getDirectoryHandle() {
      throw new Error('not used');
    },
    async getFileHandle(name, o) {
      if (!files.has(name) && !o?.create) throw new DOMException('missing', 'NotFoundError');
      if (!files.has(name)) files.set(name, new Blob([]));
      const handle: OpfsFile = { getFile: async () => new File([files.get(name)!], name) };
      if (!opts.noWritable)
        handle.createWritable = async () => {
          let pending: Blob | undefined;
          return {
            async write(data) {
              if (opts.quota != null && data.size > opts.quota) throw new DOMException('full', 'QuotaExceededError');
              pending = data;
            },
            async close() {
              files.set(name, pending ?? new Blob([]));
            },
            async abort() {},
          };
        };
      return handle;
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
    },
  });
  const root: OpfsDir = {
    async getDirectoryHandle(name, o) {
      if (!dirs.has(name)) {
        if (!o?.create) throw new DOMException('missing', 'NotFoundError');
        dirs.set(name, new Map());
      }
      return dir(dirs.get(name)!);
    },
    getFileHandle: () => Promise.reject(new Error('not used')),
    removeEntry: () => Promise.reject(new Error('not used')),
  };
  return { root: async () => root, files: () => dirs.get('datasets') ?? new Map<string, Blob>() };
}

export function memoryHandles(): HandleStore & { map: Map<string, FileHandle> } {
  const map = new Map<string, FileHandle>();
  return {
    map,
    save: async (id, h) => void map.set(id, h),
    load: async (id) => map.get(id),
    remove: async (id) => void map.delete(id),
  };
}

