import { useEffect, useRef, useState } from 'react';
import type { Dataset } from '@wellyboot/shared';
import { Dialog, Field, TextInput, TypeTag, columnKind } from '../ui';
import { counted } from './words';
import { isSameSchema, type SchemaDiff } from './diff';
import { FileDrop } from './FileDrop';
import type { PickedFile } from './handles';
import { discard, prepareReplacement, replaceWith, type Staged } from './library';

export function DiffList({ diff }: { diff: SchemaDiff }) {
  if (isSameSchema(diff)) return <p className="text-body">The columns are the same.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="schema-diff">
      {diff.added.length > 0 && (
        <section aria-label="Added columns">
          <h3 className="ui-eyebrow pb-1">Added</h3>
          <ul className="ui-schema">
            {diff.added.map((c) => (
              <li key={c.name}>
                <TypeTag type={columnKind(c.type)} />
                <span className="ui-col">{c.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.removed.length > 0 && (
        <section aria-label="Removed columns">
          <h3 className="ui-eyebrow pb-1">Removed</h3>
          <ul className="ui-schema">
            {diff.removed.map((c) => (
              <li key={c.name} className="is-missing">
                <TypeTag type={columnKind(c.type)} />
                <span className="ui-col">{c.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {diff.retyped.length > 0 && (
        <section aria-label="Retyped columns">
          <h3 className="ui-eyebrow pb-1">Type changed</h3>
          <ul className="ui-schema">
            {diff.retyped.map((c) => (
              <li key={c.name}>
                <span className="ui-col">{c.name}</span>
                <span className="ui-metric">
                  {c.from} to {c.to}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Replace a dataset with a newer export: read it, show what changes, then replace. The id stays the same. */
export function ReplaceDatasetDialog({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  const [prepared, setPrepared] = useState<{ staged: Staged; diff: SchemaDiff } | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kept = useRef<Staged | null>(null);
  // A prepared export that isn't used is dropped from DuckDB when the dialog closes.
  useEffect(() => () => void (kept.current && discard(kept.current)), []);
  const prepare = async (source: PickedFile | string) => {
    setBusy(true);
    setError(null);
    try {
      if (kept.current) await discard(kept.current);
      const next = await prepareReplacement(dataset.id, source);
      kept.current = next.staged;
      setPrepared(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const replace = async () => {
    if (!prepared) return void prepare(address);
    setBusy(true);
    try {
      await replaceWith(dataset.id, prepared.staged);
      kept.current = null;
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Replace ${dataset.name}`}
      confirm={prepared ? 'Replace' : 'Read from address'}
      confirmDisabled={busy || (!prepared && !address.trim())}
      onConfirm={() => void replace()}
      onClose={onClose}
      className="w-[480px] max-w-[calc(100vw-32px)]"
    >
      {prepared ? (
        <>
          <p className="text-body">
            {prepared.staged.record.fileName}: {counted(prepared.staged.record.rowCount, 'row')}. Dashboards using {dataset.name} will use the new file.
          </p>
          <DiffList diff={prepared.diff} />
        </>
      ) : (
        <>
          <p className="text-label text-ink-muted">Choose a newer export of {dataset.fileName}. You’ll see what changes before anything is replaced.</p>
          <FileDrop onFile={(p) => void prepare(p)} disabled={busy} label="Drop the newer export here" />
          <Field label="Or paste an https address" htmlFor="replace-address">
            <TextInput id="replace-address" type="url" placeholder="https://" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
          </Field>
        </>
      )}
      {busy && (
        <p className="text-label text-ink-muted" role="status">
          Reading the file…
        </p>
      )}
      {error && (
        <p className="text-label text-fail" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
