import { defineConfig } from '@playwright/test';
import { browserProjects } from './e2e/helpers/browsers';

// E2E_PORT lets several checkouts run the suite side by side without reusing each other's server.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [...(process.env.CI ? [['github'] as const] : []), ['list'] as const],
  // Numbers and dates are shown in the browser's locale, so it's fixed here rather than taken from the machine.
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', locale: 'en-GB' },
  projects: browserProjects(),
  webServer: {
    // vite build alone: the typecheck that `npm run build` adds is its own CI step.
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
