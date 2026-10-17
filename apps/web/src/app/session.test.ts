import { describe, expect, it } from 'vitest';
import { hashFor, routeFromHash } from './session';

describe('routes', () => {
  it('reads the editor from its hash and treats anything else as home', () => {
    expect(routeFromHash('#/editor')).toEqual({ screen: 'editor' });
    expect(routeFromHash('#editor')).toEqual({ screen: 'editor' });
    expect(routeFromHash('')).toEqual({ screen: 'home' });
    expect(routeFromHash('#/nothing')).toEqual({ screen: 'home' });
  });

  it('writes a hash that reads back as the same route', () => {
    for (const r of [{ screen: 'home' }, { screen: 'editor' }] as const) expect(routeFromHash(hashFor(r))).toEqual(r);
  });
});
