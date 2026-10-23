import { useRef, useState, type DragEvent } from 'react';
import { Button, cx } from '../ui';
import { ACCEPT } from './detect';
import { droppedFiles, pickFiles, type PickedFile } from './handles';

/**
 * Where a file is dropped or chosen. Chromium's file picker keeps a handle for reconnecting later; other browsers
 * use a file input. The input is always there, so tests (and keyboard users of other browsers) can use it.
 */
export function FileDrop({ onFile, disabled, label = 'Drop a file exported from Puddle here' }: { onFile: (picked: PickedFile) => void; disabled?: boolean; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const choose = async () => {
    const picked = await pickFiles();
    if (picked === null) input.current?.click();
    else if (picked[0]) onFile(picked[0]);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    // Handles must be asked for during the drop event itself.
    void droppedFiles(e.dataTransfer).then((files) => files[0] && onFile(files[0]));
  };
  return (
    <div
      data-testid="dataset-drop"
      className={cx(
        'flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center',
        over ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface-sunken',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <p className="text-body">{label}</p>
      <p className="text-label text-ink-muted">Parquet, CSV, TSV, JSON or NDJSON</p>
      <Button icon="source" onClick={() => void choose()} disabled={disabled}>
        Choose file
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="dataset-file-input"
        aria-label="Choose a data file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile({ file });
        }}
      />
    </div>
  );
}
