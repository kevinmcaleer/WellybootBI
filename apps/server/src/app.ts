import { Hono } from 'hono';
import { FORMAT_VERSION } from '@wellyboot/shared';

export const VERSION = '0.1.0';

/** The server's routes. Publishing, share links and embeds arrive in Phase 6; for now only the health check. */
export function createApp() {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ status: 'ok', version: VERSION, formatVersion: FORMAT_VERSION }));
  return app;
}
