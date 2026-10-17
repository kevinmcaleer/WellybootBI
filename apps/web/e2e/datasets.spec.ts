import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './helpers/axe';

const fixture = (name: string) => join(import.meta.dirname, '../tests/fixtures', name);

/** Open the editor, where the data source picker opens first, once DuckDB has started. */
async function openEditor(page: Page) {
  await page.goto('/#/editor');
  await expect(page.getByTestId('engine-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: 'Data sources' })).toBeVisible();
}

/** Drop a file on the Add dataset dialog's drop zone, as dragging it from the desktop does. */
async function dropFile(page: Page, path: string, name: string) {
  const b64 = readFileSync(path).toString('base64');
  await page.getByTestId('dataset-drop').evaluate(
    (el, { b64, name }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { b64, name },
  );
}

/** Count a dataset's rows through the engine, by the id the panel shows. */
async function countRows(page: Page): Promise<number> {
  const id = await page.getByTestId('dataset-panel').getAttribute('data-dataset-id');
  return page.evaluate(async (id) => {
    const { engine } = (globalThis as unknown as { __wellyboot: { engine: { query: (sql: string) => Promise<{ table: { toArray: () => { toJSON: () => { n: number } }[] } }> } } }).__wellyboot;
    const r = await engine.query(`SELECT count(*)::INTEGER AS n FROM "ds_${id}"`);
    return r.table.toArray()[0]!.toJSON().n;
  }, id);
}

const fields = (page: Page) => page.getByTestId('dataset-field');

/** Wait for the open dataset's profile; if it fails, or the file can't be reattached, report what the panel says. */
async function expectProfiled(page: Page, warnings: string[]) {
  const panel = page.getByTestId('dataset-panel');
  await expect
    .poll(
      async () => {
        const failed = panel.getByText('Profile failed');
        if (await failed.isVisible()) return `Profile failed: ${await failed.getAttribute('title')}`;
        return (await panel.getByText(/distinct/).count()) > 0 ? 'profiled' : [await panel.innerText(), ...warnings].join('\n');
      },
      { timeout: 20_000 },
    )
    .toBe('profiled');
}

test('a Puddle Parquet export: add, profile, provenance, rename, replace, reload and delete', async ({ page, browserName }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await openEditor(page);
  await page.getByRole('button', { name: 'Add dataset' }).click();
  await dropFile(page, fixture('puddle-orders.parquet'), 'puddle-orders.parquet');

  const picker = page.getByRole('dialog', { name: 'Data sources' });
  await expect(picker.getByTestId('dataset-name')).toHaveText('puddle-orders');
  await expect(picker.getByTestId('dataset-summary')).toContainText('Parquet · 6 rows · 4 columns');
  await expect(fields(page)).toHaveCount(4);
  await expect(fields(page).nth(1)).toContainText('city');
  await expect(fields(page).nth(1)).toContainText('1 empty · 3 distinct');
  await expect(fields(page).nth(1)).toContainText('Most common: Leeds (3)');
  const provenance = picker.getByTestId('provenance');
  await expect(provenance).toContainText('Shop');
  await expect(provenance).toContainText('Clean orders');
  await expect(provenance).toContainText('No missing ids');
  await expectAccessible(page, 'the data source picker');

  await picker.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Shop orders');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(picker.getByTestId('dataset-name')).toHaveText('Shop orders');

  await picker.getByRole('button', { name: 'Replace' }).click();
  const replace = page.getByRole('dialog', { name: 'Replace Shop orders' });
  await replace.getByTestId('dataset-file-input').setInputFiles(fixture('puddle-orders-v2.parquet'));
  const diff = replace.getByTestId('schema-diff');
  await expect(diff.getByRole('region', { name: 'Added columns' })).toContainText('status');
  await expect(diff.getByRole('region', { name: 'Removed columns' })).toContainText('city');
  await expect(diff.getByRole('region', { name: 'Retyped columns' })).toContainText('total');
  await expectAccessible(page, 'the schema diff');
  await replace.getByRole('button', { name: 'Replace' }).click();
  // The dialog closes once the dataset is replaced; if it can't be, it stays open with the reason.
  await expect.poll(async () => ((await replace.isVisible()) ? await replace.getByRole('alert').allTextContents() : 'closed')).toBe('closed');
  await expect(picker.getByTestId('dataset-name')).toHaveText('Shop orders');
  await expect(picker.getByTestId('dataset-summary')).toContainText('7 rows');
  expect(await countRows(page)).toBe(7);

  await page.reload();
  await expect(page.getByTestId('engine-ready')).toBeVisible({ timeout: 30_000 });
  await expect(picker.getByTestId('dataset-list')).toContainText('Shop orders');
  if (browserName === 'webkit') {
    // Playwright's WebKit pages are private windows, where Safari keeps no copy: the file is chosen again,
    // as the panel asks. Other browsers must have kept it.
    await expect(picker.getByText('This file isn’t kept in this browser.', { exact: false })).toBeVisible();
    const opfs = await page.evaluate(async () => {
      if (typeof navigator.storage?.getDirectory !== 'function') return 'no getDirectory';
      try {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('probe', { create: true });
        const file = await dir.getFileHandle('probe', { create: true });
        return 'createWritable' in file ? 'writable' : 'no createWritable';
      } catch (e) {
        return `refused: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`;
      }
    });
    expect(`${opfs}\n${warnings.join('\n')}`).toMatch(/no private file storage|didn't keep a copy|no getDirectory|refused/);
    await picker.getByTestId('choose-again-input').setInputFiles(fixture('puddle-orders-v2.parquet'));
  }
  await expectProfiled(page, warnings);
  await expect(fields(page).nth(3)).toContainText('status');
  await expect(fields(page).nth(3)).toContainText('3 distinct');
  await expect(fields(page).nth(3)).toContainText('paid (5)');
  expect(await countRows(page)).toBe(7);

  await picker.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete Shop orders?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(picker.getByText(/No datasets yet/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Data sources' }).getByText(/No datasets yet/)).toBeVisible();
});

test('CSV, JSON and NDJSON exports load with Puddle’s column names', async ({ page }) => {
  await openEditor(page);
  const picker = page.getByRole('dialog', { name: 'Data sources' });
  for (const [file, columns] of [
    ['customers.csv', 'id, name, email, joined'],
    ['items.json', 'sku, qty'],
    ['events.ndjson', 'event, at'],
  ] as const) {
    await picker.getByRole('button', { name: 'Add dataset' }).click();
    await page.getByRole('dialog', { name: 'Add dataset' }).getByTestId('dataset-file-input').setInputFiles(fixture(file));
    await expect(picker.getByTestId('dataset-name')).toHaveText(file.replace(/\.\w+$/, ''));
    expect((await fields(page).locator('.ui-col').allTextContents()).join(', ')).toBe(columns);
  }
  await expect(picker.getByTestId('dataset-list').getByRole('button')).toHaveCount(3);
  await picker.getByRole('searchbox', { name: 'Search datasets' }).fill('item');
  await expect(picker.getByTestId('dataset-list').getByRole('button')).toHaveCount(1);
});

test('a file Wellyboot BI can’t read is refused in plain words', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Add dataset' }).click();
  const add = page.getByRole('dialog', { name: 'Add dataset' });
  await add.getByTestId('dataset-file-input').setInputFiles({ name: 'book.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(add.getByTestId('add-dataset-error')).toContainText('Export the Output node from Puddle as Parquet');
});
