import { str } from './sql';

/** A Parquet file's key-value metadata as text, for the `puddle.*` keys Puddle writes into its exports. */
export const parquetKvMetadata = (fileName: string) =>
  `SELECT decode(key) AS key, decode(value) AS value FROM parquet_kv_metadata(${str(fileName)}) WHERE starts_with(decode(key), 'puddle.')`;
