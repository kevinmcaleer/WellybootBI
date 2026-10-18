import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { bootEngine, useEngineStore } from './app/engine';
import { applyTheme, useTheme } from './app/theme';
import { useDatasets } from './datasets/library';
import { runDatasetQuery } from './queries/run';
import { chartView } from './visuals/view';
import './index.css';

applyTheme(useTheme.getState().preference);
bootEngine();

// A handle for the Playwright tests and for poking at the engine from the console. Everything stays in this tab.
useEngineStore.subscribe((s) => {
  const engine = s.engine;
  if (engine) {
    (globalThis as { __wellyboot?: unknown }).__wellyboot = {
      engine,
      runQuery: (query: Parameters<typeof runDatasetQuery>[2], opts?: Parameters<typeof runDatasetQuery>[3]) => runDatasetQuery(engine, useDatasets.getState().datasets, query, opts),
      // The chart on screen's points, as the chart compiler gave them to Vega.
      chartData: () => chartView()?.data('source_0') ?? null,
      chartView,
    };
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
