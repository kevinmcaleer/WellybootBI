import { useState } from 'react';
import { DataSourcePicker } from '../datasets/DataSourcePicker';
import { Button } from '../ui';

/**
 * The dashboard editor's layout: the canvas, with the inspector docked right. Both are placeholders until Phase 4.
 * The data source picker opens first, since a dashboard starts from its data.
 */
export function EditorScreen() {
  const [picking, setPicking] = useState(true);
  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]" data-testid="editor">
      <main aria-label="Canvas" className="grid place-items-center bg-surface-canvas p-4" data-testid="canvas">
        <p className="text-ink-muted">Charts you add will appear here.</p>
      </main>
      <aside aria-label="Inspector" className="flex flex-col items-start gap-2 border-l border-line bg-surface-panel p-4" data-testid="inspector">
        <h2 className="ui-eyebrow">Inspector</h2>
        <p className="text-label text-ink-muted">Select a chart to change its data and format.</p>
        <Button icon="source" onClick={() => setPicking(true)}>
          Data sources
        </Button>
      </aside>
      {picking && <DataSourcePicker onClose={() => setPicking(false)} />}
    </div>
  );
}
