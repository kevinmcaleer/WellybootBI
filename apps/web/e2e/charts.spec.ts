import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './helpers/axe';

// The chart editor end to end, in each browser: a dataset added through the picker, fields dragged (or added from
// the keyboard) into wells, and the points Vega drew read back through window.__wellyboot.chartData.

const fixture = join(import.meta.dirname, '../tests/fixtures/shop-sales.csv');

type Point = { xLabel: string; value: number; series?: string };

/** Open the editor, add shop-sales.csv and start a chart over it. */
async function startChart(page: Page) {
  await page.goto('/#/editor');
  await expect(page.getByTestId('engine-ready')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Add dataset' }).click();
  const b64 = readFileSync(fixture).toString('base64');
  await page.getByTestId('dataset-drop').evaluate((el, b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'shop-sales.csv'));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await page.getByRole('button', { name: 'Chart this dataset' }).click();
  await expect(page.getByTestId('visual-dataset')).toHaveText('shop-sales');
}

const field = (page: Page, name: string) => page.getByTestId('field').filter({ has: page.getByText(name, { exact: true }) }).getByRole('button');
/** Drag a field from the list into a well, and wait for its chip there, so a drag that didn't land says so. */
async function drag(page: Page, name: string, well: string) {
  const target = page.getByTestId(`well-${well}`);
  await field(page, name).dragTo(target);
  // A field dropped on Filters opens a new filter for it; anywhere else it becomes a chip.
  await expect(well === 'filters' ? page.getByRole('region', { name: `Filter ${name}` }) : target).toContainText(name);
}

/** The points on screen, as label and value, once the chart has settled on `expected`. */
async function expectPoints(page: Page, expected: Array<[string, number]>) {
  await expect
    .poll(async () => {
      const data = await page.evaluate(() => (globalThis as unknown as { __wellyboot: { chartData: () => Point[] | null } }).__wellyboot.chartData());
      return data?.map((p) => [p.xLabel, p.value]) ?? null;
    })
    .toEqual(expected);
}

const BY_REGION: Array<[string, number]> = [
  ['East', 100],
  ['North', 175],
  ['South', 120],
  ['West', 25],
];
const BY_MONTH: Array<[string, number]> = [
  ['Jan 2026', 180],
  ['Feb 2026', 135],
  ['Mar 2026', 90],
  ['Apr 2026', 15],
];

test('a bar chart by dragging fields into wells, with its rows in the status strip', async ({ page }) => {
  await startChart(page);
  await expect(page.getByTestId('chart-message')).toHaveText(/Add a field to Values/);
  await drag(page, 'Region', 'category');
  await drag(page, 'Sales', 'values');
  await expectPoints(page, BY_REGION);
  await expect(page.getByTestId('chart-canvas').locator('canvas, svg').first()).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('4 rows');
  await page.getByRole('tab', { name: /Data/ }).click();
  await expect(page.getByTestId('data-view')).toBeVisible();
  await expectAccessible(page, 'the chart editor');
});

test('switching to a line and a pie, filtering, and undoing back', async ({ page }) => {
  await startChart(page);
  await drag(page, 'Region', 'category');
  await drag(page, 'Sales', 'values');
  await expectPoints(page, BY_REGION);

  await page.locator('#chart-type').selectOption('line');
  await expect(page.getByTestId('edit-note')).toContainText('so Region was dropped');
  await drag(page, 'Date', 'category');
  await expect(page.getByRole('button', { name: 'Group Date: by month' })).toBeVisible();
  await expectPoints(page, BY_MONTH);

  await page.locator('#chart-type').selectOption('pie');
  await expect(page.getByTestId('editor')).toHaveAttribute('data-visual-type', 'pie');
  await drag(page, 'Region', 'category');
  await expectPoints(page, [
    ['North', 175],
    ['South', 120],
    ['East', 100],
    ['West', 25],
  ]);

  await drag(page, 'Region', 'filters');
  await page.getByRole('combobox', { name: 'Condition' }).selectOption('<>');
  await page.getByRole('combobox', { name: 'Value' }).fill('West');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('button', { name: 'Edit filter: Region is not West' })).toBeVisible();
  await expectPoints(page, [
    ['North', 175],
    ['South', 120],
    ['East', 100],
  ]);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Edit filter/ })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expectPoints(page, BY_MONTH);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByTestId('well-category')).toContainText('Region');
});

test('a chart built from the keyboard alone', async ({ page }) => {
  await startChart(page);
  for (const [name, item] of [
    ['Add Region', 'Add to Axis'],
    ['Add Sales', 'Add to Values'],
  ]) {
    await page.getByRole('button', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: item }).focus();
    await page.keyboard.press('Enter');
  }
  await expectPoints(page, BY_REGION);
  await page.getByRole('button', { name: 'Summarise Sales: Sum' }).focus();
  await page.keyboard.press('Enter');
  // The menu opens on the current choice, Sum; Max is four down.
  await expect(page.getByRole('menuitemradio', { name: 'Sum' })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Max' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expectPoints(page, [
    ['East', 60],
    ['North', 100],
    ['South', 70],
    ['West', 15],
  ]);
});

test('exporting the chart as PNG and SVG, and copying its SQL', async ({ page }) => {
  // Every browser guards the clipboard differently; what matters here is what the app writes to it.
  await page.addInitScript(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void w.copied.push(t) }, configurable: true });
  });
  await startChart(page);
  await drag(page, 'Region', 'category');
  await drag(page, 'Sales', 'values');
  await expectPoints(page, BY_REGION);
  await page.getByRole('tab', { name: 'Format' }).click();
  await page.locator('#format-title').fill('Sales by region');

  for (const format of ['PNG', 'SVG']) {
    await page.getByRole('button', { name: 'Export' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: `Download ${format}` }).click();
    expect((await download).suggestedFilename()).toBe(`sales-by-region.${format.toLowerCase()}`);
  }

  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: 'Copy SQL' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([expect.stringMatching(/GROUP BY/i)]);
});
