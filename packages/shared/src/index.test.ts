import { describe, expect, it } from 'vitest';
import { DashboardZ, FORMAT_VERSION } from './index.ts';

describe('@wellyboot/shared', () => {
  it('starts the format at version 1', () => {
    expect(FORMAT_VERSION).toBe(1);
  });

  it('accepts a dashboard at the current format version', () => {
    expect(DashboardZ.parse({ formatVersion: FORMAT_VERSION })).toEqual({ formatVersion: 1 });
  });

  it('rejects a dashboard from another format version', () => {
    expect(DashboardZ.safeParse({ formatVersion: FORMAT_VERSION + 1 }).success).toBe(false);
  });
});
