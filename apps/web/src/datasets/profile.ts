import type { ColumnSchema, Dataset } from '@wellyboot/shared';
import { datasetRelationName } from '../compiler/datasets';
import { profileSql } from '../compiler/profile';
import { tableRows, type EngineClient } from '../engine';
import { fieldKind, isOrderable } from './fields';

/** One field's profile, as the dataset panel shows it. */
export interface FieldProfile {
  name: string;
  type: string;
  nulls: number;
  distinct: number;
  /** As text, the way DuckDB writes the value; absent for an empty field or a type with no order. */
  min?: string;
  max?: string;
  /** The most common values of a text field, most common first. */
  top?: { value: string; count: number }[];
}

export interface DatasetProfile {
  rows: number;
  fields: FieldProfile[];
}

const listOf = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : Array.from(v as Iterable<unknown>));
const text = (v: unknown) => (v == null ? undefined : String(v));

/**
 * Profile a registered dataset with one query, at preview priority. Pass the dialog's signal so closing it cancels
 * the query; `supersede` keeps one profile running at a time.
 */
export async function profileDataset(engine: EngineClient, ds: Pick<Dataset, 'id'>, schema: ColumnSchema[], signal?: AbortSignal): Promise<DatasetProfile> {
  const fields = schema.map((c) => ({ ...c, orderable: isOrderable(c.type), top: fieldKind(c.type) === 'text' && isOrderable(c.type) }));
  const result = await engine.query(profileSql(datasetRelationName(ds), fields), { priority: 'preview', signal, supersede: 'profile', label: 'Profiling fields' });
  const row = tableRows(result.table)[0] ?? {};
  const rows = Number(row.rows ?? 0);
  return {
    rows,
    fields: fields.map((f, i) => {
      const p: FieldProfile = { name: f.name, type: f.type, nulls: rows - Number(row[`f${i}_nonnull`] ?? 0), distinct: Number(row[`f${i}_distinct`] ?? 0) };
      const min = text(row[`f${i}_min`]);
      const max = text(row[`f${i}_max`]);
      if (min != null) p.min = min;
      if (max != null) p.max = max;
      if (f.top) {
        const counts = listOf(row[`f${i}_top_counts`]);
        p.top = listOf(row[`f${i}_top_values`]).map((value, k) => ({ value: String(value), count: Number(counts[k] ?? 0) }));
      }
      return p;
    }),
  };
}
