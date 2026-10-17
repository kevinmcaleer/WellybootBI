import { FORMAT_VERSION } from '@wellyboot/shared';

/** A placeholder home screen until the app shell lands (#16). */
export function App() {
  return (
    <div className="grid h-full place-items-center bg-surface-canvas text-body text-ink" data-testid="home">
      <main className="flex max-w-[560px] flex-col gap-2 px-4 text-center">
        <h1 className="font-display text-title">Wellyboot BI</h1>
        <p className="text-ink-muted">Charts and dashboards over your Puddle data. Nothing leaves your browser until you publish.</p>
        <p className="text-label text-ink-subtle">Dashboard format version {FORMAT_VERSION}</p>
      </main>
    </div>
  );
}
