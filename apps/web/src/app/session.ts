import { create } from 'zustand';

export type Route = { screen: 'home' } | { screen: 'editor' };

/** The screen a location hash asks for: `#/editor` is the dashboard editor; anything else is home. */
export function routeFromHash(hash: string): Route {
  return hash.replace(/^#\/?/, '') === 'editor' ? { screen: 'editor' } : { screen: 'home' };
}

export const hashFor = (route: Route) => (route.screen === 'editor' ? '#/editor' : '#/');

interface SessionState {
  route: Route;
  shortcutsOpen: boolean;
  /** Go to a screen, adding it to the browser's history so Back returns. */
  navigate: (route: Route) => void;
  setShortcutsOpen: (open: boolean) => void;
}

/** Per-tab state that isn't part of any dashboard: the screen shown and which dialogs are open. */
export const useSession = create<SessionState>((set) => ({
  route: typeof location === 'undefined' ? { screen: 'home' } : routeFromHash(location.hash),
  shortcutsOpen: false,
  navigate: (route) => {
    if (typeof location !== 'undefined' && location.hash !== hashFor(route)) location.hash = hashFor(route);
    set({ route });
  },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));

/** Follow Back and Forward, and hashes typed into the address bar. */
export function followHash() {
  const sync = () => useSession.setState({ route: routeFromHash(location.hash) });
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
}
