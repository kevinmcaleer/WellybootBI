import { z } from 'zod';
import { FORMAT_VERSION } from './version.ts';

// A placeholder until Phase 5 defines the dashboard document: for now only the format version, so both apps
// already import their schemas from here.
export const DashboardZ = z.object({
  formatVersion: z.literal(FORMAT_VERSION),
});

export type Dashboard = z.infer<typeof DashboardZ>;
