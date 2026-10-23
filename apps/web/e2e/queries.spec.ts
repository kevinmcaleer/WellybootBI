import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Phase 3 has no screen of its own: this runs visuals' queries through the app's engine in each browser, over a
// dataset added through the data source picker, as the chart editor will.

const fixture = join(import.meta.dirname, '../tests/fixtures/shop-orders.csv');

/** Add shop-orders.csv through the picker and return its dataset id. */
async function addOrders(page: Page): Promise<string> {
  await page.goto('/#/editor');
  await expect(page.getByTestId('engine-ready')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add dataset' }).click();
  const b64 = readFileSync(fixture).toString('base64');
  await page.getByTestId('dataset-drop').evaluate((el, b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'shop-orders.csv'));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await expect(page.getByTestId('dataset-name')).toHaveText('shop-orders');
  return (await page.getByTestId('dataset-panel').getAttribute('data-dataset-id'))!;
}

type Outcome = { rows: Record<string, unknown>[]; notice?: string } | { error: string; code?: string };

/** Run queries through window.__wellyboot.runQuery, all started at once, and say how each ended. */
function runQueries(page: Page, queries: Array<{ query: unknown; visualId?: string; rowLimit?: number }>): Promise<Outcome[]> {
  return page.evaluate(async (queries) => {
    type Run = (q: unknown, o?: object) => Promise<{ rows: Record<string, unknown>[]; notice?: string }>;
    const { runQuery } = (globalThis as unknown as { __wellyboot: { runQuery: Run } }).__wellyboot;
    return Promise.all(
      queries.map(({ query, ...opts }) =>
        runQuery(query, opts).then(
          (r) => ({ rows: r.rows, notice: r.notice }),
          (e: Error & { code?: string }) => ({ error: e.message, code: e.code }),
        ),
      ),
    );
  }, queries);
}

test('a visual’s query runs over a dataset from the picker, superseded queries are cancelled, and bad ones refused', async ({ page }) => {
  const datasetId = await addOrders(page);
  const byStatus = { datasetId, groups: [{ field: 'status' }], measures: [{ aggregate: 'sum', field: 'total' }, { aggregate: 'count' }] };

  const [grouped] = await runQueries(page, [{ query: byStatus }]);
  expect(grouped).toEqual({
    rows: [
      { status: 'pending', 'Sum of total': 9, Count: 2 },
      { status: 'shipped', 'Sum of total': expect.closeTo(25.74, 6), Count: 3 },
    ],
  });

  const [topOne] = await runQueries(page, [{ query: { datasetId, groups: [{ field: 'customer_id' }], measures: [{ aggregate: 'count' }], sort: [{ by: 'measure', index: 0, dir: 'desc' }], limit: { n: 1, others: true } } }]);
  expect(topOne).toEqual({ rows: [{ customer_id: 1, Count: 2, __others: false }, { customer_id: null, Count: 3, __others: true }] });

  const [first, second] = await runQueries(page, [
    // Not run before, so it isn't answered from the cache.
    { query: { ...byStatus, filters: [{ field: 'total', op: '>', value: 1 }] }, visualId: 'chart-1' },
    { query: { ...byStatus, filters: [{ field: 'total', op: '>', value: 5 }] }, visualId: 'chart-1' },
  ]);
  expect(first).toMatchObject({ code: 'cancelled' });
  expect(second).toMatchObject({ rows: [{ status: 'pending', Count: 1 }, { status: 'shipped', Count: 2 }] });

  const [capped] = await runQueries(page, [{ query: { datasetId, groups: [{ field: 'order_id' }], measures: [{ aggregate: 'count' }] }, rowLimit: 3 }]);
  expect(capped).toMatchObject({ notice: 'Showing the first 3 rows' });
  expect((capped as { rows: unknown[] }).rows).toHaveLength(3);

  const [refused] = await runQueries(page, [{ query: { datasetId, measures: [{ aggregate: 'sum', field: 'status' }] } }]);
  expect(refused).toEqual({ error: 'Sum needs a number; status is text', code: undefined });
});
