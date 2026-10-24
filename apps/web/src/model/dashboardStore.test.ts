import { afterEach, describe, expect, it } from 'vitest';
import { UNTITLED_DASHBOARD, useDashboardStore } from './dashboardStore';

afterEach(() => useDashboardStore.setState({ name: UNTITLED_DASHBOARD }));

describe('the dashboard store', () => {
  it('starts untitled', () => {
    expect(useDashboardStore.getState().name).toBe('Untitled dashboard');
  });

  it('renames the dashboard, trimming the name', () => {
    useDashboardStore.getState().rename('  Lessons by month ');
    expect(useDashboardStore.getState().name).toBe('Lessons by month');
  });

  it('keeps the old name when the new one is blank', () => {
    useDashboardStore.getState().rename('Lessons');
    useDashboardStore.getState().rename('   ');
    expect(useDashboardStore.getState().name).toBe('Lessons');
  });
});
