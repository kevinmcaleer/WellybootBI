import { useMemo, useState } from 'react';
import type { ColumnSchema } from '@wellyboot/shared';
import { fieldKind, type FieldKind } from '../compiler/types';
import { Button, Menu, TextInput, TypeTag, columnKind, type MenuItem } from '../ui';
import { ROWS_LABEL, type FieldRef } from '../visuals/encode';
import { startDrag } from './drag';

/** A place a field can be added to: a well, or the filters. */
export interface Target {
  id: string;
  label: string;
}

const GROUPS: { label: string; kinds: FieldKind[] }[] = [
  { label: 'Numbers', kinds: ['number'] },
  { label: 'Text', kinds: ['text'] },
  { label: 'Dates and times', kinds: ['date', 'datetime', 'time'] },
  { label: 'True or false', kinds: ['boolean'] },
];

function FieldButton({ field, type, targets, onAdd }: { field: FieldRef; type?: string; targets: Target[]; onAdd: (target: string, field: FieldRef) => void }) {
  const name = field ?? ROWS_LABEL;
  const items: MenuItem[] = targets.map((t) => ({ label: `Add to ${t.label}`, onSelect: () => onAdd(t.id, field) }));
  return (
    <li data-testid="field" data-field={field ?? ''}>
      <Menu
        align="start"
        className="flex"
        label={name}
        items={items}
        renderTrigger={(t) => (
          // A div with the button role, not a <button>: Firefox never starts a drag from a button.
          <div
            role="button"
            tabIndex={0}
            className="ui-chip w-full justify-start font-mono"
            draggable
            onDragStart={startDrag({ field })}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              t.onClick();
            }}
            title={type ?? 'Count the rows'}
            {...t}
          >
            <TypeTag type={type ? columnKind(type) : 'integer'} decorative />
            {/* Named "Add Region" from its text, so the name holds the words that are seen. */}
            <span className="sr-only">Add</span> <span className="truncate">{name}</span>
          </div>
        )}
      />
    </li>
  );
}

/**
 * The dataset's fields, grouped by kind, with a search. Drag one into a well, or open its menu to add it from the
 * keyboard. The number of rows comes first, to count rows with.
 */
export function FieldList({ name, schema, targets, onAdd, onChangeDataset }: { name: string; schema: ColumnSchema[]; targets: Target[]; onAdd: (target: string, field: FieldRef) => void; onChangeDataset: () => void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? schema.filter((c) => c.name.toLowerCase().includes(q)) : schema;
    return GROUPS.map((g) => ({ ...g, fields: shown.filter((c) => g.kinds.includes(fieldKind(c.type))) })).filter((g) => g.fields.length);
  }, [schema, query]);
  const rowsShown = !query.trim() || ROWS_LABEL.toLowerCase().includes(query.trim().toLowerCase());
  return (
    <aside aria-label="Fields" className="flex min-h-0 flex-col gap-2 border-r border-line bg-surface-panel p-3" data-testid="field-list">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="ui-eyebrow">Dataset</h2>
          <span className="truncate text-body-strong" data-testid="visual-dataset">
            {name}
          </span>
        </div>
        <Button size="sm" variant="ghost" icon="source" className="ml-auto" onClick={onChangeDataset}>
          Change
        </Button>
      </div>
      <TextInput type="search" placeholder="Search fields" aria-label="Search fields" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex min-h-0 flex-col gap-3 overflow-auto">
        {rowsShown && (
          <ul className="flex flex-col gap-1" aria-label="Rows">
            <FieldButton field={null} targets={targets.filter((t) => t.id === 'values' || t.id === 'tooltips')} onAdd={onAdd} />
          </ul>
        )}
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-1">
            <h3 className="ui-eyebrow">{g.label}</h3>
            <ul className="flex flex-col gap-1">
              {g.fields.map((c) => (
                <FieldButton key={c.name} field={c.name} type={c.type} targets={targets} onAdd={onAdd} />
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && !rowsShown && <p className="text-label text-ink-muted">No field matches “{query}”.</p>}
      </div>
    </aside>
  );
}
