import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newVisual, type Dataset, type Visual } from '@wellyboot/shared';
import { cancelled } from '../engine/errors';
import type { QueryRun } from '../queries/run';
import { LiveQuery, liveKey, type LiveState } from './live';

const runQuery = vi.hoisted(() => vi.fn());
vi.mock('../queries/run', async (load) => ({ ...(await load<typeof import('../queries/run')>()), runQuery }));

const dataset = { id: 'dataset1', headHash: 'h1', updatedAt: '2026-10-18T00:00:00.000Z', schema: [{ name: 'Region', type: 'VARCHAR' }] } as unknown as Dataset;
const empty = newVisual('visual01', 'dataset1');
const byRegion = (filter?: string): Visual => ({
  ...empty,
  query: { ...empty.query, groups: [{ field: 'Region' }], filters: filter ? [{ field: 'Region', op: '=', value: filter }] : [] },
  chart: { ...empty.chart, encoding: { ...empty.chart.encoding, category: 0 } },
});
const run = (sql: string): QueryRun => ({ sql, columns: [], rows: [], truncated: false, rowLimit: 10_000, elapsedMs: 3 });

let states: Partial<LiveState>[];
let live: LiveQuery;
beforeEach(() => {
  vi.useFakeTimers();
  states = [];
  runQuery.mockReset();
  live = new LiveQuery({} as never, (p) => states.push(p), 100);
});
afterEach(() => {
  live.dispose();
  vi.useRealTimers();
});

describe('LiveQuery', () => {
  it('runs once after a burst of edits, for the last of them', async () => {
    runQuery.mockImplementation(async (_e, q) => run(JSON.stringify(q.filters)));
    live.request(byRegion('North'), dataset);
    live.request(byRegion('South'), dataset);
    live.request(byRegion('East'), dataset);
    expect(states.at(-1)).toEqual({ running: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery.mock.calls[0]![1].filters[0].value).toBe('East');
    expect(states.at(-1)).toMatchObject({ running: false, key: liveKey(byRegion('East'), dataset), error: undefined });
  });

  it('asks nothing again for the same query', async () => {
    runQuery.mockResolvedValue(run('q'));
    live.request(byRegion(), dataset);
    await vi.advanceTimersByTimeAsync(100);
    live.request({ ...byRegion(), name: 'Renamed' }, dataset);
    await vi.advanceTimersByTimeAsync(100);
    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps an older run that finishes late from replacing the newer one', async () => {
    let finishOld!: (r: QueryRun) => void;
    runQuery.mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve))).mockResolvedValueOnce(run('new'));
    live.request(byRegion('North'), dataset);
    await vi.advanceTimersByTimeAsync(100);
    live.request(byRegion('South'), dataset);
    await vi.advanceTimersByTimeAsync(100);
    finishOld(run('old'));
    await vi.runAllTimersAsync();
    const done = states.filter((s) => s.run);
    expect(done.map((s) => s.run!.sql)).toEqual(['new']);
  });

  it('stays quiet when a newer edit cancelled the run, and says why another failed', async () => {
    runQuery.mockRejectedValueOnce(cancelled()).mockRejectedValueOnce(new Error('Binder Error: no column Region'));
    live.request(byRegion('North'), dataset);
    await vi.advanceTimersByTimeAsync(100);
    expect(states.some((s) => 'error' in s && s.error)).toBe(false);
    live.request(byRegion('South'), dataset);
    await vi.advanceTimersByTimeAsync(100);
    expect(states.at(-1)).toEqual({ running: false, error: 'Binder Error: no column Region' });
  });

  it('clears the chart when the wells are emptied, without running', async () => {
    live.request(empty, dataset);
    expect(states).toEqual([{ running: false, run: undefined, key: undefined, error: undefined }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('runs nothing once disposed', async () => {
    live.request(byRegion(), dataset);
    live.dispose();
    await vi.advanceTimersByTimeAsync(100);
    expect(runQuery).not.toHaveBeenCalled();
  });
});
