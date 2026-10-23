import { useState } from 'react';
import { newVisual, type Dataset } from '@wellyboot/shared';
import { DataSourcePicker } from '../datasets/DataSourcePicker';
import { useDatasets } from '../datasets/library';
import { useVisual, useVisualStore } from '../model/visualStore';
import { Button } from '../ui';
import { VisualEditor } from './VisualEditor';

const newVisualId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The dashboard editor. Phase 4 edits one chart at a time: the data source picker opens first, since a chart starts
 * from its data, and choosing a dataset starts a chart over it. Phase 5 puts several on the canvas.
 */
export function EditorScreen() {
  const visual = useVisual();
  const dataset = useDatasets((s) => (visual ? s.datasets.find((d) => d.id === visual.datasetId) : undefined));
  const [picking, setPicking] = useState(!visual);
  const use = (ds: Dataset) => {
    if (visual?.datasetId !== ds.id) useVisualStore.getState().open(newVisual(newVisualId(), ds.id), ds.schema);
    setPicking(false);
  };
  return (
    <>
      {visual && dataset ? (
        <VisualEditor visual={visual} dataset={dataset} onChangeDataset={() => setPicking(true)} />
      ) : (
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]" data-testid="editor">
          <main aria-label="Canvas" className="grid place-items-center bg-surface-canvas p-4" data-testid="canvas">
            <p className="text-ink-muted">Choose a dataset in Data sources to start a chart.</p>
          </main>
          <aside aria-label="Inspector" className="flex flex-col items-start gap-2 border-l border-line bg-surface-panel p-4" data-testid="inspector">
            <h2 className="ui-eyebrow">Inspector</h2>
            <p className="text-label text-ink-muted">A chart’s fields and format show here.</p>
            <Button icon="source" onClick={() => setPicking(true)}>
              Data sources
            </Button>
          </aside>
        </div>
      )}
      {picking && <DataSourcePicker onClose={() => setPicking(false)} onUse={use} />}
    </>
  );
}
