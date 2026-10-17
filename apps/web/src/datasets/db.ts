// The browser's database for Wellyboot BI, after Puddle's src/persistence/db.ts: one IndexedDB database, upgraded in
// steps so a browser holding an older version keeps its records.

const DB = 'wellyboot';
/** 1: datasets and their file handles. Add a step to `upgrade` with each new version, never edit an old one. */
export const DB_VERSION = 1;
export const DATASETS = 'datasets';
/** Chromium's file handles, by dataset id, for datasets whose bytes are above the storage cap. */
export const HANDLES = 'handles';

/** Bring a database from `oldVersion` up to DB_VERSION, one version at a time. */
function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore(DATASETS, { keyPath: 'id' });
    db.createObjectStore(HANDLES, { keyPath: 'datasetId' });
  }
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => {
      // Let a newer Wellyboot BI in another tab upgrade the database; this tab reopens it on its next call.
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('This browser’s storage is unavailable.'));
  });
  // A failed open, including one that threw before any request (no IndexedDB), is tried again on the next call.
  attempt.catch(() => {
    if (opening === attempt) opening = null;
  });
  opening = attempt;
  return attempt;
}

/** Close the connection (tests reset the database between cases). */
export async function closeDb() {
  if (!opening) return;
  const db = await opening.catch(() => null);
  db?.close();
  opening = null;
}

/** One request in its own transaction, resolved once the transaction commits. */
export function run<T>(store: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('The save was interrupted.'));
      }),
  );
}
