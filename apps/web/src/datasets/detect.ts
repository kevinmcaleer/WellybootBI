import type { DatasetFormat } from '@wellyboot/shared';

/** A file or address that can't be made into a dataset, said in plain words (Puddle's SourceError). */
export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

// Ported from Puddle's src/sources/detect.ts, less Excel: Puddle can export Parquet instead.
const BY_EXTENSION: Record<string, DatasetFormat> = {
  csv: 'csv',
  txt: 'csv',
  tsv: 'tsv',
  tab: 'tsv',
  json: 'json',
  ndjson: 'ndjson',
  jsonl: 'ndjson',
  parquet: 'parquet',
  pq: 'parquet',
};

export const ACCEPT = '.parquet,.pq,.csv,.txt,.tsv,.tab,.json,.ndjson,.jsonl';

const extensionOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** The format a file name's extension names, or undefined when Wellyboot BI doesn't know it. */
export const knownFormat = (name: string): DatasetFormat | undefined => BY_EXTENSION[extensionOf(name)];

const EXCEL = 'Excel workbooks can’t be added yet. Export the Output node from Puddle as Parquet, then add that.';

/** Pick the format from a file name, or say plainly why it can't be loaded. */
export function formatFromName(name: string): DatasetFormat {
  const format = knownFormat(name);
  if (format) return format;
  const ext = extensionOf(name);
  if (ext === 'xlsx' || ext === 'xls') throw new SourceError(`${name}: ${EXCEL}`);
  throw new SourceError(`${name} isn't a format Wellyboot BI reads. Add a Parquet, CSV, TSV, JSON or NDJSON file.`);
}

/** The first bytes of a Parquet file. */
const PAR1 = [0x50, 0x41, 0x52, 0x31];

/**
 * The format the first bytes show, when they show one: Parquet by its magic number, JSON by a leading bracket or
 * brace. Used when a name has no extension, and to catch a Parquet file saved as .csv.
 */
export function formatFromBytes(head: Uint8Array): DatasetFormat | undefined {
  if (PAR1.every((b, i) => head[i] === b)) return 'parquet';
  let text = new TextDecoder().decode(head.subarray(0, 4096));
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trimStart();
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (text.startsWith('[')) return 'json';
  if (text.startsWith('{')) return /^\{.*\}\s*$/.test(firstLine) && text.includes('\n') ? 'ndjson' : 'json';
  return undefined;
}

/** The format of a file: Parquet whenever its bytes say so, else by its extension, else what its bytes look like. */
export async function detectFormat(file: Blob & { name: string }): Promise<DatasetFormat> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const sniffed = formatFromBytes(head);
  if (sniffed === 'parquet') return sniffed;
  const byName = knownFormat(file.name);
  if (byName) return byName;
  if (sniffed) return sniffed;
  return formatFromName(file.name);
}

/** A display name from a file name: "orders.parquet" becomes "orders". */
export function datasetName(fileName: string): string {
  const base = fileName.trim().replace(/\.(parquet|pq|csv|txt|tsv|tab|json|ndjson|jsonl)$/i, '');
  return base.trim() || 'Untitled dataset';
}
