// DuckDB-WASM's blocking Node build behind the same DuckBackend interface the browser uses,
// so engine and compiler tests run real DuckDB-WASM against fixture files.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDuckDB, NODE_RUNTIME, VoidLogger } from '@duckdb/duckdb-wasm/blocking';
import { tableFromIPC } from 'apache-arrow';
import type { DuckBackend } from '../../src/engine/types';
import { cancelled } from '../../src/engine/errors';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs'));
/**
 * The blocking build loads Arrow through CommonJS, so its tables are instances of a second copy of Arrow's classes
 * that the app's (ESM) Arrow functions don't recognise: tableToIPC writes nothing for them. In the browser DuckDB and
 * the app share one Arrow, so results are passed through IPC here to match.
 */
const cjsArrow = require('apache-arrow') as typeof import('apache-arrow');

/** DuckDB's own lexer (the tokenizer behind its parser), for checking ours against it. Offsets and token types. */
export async function createNodeTokenizer(): Promise<(sql: string) => { offsets: number[]; types: number[] }> {
  const db = await createDuckDB(
    {
      mvp: { mainModule: join(dist, 'duckdb-mvp.wasm'), mainWorker: join(dist, 'duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: join(dist, 'duckdb-eh.wasm'), mainWorker: join(dist, 'duckdb-node-eh.worker.cjs') },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await db.instantiate();
  return (sql) => db.tokenize(sql);
}

/** Where `npm run fetch-extensions` puts DuckDB's json and parquet extensions; CI fetches them before the tests. */
const EXTENSIONS_DIR = join(__dirname, '../../public/duckdb-extensions');

/**
 * DuckDB-WASM fetches an extension's file with a synchronous XMLHttpRequest, which Node lacks: without one, LOAD
 * waits forever. This reads local paths with the file system instead, only while extensions load.
 */
function withLocalXhr<T>(fn: () => T): T {
  class LocalXhr {
    status = 0;
    response: ArrayBuffer = new ArrayBuffer(0);
    private url = '';
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    getResponseHeader() {
      return null;
    }
    getAllResponseHeaders() {
      return '';
    }
    send() {
      try {
        const data = readFileSync(this.url.replace(/^file:\/\//, ''));
        this.response = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        this.status = 200;
      } catch {
        this.status = 404;
      }
    }
  }
  const g = globalThis as { XMLHttpRequest?: unknown };
  const before = g.XMLHttpRequest;
  g.XMLHttpRequest = LocalXhr;
  try {
    return fn();
  } finally {
    g.XMLHttpRequest = before;
  }
}

export interface NodeBackendOptions {
  beforeQuery?: (sql: string) => Promise<void>;
  /**
   * Load DuckDB's json and parquet extensions from the local copy, for tests that read those formats. Without it
   * the engine stays hermetic and a read that needs an extension fails, as the plain-word error tests expect.
   */
  extensions?: boolean;
}

export async function createNodeBackend(opts: NodeBackendOptions = {}): Promise<DuckBackend> {
  const db = await createDuckDB(
    {
      mvp: { mainModule: join(dist, 'duckdb-mvp.wasm'), mainWorker: join(dist, 'duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: join(dist, 'duckdb-eh.wasm'), mainWorker: join(dist, 'duckdb-node-eh.worker.cjs') },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await db.instantiate();
  db.open({ path: ':memory:', query: { castBigIntToDouble: false } });
  let conn = db.connect();
  // Extensions (json, parquet) download from extensions.duckdb.org on first use, which blocks this
  // synchronous build when offline. Tests stay hermetic: anything needing an extension fails fast instead.
  conn.query('SET autoinstall_known_extensions = false');
  conn.query('SET autoload_known_extensions = false');
  if (opts.extensions) {
    const dir = join(EXTENSIONS_DIR, db.getVersion(), 'wasm_eh');
    if (!existsSync(dir)) throw new Error(`DuckDB's extensions aren't in ${dir}. Run \`npm run fetch-extensions -w @wellyboot/web\` once, then run the tests again.`);
    withLocalXhr(() => {
      for (const ext of ['json', 'parquet']) conn.query(`LOAD '${join(dir, `${ext}.duckdb_extension.wasm`).replace(/'/g, "''")}'`);
    });
  }
  const outDir = mkdtempSync(join(tmpdir(), 'wellyboot-export-'));
  return {
    info: { bundle: 'eh', version: db.getVersion(), spill: false, crossOriginIsolated: false },
    async query(sql, signal) {
      await opts.beforeQuery?.(sql);
      if (signal.aborted) throw cancelled();
      return tableFromIPC(cjsArrow.tableToIPC(conn.query(sql), 'stream'));
    },
    async registerFile(name, file) {
      db.registerFileBuffer(name, new Uint8Array(await file.arrayBuffer()));
    },
    // The Node build has no HTTP file system here, so an address is fetched whole (tests serve it locally).
    async registerUrl(name, url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      db.registerFileBuffer(name, new Uint8Array(await res.arrayBuffer()));
    },
    async registerBuffer(name, data) {
      db.registerFileBuffer(name, data);
    },
    async dropFile(name) {
      db.dropFile(name);
    },
    async insertArrow(name, ipc) {
      conn.insertArrowFromIPCStream(ipc, { name, create: true });
    },
    async reconnect() {
      conn = db.connect();
    },
    // The Node build's COPY writes to the real disk, so exports go to a temp folder and are read back from it.
    async openOutput(name) {
      const path = join(outDir, name);
      return {
        path,
        async finish() {
          const data = readFileSync(path);
          rmSync(path, { force: true });
          return new Blob([data]);
        },
        async discard() {
          rmSync(path, { force: true });
        },
      };
    },
    async close() {
      conn.close();
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}
