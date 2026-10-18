// What a visual calls for its rows. The query is checked and compiled, run at preview priority, and its result kept
// by compiled SQL and dataset version, so redrawing a dashboard runs nothing twice. Each visual has one query in
// flight: a newer one (the author typing in a filter) cancels the one before. A visual shows at most the row limit,
// so a line over a million-row group never freezes the tab; one row more is fetched to know whether to say so.
import type { ColumnSchema, Dataset, Query } from '@wellyboot/shared';
import { compileQuery, describeQuery, type QueryOptions as CompileOptions, type ResultColumn } from '../compiler/query';
import { tableRows, type QueryOptions, type QueryResult } from '../engine';
import { fullCount } from '../ui/format';
import { formatHints, type FormatHint } from './format';

export const DEFAULT_ROW_LIMIT = 10_000;

/** What runQuery needs of the engine; EngineClient in the app, a fake in tests. */
export interface QueryEngine {
  query(sql: string, opts?: QueryOptions): Promise<QueryResult>;
}

export interface RunOptions extends Omit<CompileOptions, 'maxRows'> {
  /** Changes whenever the dataset's data does (see datasetVersion), so a replaced export is queried again. */
  datasetVersion: string;
  /** The visual asking: its earlier query, if still running, is cancelled. */
  visualId?: string;
  /** The most rows a visual shows; DEFAULT_ROW_LIMIT unless given. */
  rowLimit?: number;
  signal?: AbortSignal;
}

export interface QueryRun {
  sql: string;
  columns: Array<ResultColumn & { hint: FormatHint }>;
  rows: Record<string, unknown>[];
  /** True when there were more rows than the row limit, and only the first rowLimit are here. */
  truncated: boolean;
  rowLimit: number;
  /** What to tell the author when the rows were cut: "Showing the first 10,000 rows". */
  notice?: string;
  elapsedMs: number;
}

/** A dataset's version for the cache: a newer export has another head hash or update time. */
export const datasetVersion = (ds: Pick<Dataset, 'id' | 'headHash' | 'updatedAt'>) => `${ds.id}:${ds.headHash}:${ds.updatedAt}`;

/** Finished results by dataset version and SQL, the least recently used dropped first. */
export class QueryCache {
  private readonly entries = new Map<string, QueryRun>();

  constructor(private readonly max = 100) {}

  static key = (datasetVersion: string, sql: string) => `${datasetVersion}\u0000${sql}`;

  get(key: string): QueryRun | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, run: QueryRun) {
    this.entries.delete(key);
    this.entries.set(key, run);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.max) break;
      this.entries.delete(oldest);
    }
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }
}

/** The cache the app's visuals share. */
export const queryCache = new QueryCache();

/** Each visual's query in flight, to cancel when it asks again. */
const inFlight = new Map<string, AbortController>();

/**
 * Run a visual's query. Rejects with a CompileError before reaching the engine when the query doesn't fit the
 * dataset, and with an EngineError coded "cancelled" when the same visual has asked again since.
 */
export async function runQuery(engine: QueryEngine, query: Query, schema: ColumnSchema[], opts: RunOptions, cache: QueryCache = queryCache): Promise<QueryRun> {
  const rowLimit = opts.rowLimit ?? DEFAULT_ROW_LIMIT;
  const { datasetVersion: version, visualId, signal, rowLimit: _, ...compile } = opts;
  const sql = compileQuery(query, schema, { ...compile, maxRows: rowLimit + 1 });

  const controller = new AbortController();
  if (visualId) {
    inFlight.get(visualId)?.abort();
    inFlight.set(visualId, controller);
  }
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const key = QueryCache.key(version, sql);
    const hit = cache.get(key);
    if (hit) return hit;
    const result = await engine.query(sql, { priority: 'preview', signal: controller.signal, label: 'Running a visual’s query' });
    const all = tableRows(result.table);
    const truncated = all.length > rowLimit;
    const columns = describeQuery(query, schema);
    const hints = formatHints(query, columns);
    const run: QueryRun = {
      sql,
      columns: columns.map((c, i) => ({ ...c, hint: hints[i]! })),
      rows: truncated ? all.slice(0, rowLimit) : all,
      truncated,
      rowLimit,
      ...(truncated && { notice: `Showing the first ${fullCount(rowLimit)} rows` }),
      elapsedMs: result.elapsedMs,
    };
    cache.set(key, run);
    return run;
  } finally {
    if (visualId && inFlight.get(visualId) === controller) inFlight.delete(visualId);
  }
}
