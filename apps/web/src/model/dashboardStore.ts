// The open dashboard's own details, apart from its visuals. Only its name for now: dashboards aren't saved until
// Phase 5, which will load and store this with the rest of the dashboard.
import { create } from 'zustand';

export const UNTITLED_DASHBOARD = 'Untitled dashboard';

interface DashboardState {
  name: string;
  /** Rename the dashboard. A blank name is ignored, so the toolbar always has one to show. */
  rename: (name: string) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  name: UNTITLED_DASHBOARD,
  rename: (name) => {
    const trimmed = name.trim();
    if (trimmed) set({ name: trimmed });
  },
}));
