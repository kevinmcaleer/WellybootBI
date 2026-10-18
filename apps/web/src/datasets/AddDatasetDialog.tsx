import { useState } from 'react';
import type { Dataset } from '@wellyboot/shared';
import { Dialog, Field, TextInput, formatBytes } from '../ui';
import { FileDrop } from './FileDrop';
import type { PickedFile } from './handles';
import { addDataset } from './library';
import { datasetCap } from './store';

/** Add a dataset from a dropped or chosen file, or from an https address. */
export function AddDatasetDialog({ onAdded, onClose }: { onAdded: (ds: Dataset) => void; onClose: () => void }) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (source: PickedFile | string) => {
    setBusy(true);
    setError(null);
    try {
      onAdded(await addDataset(source));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Add dataset"
      confirm="Add from address"
      confirmDisabled={busy || !address.trim()}
      onConfirm={() => void add(address)}
      onClose={onClose}
      className="w-[480px] max-w-[calc(100vw-32px)]"
    >
      <FileDrop onFile={(p) => void add(p)} disabled={busy} />
      <Field label="Or paste an https address" htmlFor="dataset-address" hint="The server must allow other sites to read the file.">
        <TextInput id="dataset-address" type="url" placeholder="https://" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
      </Field>
      <p className="text-label text-ink-muted">
        Files up to {formatBytes(datasetCap())} are kept in this browser, so dashboards reopen without choosing them again. Nothing is uploaded.
      </p>
      {busy && (
        <p className="text-label text-ink-muted" role="status">
          Reading the file…
        </p>
      )}
      {error && (
        <p className="text-label text-fail" role="alert" data-testid="add-dataset-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
