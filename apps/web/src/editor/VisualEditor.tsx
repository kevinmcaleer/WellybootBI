import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_TYPES, type ChartType, type Dataset, type Filter, type Query, type Visual } from '@wellyboot/shared';
import type { TopLevelSpec } from 'vega-lite';
import { useEngineStore } from '../app/engine';
import { useResolvedTheme } from '../app/theme';
import { chartDefinition, chartProblem, compileChart } from '../compiler/chart';
import { profileDataset, type DatasetProfile } from '../datasets/profile';
import { useVisualStore } from '../model/visualStore';
import { fullCount } from '../ui/format';
import { Banner, Button, Field, Section, Select, Tabs, useDisplayFormat } from '../ui';
import { Chart } from '../visuals/Chart';
import { addToWell, retarget, type FieldRef } from '../visuals/encode';
import { LiveQuery, liveKey, useLiveRun } from '../visuals/live';
import { setChartView } from '../visuals/view';
import { DataView } from './DataView';
import { FieldList, type Target } from './FieldList';
import { FilterEditor } from './FilterEditor';
import { FormatSection } from './FormatSection';
import { SortControls } from './SortControls';
import { Wells } from './Wells';

/** Which filter is open: a new one for a field, or one of the query's. */
type FilterEditing = { field: string } | { index: number } | null;

function useProfile(dataset: Dataset): DatasetProfile | undefined {
  const engine = useEngineStore((s) => s.engine);
  const [profile, setProfile] = useState<{ id: string; profile: DatasetProfile }>();
  const key = `${dataset.id}:${dataset.updatedAt}`;
  useEffect(() => {
    if (!engine) return;
    const ac = new AbortController();
    profileDataset(engine, dataset, dataset.schema, ac.signal).then(
      (p) => setProfile({ id: key, profile: p }),
      () => undefined,
    );
    return () => ac.abort();
  }, [engine, dataset, key]);
  return profile?.id === key ? profile.profile : undefined;
}

/** The chart's rows, asked for again after each edit; and a spec drawn only from rows that answer this query. */
function useLiveChart(visual: Visual, dataset: Dataset) {
  const engine = useEngineStore((s) => s.engine);
  const live = useLiveRun();
  const mode = useResolvedTheme();
  const display = useDisplayFormat();
  const query = useRef<LiveQuery | null>(null);
  useEffect(() => {
    if (!engine) return;
    const lq = new LiveQuery(engine, (patch) => useLiveRun.setState(patch));
    query.current = lq;
    return () => {
      lq.dispose();
      query.current = null;
      useLiveRun.setState({ running: false, run: undefined, key: undefined, error: undefined });
    };
  }, [engine]);
  useEffect(() => {
    query.current?.request(visual, dataset);
  }, [visual, dataset, engine]);

  const key = liveKey(visual, dataset);
  const current = live.key === key ? live.run : undefined;
  const spec = useMemo(() => {
    if (!current || chartProblem(visual)) return undefined;
    try {
      return compileChart(visual, current, { mode, display });
    } catch {
      return undefined;
    }
  }, [visual, current, mode, display]);
  // While the next rows come, the last chart stays.
  const [last, setLast] = useState<TopLevelSpec>();
  if (spec && spec !== last) setLast(spec);
  return { live, current, spec: spec ?? (live.running ? last : undefined) };
}

/** The chart type switcher: switching keeps what fits and says what didn't. */
function ChartTypeField({ visual }: { visual: Visual }) {
  const schema = useVisualStore((s) => s.schema);
  return (
    <Field label="Chart" htmlFor="chart-type">
      <Select
        id="chart-type"
        value={visual.chart.type}
        options={CHART_TYPES.map((t) => ({ value: t, label: chartDefinition(t).label }))}
        onChange={(e) => {
          const { visual: next, dropped } = retarget(visual, e.target.value as ChartType, schema);
          const store = useVisualStore.getState();
          store.edit(() => next);
          if (dropped.length) store.setNote({ tone: 'info', text: `${dropped.join('. ')}.` });
        }}
      />
    </Field>
  );
}

/**
 * The chart editor: the dataset's fields on the left, the chart in the middle, and its wells and formatting in the
 * inspector. Every change goes through the visual store, so it can be undone, and runs the query again.
 */
