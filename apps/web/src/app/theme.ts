import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'wellyboot.theme';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** System follows the OS through prefers-color-scheme; a manual pick pins data-theme on <html>. */
export function applyTheme(pref: ThemePreference, root: HTMLElement = document.documentElement) {
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  cycle: () => void;
}

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export const useTheme = create<ThemeState>((set, get) => ({
  preference: readPreference(),
  setPreference: (preference) => {
    try {
      if (preference === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      // Storage is blocked (private window); the choice lasts for this tab only.
    }
    applyTheme(preference);
    set({ preference });
  },
  cycle: () => get().setPreference(ORDER[(ORDER.indexOf(get().preference) + 1) % ORDER.length]!),
}));

export const THEME_LABEL: Record<ThemePreference, string> = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' };
export const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

/** The theme on screen: a manual pick, or the system's when following it. Charts, drawn on canvas, need to know. */
export const resolveTheme = (pref: ThemePreference, systemDark: boolean): 'light' | 'dark' => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref);

const DARK_QUERY = '(prefers-color-scheme: dark)';
const darkMedia = () => (typeof matchMedia === 'undefined' ? undefined : matchMedia(DARK_QUERY));
const subscribeSystem = (onChange: () => void) => {
  const m = darkMedia();
  m?.addEventListener('change', onChange);
  return () => m?.removeEventListener('change', onChange);
};

/** The theme on screen, following both the preference and the system. */
export function useResolvedTheme(): 'light' | 'dark' {
  const preference = useTheme((s) => s.preference);
  const systemDark = useSyncExternalStore(subscribeSystem, () => !!darkMedia()?.matches, () => false);
  return resolveTheme(preference, systemDark);
}
