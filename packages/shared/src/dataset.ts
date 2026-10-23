import { z } from 'zod';

// A dataset is a file exported from Puddle and kept in the browser: its record lives in the dataset catalogue
// (IndexedDB) and later travels with published dashboards, so the browser and the server read the same shape.

export const DATASET_FORMATS = ['parquet', 'csv', 'tsv', 'json', 'ndjson'] as const;
export const DatasetFormatZ = z.enum(DATASET_FORMATS);
export type DatasetFormat = z.infer<typeof DatasetFormatZ>;

/** One column as DuckDB describes it, the same shape as Puddle's `ColumnSchema`. */
export const ColumnSchemaZ = z.object({
  name: z.string(),
  type: z.string().min(1),
});
export type ColumnSchema = z.infer<typeof ColumnSchemaZ>;

/**
 * The Parquet key-value metadata keys Puddle's Output node writes into an export. JSON-valued keys hold a JSON
 * document as a string, because Parquet metadata values are strings.
 */
export const PUDDLE_KEYS = {
  project: 'puddle.project',
  node: 'puddle.node',
  exportedAt: 'puddle.exportedAt',
  sources: 'puddle.sources',
  rulesPassed: 'puddle.rulesPassed',
} as const;

/** One of the files the Puddle project read, by name and Puddle's head hash. */
export const ProvenanceSourceZ = z.object({
  name: z.string(),
  headHash: z.string().optional(),
});

/** Where a dataset came from, as Puddle recorded it. Every field is optional: older exports carry none. */
export const ProvenanceZ = z.object({
  project: z.string().optional(),
  node: z.string().optional(),
  exportedAt: z.iso.datetime({ offset: true }).optional(),
  sources: z.array(ProvenanceSourceZ).optional(),
  rulesPassed: z.array(z.string()).optional(),
});
export type Provenance = z.infer<typeof ProvenanceZ>;

/**
 * Where a dataset's bytes are kept: copied into the origin private file system, reachable through a stored file
 * handle (Chromium, above the size cap), or nowhere, so the author chooses the file again after a reload.
 */
export const DatasetStorageZ = z.enum(['opfs', 'handle', 'none']);
export type DatasetStorage = z.infer<typeof DatasetStorageZ>;

export const DatasetIdZ = z.string().regex(/^[a-z0-9]{8,32}$/, 'A dataset id is 8 to 32 lower-case letters and digits.');

export const DatasetZ = z.object({
  id: DatasetIdZ,
  name: z.string().trim().min(1),
  /** The file name it was added from, or the last part of its address. */
  fileName: z.string(),
  /** The https address it was fetched from, when it came from one. */
  url: z.url({ protocol: /^https$/ }).optional(),
  format: DatasetFormatZ,
  schema: z.array(ColumnSchemaZ),
  rowCount: z.number().int().nonnegative(),
  /** SHA-256 of the first 1 MB, so a re-chosen file can be checked against this one. */
  headHash: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  storage: DatasetStorageZ,
  provenance: ProvenanceZ.optional(),
  addedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Dataset = z.infer<typeof DatasetZ>;
