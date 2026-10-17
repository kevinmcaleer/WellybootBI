import { describe, expect, it } from 'vitest';
import { createApp, VERSION } from './app.ts';

describe('server', () => {
  it('answers the health check with its version and the dashboard format version', async () => {
    const res = await createApp().request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: VERSION, formatVersion: 1 });
  });

  it('answers anything else with 404', async () => {
    const res = await createApp().request('/nothing-here');
    expect(res.status).toBe(404);
  });
});
