import { Button } from '../ui';
import { useSession } from '../app/session';

/** Every dashboard saved in this browser. None can be made yet (Phase 5), so for now it shows how to start. */
export function HomeScreen() {
  return (
    <div className="overflow-auto" data-testid="home">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-title">Dashboards</h1>
          <p className="text-ink-muted">Nothing leaves your browser until you publish.</p>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-md border border-line bg-surface-panel px-4 py-6" data-testid="home-empty">
          <h2 className="text-heading">No dashboards yet</h2>
          <p className="text-ink-muted">Export a dataset from a Puddle Output node as Parquet or CSV, then start a dashboard and add it as a data source.</p>
          <Button variant="primary" icon="plus" onClick={() => useSession.getState().navigate({ screen: 'editor' })}>
            New dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
