import type { Query, Sort, Visual } from '@wellyboot/shared';
import { describeQuery } from '../compiler/query';
import { Field, Select, Switch } from '../ui';
import { WholeNumberInput } from './WholeNumberInput';

const DEFAULT = '';
const keyOf = (s: Pick<Sort, 'by' | 'index'>) => `${s.by}:${s.index}`;

/**
 * Sort by any of the query's groups or summaries, and keep only the top N rows, with the rest as one Others row.
 * Without a sort, rows come in the order of their groups.
 */
export function SortControls({ visual, onChange }: { visual: Visual; onChange: (query: Query, opts?: { coalesce?: string }) => void }) {
  const { query } = visual;
  const columns = describeQuery(query, []).filter((c) => c.role !== 'others');
  const sort = query.sort[0];
  const options = [{ value: DEFAULT, label: 'Default' }, ...columns.map((c) => ({ value: keyOf({ by: c.role as Sort['by'], index: c.index }), label: c.name }))];
  const setSort = (key: string, dir: Sort['dir'] = sort?.dir ?? 'desc') => {
    if (key === DEFAULT) return onChange({ ...query, sort: [] });
    const [by, index] = key.split(':') as [Sort['by'], string];
    onChange({ ...query, sort: [{ by, index: Number(index), dir }] });
  };
  const limit = query.limit;
  const setLimit = (next: Query['limit']) => {
    const { limit: _, ...rest } = query;
    onChange(next ? { ...rest, limit: next } : rest, { coalesce: 'limit' });
  };
  return (
    <div className="flex flex-col gap-3" data-testid="sort-controls">
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        <Field label="Sort by" htmlFor="sort-by">
          <Select id="sort-by" value={sort ? keyOf(sort) : DEFAULT} options={options} onChange={(e) => setSort(e.target.value)} />
        </Field>
        <Field label="Order" htmlFor="sort-dir">
          <Select
            id="sort-dir"
            disabled={!sort}
            value={sort?.dir ?? 'asc'}
            options={[
              { value: 'asc', label: 'Ascending' },
              { value: 'desc', label: 'Descending' },
            ]}
            onChange={(e) => sort && setSort(keyOf(sort), e.target.value as Sort['dir'])}
          />
        </Field>
      </div>
      <Switch label="Show only the top rows" checked={!!limit} onChange={(on) => setLimit(on ? { n: 10, others: false } : undefined)} />
      {limit && (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-end gap-2">
          <Field label="How many" htmlFor="top-n">
            <WholeNumberInput id="top-n" value={limit.n} min={1} max={1_000_000} onChange={(n) => setLimit({ ...limit, n })} />
          </Field>
          <Switch label="Sum the rest as Others" checked={limit.others} onChange={(others) => setLimit({ ...limit, others })} />
        </div>
      )}
    </div>
  );
}
