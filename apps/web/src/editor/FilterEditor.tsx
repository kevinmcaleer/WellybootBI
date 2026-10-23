import { useId, useState, type ReactNode } from 'react';
import { RELATIVE_UNITS, type Filter, type FilterOp, type RelativeDate, type RelativeUnit } from '@wellyboot/shared';
import { fieldKind } from '../compiler/types';
import type { FieldProfile } from '../datasets/profile';
import { Button, Field, Select, TextInput } from '../ui';
import { draftOf, filterOf, newDraft, OP_LABEL, opsFor, type FilterDraft } from './filters';

const PLACEHOLDER: Record<string, string | undefined> = { date: '2026-03-01', datetime: '2026-03-01 14:00', time: '14:00', number: '0' };

const RELATIVE_KINDS = [
  { value: 'last', label: 'The last' },
  { value: 'this', label: 'This' },
  { value: 'toDate', label: 'To date' },
];

/** A hint of what the field holds, from its profile: "From 1 to 10", or its most common values. */
function profileHint(p: FieldProfile | undefined): string | undefined {
  if (!p) return undefined;
  if (p.top?.length) return `Most common: ${p.top.map((t) => t.value).join(', ')}`;
  if (p.min != null && p.max != null) return `From ${p.min} to ${p.max}`;
  return undefined;
}

/**
 * One filter's condition: an operator that suits the field, and its values, suggested from the field's profile.
 * A filter being edited changes the chart as soon as it is complete; a new one is added with Add filter.
 */
export function FilterEditor({
  field,
  type,
  filter,
  profile,
  onChange,
  onRemove,
  onClose,
}: {
  field: string;
  type: string;
  /** The filter being edited; none for a new one. */
  filter?: Filter;
  profile?: FieldProfile;
  /** A complete filter: the new one added, or the edited one changed. */
  onChange: (f: Filter) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<FilterDraft>(() => (filter ? draftOf(filter) : newDraft(type)));
  const kind = fieldKind(type);
  const made = filterOf(draft, field, type);
  const update = (patch: Partial<FilterDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const f = filterOf(next, field, type);
    if (filter && 'filter' in f) onChange(f.filter);
  };
  const placeholder = PLACEHOLDER[kind];
  const suggestions = profile?.top?.map((t) => t.value) ?? [];
  const listId = suggestions.length ? `${id}-values` : undefined;
  const range = draft.range;
  const setRange = (r: Partial<RelativeDate>) => update({ range: { ...range, ...r } as RelativeDate });
  const touched = draft.value !== '' || draft.to !== '' || draft.values !== '';

  let values: ReactNode = null;
  if (draft.op === 'relative')
    values = (
      <div className="grid grid-cols-3 gap-2">
        <Select aria-label="When" value={range.kind} options={RELATIVE_KINDS} onChange={(e) => setRange(e.target.value === 'last' ? { kind: 'last', n: 'n' in range ? range.n : 3 } : ({ kind: e.target.value, unit: range.unit === 'day' ? 'month' : range.unit } as RelativeDate))} />
        {range.kind === 'last' && <TextInput aria-label="How many" inputMode="numeric" value={String(range.n)} onChange={(e) => setRange({ n: Math.max(1, Math.min(10_000, Math.floor(Number(e.target.value) || 1))) })} />}
        <Select
          aria-label="Unit"
          value={range.unit}
          options={RELATIVE_UNITS.filter((u) => range.kind === 'last' || u !== 'day').map((u) => ({ value: u, label: range.kind === 'last' ? `${u}s` : u }))}
          onChange={(e) => setRange({ unit: e.target.value as RelativeUnit } as Partial<RelativeDate>)}
        />
      </div>
    );
  else if (draft.op === 'between')
    values = (
      <div className="grid grid-cols-2 gap-2">
        <TextInput aria-label="From" placeholder={placeholder} value={draft.value} list={listId} onChange={(e) => update({ value: e.target.value })} data-autofocus />
        <TextInput aria-label="To" placeholder={placeholder} value={draft.to} list={listId} onChange={(e) => update({ to: e.target.value })} />
      </div>
    );
  else if (draft.op === 'in') values = <TextInput aria-label="Values" placeholder="North, South" value={draft.values} onChange={(e) => update({ values: e.target.value })} />;
  else if (kind === 'boolean' && draft.op !== 'empty' && draft.op !== 'notEmpty')
    values = <Select aria-label="Value" value={draft.value} options={[{ value: '', label: 'Choose' }, { value: 'true', label: 'True' }, { value: 'false', label: 'False' }]} onChange={(e) => update({ value: e.target.value })} />;
  else if (draft.op !== 'empty' && draft.op !== 'notEmpty') values = <TextInput aria-label="Value" placeholder={placeholder} value={draft.value} list={listId} onChange={(e) => update({ value: e.target.value })} />;

  return (
    <section aria-label={`Filter ${field}`} className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-3" data-testid="filter-editor">
      <h3 className="text-body-strong">{field}</h3>
      <Field label="Keep rows where it">
        <Select aria-label="Condition" value={draft.op} options={opsFor(type).map((op) => ({ value: op, label: OP_LABEL[op] }))} onChange={(e) => update({ op: e.target.value as FilterOp })} />
      </Field>
      {values && (
        <Field hint={'error' in made && touched ? undefined : profileHint(profile)} error={'error' in made && touched ? made.error : undefined}>
          {values}
        </Field>
      )}
      {listId && (
        <datalist id={listId}>
          {suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      <div className="flex justify-end gap-2">
        {filter ? (
          <>
            {onRemove && (
              <Button size="sm" variant="ghost" onClick={onRemove}>
                Remove
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!('filter' in made)} onClick={() => 'filter' in made && onChange(made.filter)}>
              Add filter
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
