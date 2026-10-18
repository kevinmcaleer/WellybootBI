// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, resolveTheme, useTheme } from './theme';

afterEach(() => useTheme.getState().setPreference('system'));

describe('theme', () => {
  it('follows the system by default and pins a manual choice on <html>', () => {
    expect(useTheme.getState().preference).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    useTheme.getState().setPreference('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps the choice on this device, and forgets it on going back to the system', () => {
    useTheme.getState().setPreference('light');
    expect(localStorage.getItem('wellyboot.theme')).toBe('light');
    useTheme.getState().setPreference('system');
    expect(localStorage.getItem('wellyboot.theme')).toBeNull();
  });

  it('cycles system, light, dark', () => {
    const seen = [1, 2, 3].map(() => (useTheme.getState().cycle(), useTheme.getState().preference));
    expect(seen).toEqual(['light', 'dark', 'system']);
  });

  it('resolves the theme on screen from the preference and the system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
