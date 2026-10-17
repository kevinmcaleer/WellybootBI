import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './helpers/axe';

/** Open the app and wait for DuckDB to start. */
async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('engine-ready')).toBeVisible({ timeout: 30_000 });
}

test('the app opens, the engine starts and runs a query', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Dashboards', exact: true })).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const rows = await page.evaluate(async () => {
    const { engine } = (globalThis as unknown as { __wellyboot: { engine: { query: (sql: string) => Promise<{ table: { toArray: () => { toJSON: () => unknown }[] } }> } } }).__wellyboot;
    const r = await engine.query('SELECT 1 AS one');
    return r.table.toArray().map((row) => row.toJSON());
  });
  expect(rows).toEqual([{ one: 1 }]);
});

test('the theme switch cycles system, light and dark, and the choice survives a reload', async ({ page }) => {
  await openApp(page);
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme');
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('the editor opens from the home screen, and Back returns', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'New dashboard' }).click();
  await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Dashboards', exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('the home screen, the editor and the shortcuts dialog have no accessibility issues', async ({ page }) => {
      await openApp(page);
      await expectAccessible(page, 'the home screen');
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      await expectAccessible(page, 'the shortcuts dialog');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'New dashboard' }).click();
      await expectAccessible(page, 'the editor');
    });
  });
}
