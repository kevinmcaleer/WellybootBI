import { useEffect, useMemo, useState } from 'react';
import type { Dataset } from '@wellyboot/shared';
import { Banner, Button, Dialog, Field, TextInput, cx } from '../ui';
import { counted } from './words';
import { AddDatasetDialog } from './AddDatasetDialog';
import { DatasetPanel } from './DatasetPanel';
import { loadLibrary, reconnect, remove, rename, useDatasets } from './library';
import { ReplaceDatasetDialog } from './ReplaceDatasetDialog';

type Sub = { kind: 'add' } | { kind: 'rename' | 'replace' | 'delete'; dataset: Dataset } | null;

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function RenameDialog({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const [name, setName] = useState(dataset.name);
  return (
    <Dialog
      title="Rename dataset"
      confirm="Rename"
      confirmDisabled={!name.trim()}
      onConfirm={() => void rename(dataset.id, name).then(onClose)}
      onClose={onClose}
      className="w-[400px] max-w-[calc(100vw-32px)]"
    >
      <Field label="Name" htmlFor="dataset-rename">
        <TextInput id="dataset-rename" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
      </Field>
    </Dialog>
  );
}

function DeleteDialog({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  return (
    <Dialog title={`Delete ${dataset.name}?`} confirm="Delete" danger onConfirm={() => void remove(dataset.id).then(onClose)} onClose={onClose} className="w-[400px] max-w-[calc(100vw-32px)]">
      <p className="text-body">Its copy in this browser is deleted too. Charts that use it will have no data until you add it again.</p>
    </Dialog>
  );
}

/** Datasets kept from last time that need a permission click, all reconnected with one (Puddle's reconnect banner). */
function ReconnectBanner() {
  const datasets = useDatasets((s) => s.datasets);
  const attach = useDatasets((s) => s.attach);
  const waiting = datasets.filter((d) => attach[d.id]?.state === 'prompt');
  if (!waiting.length) return null;
  return (
    <div data-testid="reconnect-banner">
      <Banner
        tone="info"
        title="Files from last time"
        action={
          <Button size="sm" variant="primary" icon="source" onClick={() => void Promise.all(waiting.map((d) => reconnect(d.id)))}>
            Reconnect {plural(waiting.length, 'file')}
          </Button>
        }
      >
        Wellyboot BI can open {waiting.map((d) => d.fileName).join(', ')} again once you allow it.
      </Banner>
    </div>
  );
}

/** The data source picker: the datasets in this browser, newest first, and the one selected. */
export function DataSourcePicker({ onClose }: { onClose: () => void }) {
  const loaded = useDatasets((s) => s.loaded);
  const datasets = useDatasets((s) => s.datasets);
  const attach = useDatasets((s) => s.attach);
  const error = useDatasets((s) => s.error);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  useEffect(() => {
    if (!useDatasets.getState().loaded) void loadLibrary();
  }, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? datasets.filter((d) => d.name.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)) : datasets;
  }, [datasets, query]);
  const selected = datasets.find((d) => d.id === selectedId) ?? shown[0];
  return (
    <>
      {!sub && (
        <Dialog title="Data sources" onClose={onClose} className="w-[960px] max-w-[calc(100vw-32px)]">
          <ReconnectBanner />
          {error && <Banner tone="fail" title="Datasets can’t be kept">{error}</Banner>}
          <div className="grid h-[min(560px,65vh)] grid-cols-[260px_minmax(0,1fr)] gap-4" data-testid="data-source-picker">
            <div className="flex min-h-0 flex-col gap-2">
              <Button variant="primary" icon="plus" onClick={() => setSub({ kind: 'add' })}>
                Add dataset
              </Button>
              <TextInput type="search" placeholder="Search datasets" aria-label="Search datasets" value={query} onChange={(e) => setQuery(e.target.value)} />
              <ul className="flex min-h-0 flex-col gap-1 overflow-auto" aria-label="Datasets" data-testid="dataset-list">
                {shown.map((d) => {
                  const state = attach[d.id]?.state;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-current={d.id === selected?.id ? 'true' : undefined}
                        onClick={() => setSelectedId(d.id)}
                        className={cx('flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1 text-left hover:bg-surface-hover', d.id === selected?.id && 'bg-brand-tint')}
                      >
                        <span className="text-body-strong">{d.name}</span>
                        <span className="ui-metric">
                          {counted(d.rowCount, 'row')} · {counted(d.schema.length, 'column')}
                          {state === 'missing' || state === 'prompt' || state === 'failed' ? ' · needs its file' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {loaded && !datasets.length && <p className="text-label text-ink-muted">No datasets yet. Add a file exported from a Puddle Output node.</p>}
              {datasets.length > 0 && !shown.length && <p className="text-label text-ink-muted">No dataset matches “{query}”.</p>}
            </div>
            <div className="flex min-h-0 flex-col">
              {selected ? (
                <DatasetPanel
                  dataset={selected}
                  onRename={() => setSub({ kind: 'rename', dataset: selected })}
                  onReplace={() => setSub({ kind: 'replace', dataset: selected })}
                  onDelete={() => setSub({ kind: 'delete', dataset: selected })}
                />
              ) : (
                <p className="text-label text-ink-muted">Choose a dataset to see its fields.</p>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {sub?.kind === 'add' && (
        <AddDatasetDialog
          onAdded={(ds) => {
            setSelectedId(ds.id);
            setSub(null);
          }}
          onClose={() => setSub(null)}
        />
      )}
      {sub?.kind === 'rename' && <RenameDialog dataset={sub.dataset} onClose={() => setSub(null)} />}
      {sub?.kind === 'replace' && <ReplaceDatasetDialog dataset={sub.dataset} onClose={() => setSub(null)} />}
      {sub?.kind === 'delete' && (
        <DeleteDialog
          dataset={sub.dataset}
          onClose={() => {
            setSelectedId(null);
            setSub(null);
          }}
        />
      )}
    </>
  );
}