export function VisualEditor({ visual, dataset, onChangeDataset }: { visual: Visual; dataset: Dataset; onChangeDataset: () => void }) {
  const schema = dataset.schema;
  const note = useVisualStore((s) => s.note);
  const canUndo = useVisualStore((s) => !!s.history?.past.length);
  const canRedo = useVisualStore((s) => !!s.history?.future.length);
  const [tab, setTab] = useState<'chart' | 'data'>('chart');
  const [pane, setPane] = useState<'fields' | 'format'>('fields');
  const [filtering, setFiltering] = useState<FilterEditing>(null);
  const profile = useProfile(dataset);
  const display = useDisplayFormat();
  const { live, current, spec } = useLiveChart(visual, dataset);

  const store = useVisualStore.getState;
  const commit = store().apply;
  const editQuery = (query: Query, opts?: { coalesce?: string }) => store().edit((v) => ({ ...v, query }), opts);
  const def = chartDefinition(visual.chart.type);
  const targets: Target[] = [...def.wells.map((w) => ({ id: w.id, label: w.label })), { id: 'filters', label: 'Filters' }];
  const add = (target: string, field: FieldRef) => {
    if (target === 'filters') return field != null && setFiltering({ field });
    store().apply(addToWell(store().history!.present, schema, target as Parameters<typeof addToWell>[2], field));
  };

  const filterField = filtering && ('field' in filtering ? filtering.field : visual.query.filters[filtering.index]?.field);
  const editedFilter = filtering && 'index' in filtering ? visual.query.filters[filtering.index] : undefined;
  const setFilter = (f: Filter) => {
    if (filtering && 'index' in filtering) {
      const i = filtering.index;
      store().edit((v) => ({ ...v, query: { ...v.query, filters: v.query.filters.map((x, k) => (k === i ? f : x)) } }), { coalesce: `filter-${i}` });
    } else {
      store().edit((v) => ({ ...v, query: { ...v.query, filters: [...v.query.filters, f] } }));
      setFiltering(null);
    }
  };
  const removeFilter = (i: number) => {
    store().edit((v) => ({ ...v, query: { ...v.query, filters: v.query.filters.filter((_, k) => k !== i) } }));
    setFiltering(null);
  };

  const problem = chartProblem(visual);
  const notice = current?.truncated ? `This chart shows the first ${fullCount(current.rowLimit, display)} rows of its data. Add a filter or show only the top rows to see all of it.` : undefined;
  const filterEditor =
    filtering && filterField ? (
      <FilterEditor
        key={JSON.stringify(filtering)}
        field={filterField}
        type={schema.find((c) => c.name === filterField)?.type ?? 'VARCHAR'}
        filter={editedFilter}
        profile={profile?.fields.find((p) => p.name === filterField)}
        onChange={setFilter}
        onRemove={filtering && 'index' in filtering ? () => removeFilter(filtering.index) : undefined}
        onClose={() => setFiltering(null)}
      />
    ) : null;

  return (
    <div className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)_320px]" data-testid="editor" data-visual-type={visual.chart.type}>
      <FieldList name={dataset.name} schema={schema} targets={targets} onAdd={add} onChangeDataset={onChangeDataset} />
      <main aria-label="Canvas" className="flex min-h-0 flex-col gap-3 bg-surface-canvas p-4" data-testid="canvas">
        <div className="flex items-center gap-2">
          <Tabs
            label="Show"
            items={[
              { id: 'chart', label: 'Chart' },
              { id: 'data', label: 'Data', ...(current && { count: current.rows.length }) },
            ]}
            value={tab}
            onChange={(id) => setTab(id as 'chart' | 'data')}
          />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" icon="undo" iconOnly aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => store().undo()} />
            <Button variant="ghost" icon="redo" iconOnly aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => store().redo()} />
          </div>
        </div>
        {note && (
          <div data-testid="edit-note">
            <Banner
              tone={note.tone}
              action={
                <Button size="sm" variant="ghost" onClick={() => store().setNote(null)}>
                  Dismiss
                </Button>
              }
            >
              {note.text}
            </Banner>
          </div>
        )}
        <div className="min-h-0 flex-1 rounded-md border border-line bg-surface-raised p-2">
          {tab === 'chart' ? (
            <Chart
              spec={spec}
              loading={live.running}
              error={live.error}
              empty={problem ?? (current && !current.rows.length ? 'No rows match. Change or remove a filter to see some.' : undefined)}
              notice={notice}
              locale={display.locale}
              onView={setChartView}
            />
          ) : current ? (
            <DataView run={current} />
          ) : (
            <p className="p-4 text-ink-muted">{live.error ?? 'Add fields to the wells to see their data here.'}</p>
          )}
        </div>
      </main>
      <aside aria-label="Inspector" className="flex min-h-0 flex-col overflow-auto border-l border-line bg-surface-panel" data-testid="inspector">
        <Section title="Chart">
          <ChartTypeField visual={visual} />
          <Tabs
            label="Inspector"
            items={[
              { id: 'fields', label: 'Fields' },
              { id: 'format', label: 'Format' },
            ]}
            value={pane}
            onChange={(id) => setPane(id as 'fields' | 'format')}
          />
        </Section>
        {pane === 'fields' ? (
          <>
            <Section title="Wells">
              <Wells visual={visual} schema={schema} commit={commit} onNewFilter={(field) => setFiltering({ field })} onEditFilter={(index) => setFiltering({ index })} filterEditor={filterEditor} />
            </Section>
            <Section title="Sort and top">
              <SortControls visual={visual} onChange={editQuery} />
            </Section>
          </>
        ) : (
          <Section title="Format">
            <FormatSection visual={visual} onEdit={(change, opts) => store().edit(change, opts)} />
          </Section>
        )}
      </aside>
    </div>
  );
}
