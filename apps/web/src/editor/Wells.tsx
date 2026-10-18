import { useState, type DragEvent, type ReactNode } from 'react';
import { AGGREGATES, type Aggregate, type ColumnSchema, type DateBucket, type Visual } from '@wellyboot/shared';
import type { WellDefinition, WellId } from '../compiler/chart';
import { AGGREGATE_INFO, fieldKind } from '../compiler/types';
import { FieldChip, Menu, PivotZone, columnKind, type MenuItem } from '../ui';
import { addToWell, moveInWells, removeFromWell, setAggregate, setBucket, wellEntries, wellsOf, type EditResult, type FieldRef } from '../visuals/encode';
import { carriesField, dropped, startDrag } from './drag';
import { filterWords } from './filters';

const BUCKET_LABEL: Record<DateBucket, string> = { year: 'By year', quarter: 'By quarter', month: 'By month', week: 'By week', day: 'By day', hour: 'By hour' };
const EACH_VALUE = 'Each value';

const typeOf = (schema: ColumnSchema[], field?: string) => (field == null ? undefined : schema.find((c) => c.name === field)?.type);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Drop handling for a zone: the highlight while a field is over it, and what a drop at a place does. */
function useDropZone(onDrop: (field: FieldRef, from: { well: WellId | 'filters'; position: number } | undefined, at?: number) => void) {
  const [over, setOver] = useState(false);
  const accept = (e: DragEvent) => {
    if (!carriesField(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOver(true);
  };
  const leave = (e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
  };
  const drop = (at?: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const what = dropped(e);
    if (what) onDrop(what.field, what.from, at);
  };
  return { over, accept, leave, drop };
}

/** The summary menu on a value: the aggregates its field can take. */
function AggregateMenu({ visual, schema, index, commit }: { visual: Visual; schema: ColumnSchema[]; index: number; commit: (r: EditResult) => void }) {
  const m = visual.query.measures[index]!;
  const label = AGGREGATE_INFO[m.aggregate].label;
  if (m.field == null) return <span className="ui-fchip__agg">{label}</span>;
  const type = typeOf(schema, m.field) ?? '';
  const items: MenuItem[] = AGGREGATES.filter((a: Aggregate) => AGGREGATE_INFO[a].fits(type)).map((a) => ({
    label: AGGREGATE_INFO[a].label,
    checked: a === m.aggregate,
    onSelect: () => commit(setAggregate(visual, schema, index, a)),
  }));
  return (
    <Menu
      align="end"
      label={`Summarise ${m.field}`}
      items={items}
      renderTrigger={(t) => (
        <button type="button" className="ui-fchip__agg" aria-label={`Summarise ${m.field}: ${label}`} {...t}>
          {label}
        </button>
      )}
    />
  );
}

/** The bucket menu on a date: by year, quarter, month, week, day, (hour for a time), or each value. */
function BucketMenu({ visual, schema, index, commit }: { visual: Visual; schema: ColumnSchema[]; index: number; commit: (r: EditResult) => void }) {
  const g = visual.query.groups[index]!;
  const kind = fieldKind(typeOf(schema, g.field) ?? '');
  if (kind !== 'date' && kind !== 'datetime') return null;
  const unit = g.bucket?.kind === 'date' ? g.bucket.unit : undefined;
  const label = unit ? BUCKET_LABEL[unit] : EACH_VALUE;
  const units = (Object.keys(BUCKET_LABEL) as DateBucket[]).filter((u) => u !== 'hour' || kind === 'datetime');
  const items: MenuItem[] = [
    ...units.map((u) => ({ label: BUCKET_LABEL[u], checked: u === unit, onSelect: () => commit({ visual: setBucket(visual, index, { kind: 'date', unit: u }) }) })),
    { label: EACH_VALUE, checked: !unit, onSelect: () => commit({ visual: setBucket(visual, index, undefined) }) },
  ];
  return (
    <Menu
      align="end"
      label={`Group ${g.field}`}
      items={items}
      renderTrigger={(t) => (
        <button type="button" className="ui-fchip__agg" aria-label={`Group ${g.field}: ${lower(label)}`} {...t}>
          {label}
        </button>
      )}
    />
  );
}

/** One well and its fields, each draggable, with a menu on its name for moving it by keyboard. */
function WellBox({ well, wells, visual, schema, commit }: { well: WellDefinition; wells: WellDefinition[]; visual: Visual; schema: ColumnSchema[]; commit: (r: EditResult) => void }) {
  const entries = wellEntries(visual, well.id);
  const zone = useDropZone((field, from, at) => {
    if (from && from.well !== 'filters') commit(moveInWells(visual, schema, from.well, from.position, well.id, at));
    else commit(addToWell(visual, schema, well.id, field, at));
  });

  const moves = (position: number): MenuItem[] => [
    ...(position > 0 ? [{ label: 'Move up', onSelect: () => commit(moveInWells(visual, schema, well.id, position, well.id, position - 1)) }] : []),
    ...(position < entries.length - 1 ? [{ label: 'Move down', onSelect: () => commit(moveInWells(visual, schema, well.id, position, well.id, position + 1)) }] : []),
    ...wells.filter((w) => w.id !== well.id).map((w) => ({ label: `Move to ${w.label}`, onSelect: () => commit(moveInWells(visual, schema, well.id, position, w.id)) })),
    { label: 'Remove', onSelect: () => commit({ visual: removeFromWell(visual, well.id, position) }) },
  ];

  return (
    <div role="group" aria-label={well.label} data-well={well.id} data-testid={`well-${well.id}`} onDragOver={zone.accept} onDragLeave={zone.leave} onDrop={zone.drop()}>
      <PivotZone label={well.label} over={zone.over} empty={well.empty}>
        {entries.map((e, position) => {
          const type = typeOf(schema, e.field);
          let tag: ReactNode;
          if (well.holds === 'measure') tag = <AggregateMenu visual={visual} schema={schema} index={e.index} commit={commit} />;
          else tag = <BucketMenu visual={visual} schema={schema} index={e.index} commit={commit} />;
          return (
            <FieldChip
              key={`${e.index}-${e.name}`}
              name={e.name}
              type={type ? columnKind(type) : 'integer'}
              data-testid="well-chip"
              onDragStart={startDrag({ field: e.field ?? null, from: { well: well.id, position } })}
              onDragOver={zone.accept}
              onDrop={zone.drop(position)}
              label={
                <Menu
                  align="start"
                  className="flex min-w-0 flex-auto"
                  label={e.name}
                  items={moves(position)}
                  renderTrigger={(t) => (
                    <button type="button" className="ui-fchip__name" title={e.name} aria-label={`${well.label}: ${e.name}`} {...t}>
                      {e.name}
                    </button>
                  )}
                />
              }
              agg={tag ?? undefined}
              onRemove={() => commit({ visual: removeFromWell(visual, well.id, position) })}
            />
          );
        })}
      </PivotZone>
    </div>
  );
}

/** The filters well: a chip per filter, opened to edit it; a field dropped here starts a new filter. */
function FiltersBox({ visual, schema, commit, onNew, onEdit }: { visual: Visual; schema: ColumnSchema[]; commit: (r: EditResult) => void; onNew: (field: string) => void; onEdit: (index: number) => void }) {
  const zone = useDropZone((field) => field != null && onNew(field));
  const remove = (i: number) => commit({ visual: { ...visual, query: { ...visual.query, filters: visual.query.filters.filter((_, k) => k !== i) } } });
  return (
    <div role="group" aria-label="Filters" data-well="filters" data-testid="well-filters" onDragOver={zone.accept} onDragLeave={zone.leave} onDrop={zone.drop()}>
      <PivotZone label="Filters" over={zone.over} empty="Drag a field here to keep only some rows">
        {visual.query.filters.map((f, i) => (
          <FieldChip
            key={`${i}-${f.field}`}
            name={f.field}
            type={columnKind(typeOf(schema, f.field) ?? '')}
            data-testid="filter-chip"
            onDragStart={startDrag({ field: f.field, from: { well: 'filters', position: i } })}
            label={
              <button type="button" className="ui-fchip__name" title={`${f.field} ${filterWords(f)}`} aria-label={`Edit filter: ${f.field} ${filterWords(f)}`} onClick={() => onEdit(i)}>
                {f.field}
              </button>
            }
            agg={filterWords(f)}
            onRemove={() => remove(i)}
          />
        ))}
      </PivotZone>
    </div>
  );
}

/** The chart type's wells and the filters well. */
export function Wells({ visual, schema, commit, onNewFilter, onEditFilter, filterEditor }: { visual: Visual; schema: ColumnSchema[]; commit: (r: EditResult) => void; onNewFilter: (field: string) => void; onEditFilter: (index: number) => void; filterEditor?: ReactNode }) {
  const wells = wellsOf(visual.chart.type);
  return (
    <div className="flex flex-col gap-2" data-testid="wells">
      {wells.map((w) => (
        <WellBox key={w.id} well={w} wells={wells} visual={visual} schema={schema} commit={commit} />
      ))}
      <FiltersBox visual={visual} schema={schema} commit={commit} onNew={onNewFilter} onEdit={onEditFilter} />
      {filterEditor}
    </div>
  );
}
