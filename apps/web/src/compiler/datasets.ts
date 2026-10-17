import type { Dataset, DatasetFormat } from '@wellyboot/shared';
import { ident, str } from './sql';

// The only place a dataset's read SQL is built. A dataset is registered with DuckDB under a stable name derived
// from its id, never from its (author-chosen) name, so dashboards keep working when it is renamed or replaced.

type DatasetRef = Pick<Dataset, 'id' | 'format'>;

const EXT: Record<DatasetFormat, string> = { parquet: 'parquet', csv: 'csv', tsv: 'tsv', json: 'json', ndjson: 'ndjson' };

/** The name a dataset's file is registered under in DuckDB's virtual file system. */
export const datasetFileName = (ds: DatasetRef) => `ds_${ds.id}.${EXT[ds.format]}`;

/** The view (Parquet) or table (everything else) charts query: `ds_<id>`. */
export const datasetRelationName = (ds: Pick<Dataset, 'id'>) => `ds_${ds.id}`;

/**
 * Parquet is range-readable, so it stays a view over the file and a large file is never copied into WebAssembly
 * memory. CSV and JSON aren't, so they are read into a table once per session rather than parsed on every query.
 */
export const datasetRelationKind = (ds: Pick<Dataset, 'format'>): 'view' | 'table' => (ds.format === 'parquet' ? 'view' : 'table');

/** The table function call that reads a dataset's file, with the options Puddle reads the same formats with. */
export function readDataset(ds: DatasetRef): string {
  const file = str(datasetFileName(ds));
  switch (ds.format) {
    case 'parquet':
      return `read_parquet(${file})`;
    case 'csv':
      // As in Puddle: short rows are padded with empty values instead of making the sniffer give up.
      return `read_csv(${file}, null_padding = true)`;
    case 'tsv':
      return `read_csv(${file}, delim = '\t', null_padding = true)`;
    case 'json':
      return `read_json_auto(${file})`;
    case 'ndjson':
      return `read_json_auto(${file}, format = 'newline_delimited')`;
  }
}

/** What already goes by a dataset's name, so it can be dropped before the dataset is registered again. */
export const existingRelation = (ds: Pick<Dataset, 'id'>) =>
  `SELECT table_type FROM information_schema.tables WHERE table_schema = 'main' AND table_name = ${str(datasetRelationName(ds))}`;

/** Drop what goes by a dataset's name: `type` is information_schema's table_type ('VIEW' or 'BASE TABLE'). */
export const dropRelation = (ds: Pick<Dataset, 'id'>, type: string) =>
  `DROP ${type === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS ${ident(datasetRelationName(ds))}`;

/** Create the dataset's view or table. */
export const createRelation = (ds: DatasetRef) =>
  `CREATE OR REPLACE ${datasetRelationKind(ds) === 'view' ? 'VIEW' : 'TABLE'} ${ident(datasetRelationName(ds))} AS SELECT * FROM ${readDataset(ds)}`;

/** Every row of a registered dataset, for DESCRIBE. */
export const selectDataset = (ds: Pick<Dataset, 'id'>) => `SELECT * FROM ${ident(datasetRelationName(ds))}`;

export const countDataset = (ds: Pick<Dataset, 'id'>) => `SELECT count(*)::BIGINT AS n FROM ${ident(datasetRelationName(ds))}`;
