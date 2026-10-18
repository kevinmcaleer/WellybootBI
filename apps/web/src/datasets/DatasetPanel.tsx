import { useEffect, useRef, useState } from 'react';
import type { Dataset, Provenance } from '@wellyboot/shared';
import { Banner, Button, QualityBar, StatusBadge, TypeTag, columnKind, formatBytes, formatInstant, fullCount } from '../ui';
import { counted } from './words';
import { useEngineStore } from '../app/engine';
import { ACCEPT } from './detect';
import { FIELD_KIND_LABEL, fieldKind } from './fields';
import { chooseAgain, reconnect, useDatasets, type Attach } from './library';
import { profileDataset, type DatasetProfile } from './profile';

const FORMAT_LABEL: Record<Dataset['format'], string> = { parquet: 'Parquet', csv: 'CSV', tsv: 'TSV', json: 'JSON', ndjson: 'NDJSON' };

function ProvenanceCard({ provenance }: { provenance: Provenance }) {
  const rows: [string, string][] = [];
  if (provenance.project) rows.push(['Project', provenance.project]);
  if (provenance.node) rows.push(['Output node', provenance.node]);
  if (provenance.exportedAt) rows.push(['Exported', formatInstant(provenance.exportedAt)]);
  if (provenance.sources?.length) rows.push(['Sources', provenance.sources.map((s) => s.name).join(', ')]);
  if (provenance.rulesPassed?.length) rows.push(['Rules passed', provenance.rulesPassed.join(', ')]);
  return (
    <section aria-label="From Puddle" className="rounded-md border border-line bg-surface-panel px-3 py-2" data-testid="provenance">
      <h3 className="ui-eyebrow pb-1">From Puddle</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-label text-ink-muted">{k}</dt>
            <dd className="text-label">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Choose a missing dataset's file again, with a file input (Firefox and Safari keep no handles). */
function ChooseAgain({ id }: { id: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" variant="primary" icon="source" onClick={() => input.current?.click()}>
        Choose file
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="choose-again-input"
        aria-label="Choose the file again"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void chooseAgain(id, { file });
        }}
      />
    </>
  );
}

function AttachBanner({ dataset, attach }: { dataset: Dataset; attach: Attach | undefined }) {
  if (!attach || attach.state === 'loading') return null;
  if (attach.state === 'prompt')
    return (
      <Banner
        tone="info"
        title="File from last time"
        action={
          <Button size="sm" variant="primary" icon="source" onClick={() => void reconnect(dataset.id)}>
            Reconnect
          </Button>
        }
      >
        {attach.reason}
      </Banner>
    );
  if (attach.state === 'missing' || attach.state === 'failed')
    return (
      <Banner tone={attach.state === 'failed' ? 'fail' : 'warn'} title={attach.state === 'failed' ? 'This file can’t be read' : 'Choose the file again'} action={<ChooseAgain id={dataset.id} />}>
        {attach.reason}
      </Banner>
    );
  if (attach.mismatch)
    return (
      <Banner tone="warn" title="This looks like a different file">
        {dataset.fileName} doesn’t start the way it did when the dataset was added. Charts will use it, but check they still look right.
      </Banner>
    );
  return attach.note ? <p className="text-label text-ink-muted">{attach.note}</p> : null;
}

function FieldRow({ name, type, profile, rows }: { name: string; type: string; profile?: DatasetProfile['fields'][number]; rows: number }) {
  const kind = fieldKind(type);
  return (
    <li className="flex flex-col gap-1 border-b border-line py-2" data-testid="dataset-field">
      <div className="flex items-center gap-2">
        <TypeTag type={columnKind(type)} />
        <span className="ui-col truncate" title={name}>
          {name}
        </span>
        <span className="text-label text-ink-muted">{FIELD_KIND_LABEL[kind]}</span>
        {profile && (
          <span className="ml-auto ui-metric">
            {fullCount(profile.nulls)} empty · {fullCount(profile.distinct)} distinct
          </span>
        )}
      </div>
      {profile && (
        <>
          <QualityBar valid={rows - profile.nulls} empty={profile.nulls} />
          {profile.top?.length ? (
            <p className="text-label text-ink-muted">Most common: {profile.top.map((t) => `${t.value} (${fullCount(t.count)})`).join(', ')}</p>
          ) : profile.min != null ? (
            <p className="text-label text-ink-muted">
              {profile.min} to {profile.max}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

/** One dataset: what it holds, field by field, where it came from, and what can be done with it. */
export function DatasetPanel({ dataset, onRename, onReplace, onDelete }: { dataset: Dataset; onRename: () => void; onReplace: () => void; onDelete: () => void }) {
  const attach = useDatasets((s) => s.attach[dataset.id]);
  const engine = useEngineStore((s) => s.engine);
  // The profile of the dataset as it is now: one replaced or chosen again is profiled afresh.
  const key = `${dataset.id}:${dataset.updatedAt}`;
  const [result, setResult] = useState<{ key: string; profile?: DatasetProfile; error?: string } | null>(null);
  const ready = attach?.state === 'ready';
  useEffect(() => {
    if (!ready || !engine) return;
    // Closing the picker (or choosing another dataset) cancels a profile still running.
    const ac = new AbortController();
    profileDataset(engine, dataset, dataset.schema, ac.signal).then(
      (profile) => setResult({ key, profile }),
      (e: unknown) => {
        if (!ac.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => ac.abort();
  }, [engine, ready, dataset, key]);
  const profile = result?.key === key ? result.profile : undefined;
  const profileError = result?.key === key ? result.error : undefined;
  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="dataset-panel" data-dataset-id={dataset.id}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-heading" data-testid="dataset-name">
            {dataset.name}
          </h3>
          <p className="ui-metric" data-testid="dataset-summary">
            {FORMAT_LABEL[dataset.format]} · {counted(dataset.rowCount, 'row')} · {counted(dataset.schema.length, 'column')} · {formatBytes(dataset.size)}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={onRename}>
            Rename
          </Button>
          <Button size="sm" variant="ghost" icon="refresh" onClick={onReplace}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <AttachBanner dataset={dataset} attach={attach} />
      {dataset.provenance && <ProvenanceCard provenance={dataset.provenance} />}
      <div className="flex items-center gap-2">
        <h3 className="ui-eyebrow">Fields</h3>
        {ready && !profile && !profileError && <StatusBadge status="pending">Profiling</StatusBadge>}
        {profileError && <StatusBadge status="fail" title={profileError}>Profile failed</StatusBadge>}
      </div>
      <ul className="min-h-0 overflow-auto" aria-label="Fields" data-testid="dataset-fields" tabIndex={0}>
        {dataset.schema.map((c, i) => (
          <FieldRow key={c.name} name={c.name} type={c.type} profile={profile?.fields[i]} rows={profile?.rows ?? dataset.rowCount} />
        ))}
      </ul>
    </div>
  );
}
