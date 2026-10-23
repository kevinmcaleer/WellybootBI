import { expect, test } from '@playwright/test';

test('the app switcher reads the shared list and goes to another Power Tools app', async ({ page }) => {
  // The landing page's list, served cross-origin as the real one is, with an app the built-in copy does not know.
  await page.route('https://kevspowertools.com/apps.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' },
      body: JSON.stringify({
        apps: [
          { id: 'puddle', name: 'Puddle', url: 'https://puddle.kevspowertools.com/', status: 'live' },
          { id: 'wellyboot-bi', name: 'Wellyboot BI', url: 'https://wellyboot.kevspowertools.com/', status: 'soon' },
          { id: 'new-tool', name: 'New tool', url: 'https://new.kevspowertools.com/', status: 'live' },
        ],
      }),
    }),
  );
  await page.route('https://puddle.kevspowertools.com/', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Puddle</title>' }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Switch app' }).click();
  const menu = page.getByRole('menu', { name: 'Switch app' });
  await expect(menu.getByRole('menuitemradio', { name: /Wellyboot BI/ })).toHaveAttribute('aria-checked', 'true');
  await expect(menu.getByRole('menuitemradio', { name: /New tool/ })).toBeVisible();
  await menu.getByRole('menuitemradio', { name: /^Puddle/ }).click();
  await expect(page).toHaveURL('https://puddle.kevspowertools.com/');
});
