// The chart follows every edit: a change to the wells or filters asks for the visual's rows again, a moment later
// so a burst of edits (typing a filter's value) runs once, and the run before is cancelled (runQuery does that by
// visual id). The last rows stay on screen while the next ones come, and the status strip shows the row count and
// how long DuckDB took, as Puddle's results bar does.
import type { Dataset, Query, Visual } from '@wellyboot/shared';
import { create } from 'zustand';
import { isCancelled } from '../engine';
import { datasetVersion, runQuery, type QueryEngine, type QueryRun } from '../queries/run';
import { effectiveQuery } from './encode';

/** How long after an edit the query runs, so a burst of edits runs once. */
export const DEBOUNCE_MS = 120;

export interface LiveState {
  /** Running: rows are on their way (the last ones, if any, still shown). */
  running: boolean;
  run?: QueryRun;
  /** Which query the run answers (liveKey), so a chart is never drawn from another query's rows. */
  key?: string;
  /** Why the rows couldn't be read, in a sentence. */
  error?: string;
}

/** The live query's state, for the editor and the status strip. */
export const useLiveRun = create<LiveState>(() => ({ running: false }));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What a visual asks of its dataset, as a key: the same key, the same rows. */
export const liveKey = (visual: Visual, dataset: Dataset) => `${datasetVersion(dataset)}\u0000${JSON.stringify(effectiveQuery(visual))}`;

/** Whether a visual asks anything of its dataset yet. */
export const asksAnything = (v: Visual) => v.query.groups.length > 0 || v.query.measures.length > 0;

/**
 * Runs a visual's query after each change, debounced, the newer cancelling the older. One per editor; `set` hears
 * each state.
 */
export class LiveQuery {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private asked = '';
  private seq = 0;

  constructor(
    private readonly engine: QueryEngine,
    private readonly set: (patch: Partial<LiveState>) => void,
    private readonly debounceMs = DEBOUNCE_MS,
  ) {}

  /** Ask for a visual's rows. The same query again asks nothing. */
  request(visual: Visual, dataset: Dataset): void {
    const query = effectiveQuery(visual);
    const key = liveKey(visual, dataset);
    if (key === this.asked) return;
    this.asked = key;
    clearTimeout(this.timer);
    const n = ++this.seq;
    if (!asksAnything(visual)) {
      this.set({ running: false, run: undefined, key: undefined, error: undefined });
      return;
    }
    this.set({ running: true });
    this.timer = setTimeout(() => void this.run(n, visual.id, query, dataset, key), this.debounceMs);
  }

  private async run(n: number, visualId: string, query: Query, dataset: Dataset, key: string) {
    try {
      const run = await runQuery(this.engine, query, dataset.schema, { datasetVersion: datasetVersion(dataset), visualId });
      if (n === this.seq) this.set({ running: false, run, key, error: undefined });
    } catch (e) {
      // A newer edit's query cancelled this one; that one reports.
      if (isCancelled(e) || n !== this.seq) return;
      this.set({ running: false, error: message(e) });
    }
  }

  /** Stop: nothing pending runs, and nothing running reports. */
  dispose() {
    clearTimeout(this.timer);
    this.seq++;
    this.asked = '';
  }
}
