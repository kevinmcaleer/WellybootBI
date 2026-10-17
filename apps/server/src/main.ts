import { serve } from '@hono/node-server';
import { createApp } from './app.ts';

const port = Number(process.env.WELLYBOOT_PORT ?? 8787);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Wellyboot BI server listening on port ${info.port}`);
});
