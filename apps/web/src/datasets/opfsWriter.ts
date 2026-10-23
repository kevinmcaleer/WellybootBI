import type { WriteInWorker } from './store';

/**
 * Safari's main thread can't write OPFS files (it has no createWritable), but its workers can, through a sync
 * access handle. This runs the write in a small worker; other browsers never call it.
 */
export const writeInWorker: WriteInWorker = (dir, name, data) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./opfsWriter.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; message?: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve();
      else reject(new Error(e.data.message ?? 'The copy couldn’t be written.'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The copy couldn’t be written.'));
    };
    worker.postMessage({ dir, name, data });
  });
