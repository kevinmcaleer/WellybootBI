import type { DatasetFormat } from '@wellyboot/shared';
import { formatFromBytes, formatFromName, knownFormat, SourceError } from './detect';
import { headHash } from './hash';

/**
 * Datasets read from a web address, ported from Puddle's src/sources/url.ts. The browser fetches the file itself,
 * so the server must allow other sites to read it (CORS); nothing goes through a proxy. A Parquet file on a server
 * that supports range requests is read by DuckDB a part at a time; anything else is fetched whole.
 */

export type UrlErrorKind = 'address' | 'cors' | 'offline' | 'status' | 'format';

export class UrlSourceError extends SourceError {
  constructor(
    message: string,
    readonly kind: UrlErrorKind,
  ) {
    super(message);
    this.name = 'UrlSourceError';
  }
}

/** Puddle's wording for a server that doesn't send CORS headers. */
export const CORS_MESSAGE = 'This server doesn’t allow other sites to read the file. Download it and drop it here instead.';

const HEAD_BYTES = 1024 * 1024;

/** Plain http is fine on this machine (browsers treat it as secure), and refused anywhere else. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Check a typed or pasted address: https only (plain http is mixed content), no credentials, no fragment. */
export function parseAddress(input: string): URL {
  const text = input.trim();
  if (!text) throw new UrlSourceError('Paste the address of a Parquet, CSV, TSV, JSON or NDJSON file.', 'address');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UrlSourceError(`${text} isn’t a web address. Paste one that starts with https://.`, 'address');
  }
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname))
    throw new UrlSourceError(
      'Wellyboot BI only reads https addresses. This page is secure, so the browser blocks plain http requests from it (mixed content). Use the https version of the address.',
      'address',
    );
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UrlSourceError(`Wellyboot BI reads web addresses that start with https://, not ${url.protocol}.`, 'address');
  if (url.username || url.password) throw new UrlSourceError('Addresses with a user name or password in them can’t be read. Remove them, or download the file and drop it here instead.', 'address');
  url.hash = '';
  return url;
}

/** The address's last path segment, e.g. "orders.parquet", or the host when the path has none. */
export function nameFromAddress(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (!last) return url.hostname;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

const BY_CONTENT_TYPE: Record<string, DatasetFormat> = {
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/comma-separated-values': 'csv',
  'text/tab-separated-values': 'tsv',
  'application/json': 'json',
  'text/json': 'json',
  'application/x-ndjson': 'ndjson',
  'application/ndjson': 'ndjson',
  'application/jsonl': 'ndjson',
  'application/x-jsonlines': 'ndjson',
  'application/vnd.apache.parquet': 'parquet',
  'application/x-parquet': 'parquet',
  'application/parquet': 'parquet',
};

/** The format a Content-Type names, ignoring parameters such as charset. */
export function formatFromContentType(contentType: string | null | undefined): DatasetFormat | undefined {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return type ? BY_CONTENT_TYPE[type] : undefined;
}

/** The file's format: from the address's extension, else the server's Content-Type, else the first bytes. */
export function formatFromAddress(url: URL, contentType?: string | null, head?: Uint8Array): DatasetFormat {
  const name = nameFromAddress(url);
  if (head && formatFromBytes(head) === 'parquet') return 'parquet';
  const byName = knownFormat(name);
  if (byName) return byName;
  if (/\.xlsx?$/i.test(name)) formatFromName(name);
  const byType = formatFromContentType(contentType);
  if (byType) return byType;
  const sniffed = head && formatFromBytes(head);
  if (sniffed) return sniffed;
  throw new UrlSourceError('Wellyboot BI can’t tell this file’s format from its address or the server’s reply. Download it and drop it here instead.', 'format');
}

/** What fetching an address found: either the bytes, or that DuckDB can read it by range requests. */
export interface Fetched {
  format: DatasetFormat;
  headHash: string;
  /** Bytes in the file, when the server says. */
  size?: number;
  /** The whole file, when it was fetched. */
  data?: Uint8Array;
  /** True when DuckDB reads the address itself, by HTTP range requests. */
  ranged: boolean;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  online?: () => boolean;
  /** Fetch the whole file even when the server supports ranges, to keep a copy in the browser. */
  whole?: boolean;
  signal?: AbortSignal;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

async function request(url: URL, init: RequestInit, opts: FetchOptions): Promise<Response> {
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url.href, { ...init, cache: 'no-store', credentials: 'omit', signal: opts.signal });
  } catch (e) {
    if (isAbort(e)) throw e;
    // The browser reports a CORS refusal as a bare network error, with no detail, by design.
    const online = opts.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    if (!online()) throw new UrlSourceError(`You’re offline, so ${url.host} can’t be reached. Reconnect, then try again.`, 'offline');
    throw new UrlSourceError(CORS_MESSAGE, 'cors');
  }
  if (!res.ok) {
    const what = res.status === 404 ? 'There’s no file at this address' : `The server answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    throw new UrlSourceError(`${what} (${url.host}). Check the address and try again.`, 'status');
  }
  return res;
}

/** The total size from a Content-Range header ("bytes 0-99/1234"), when the server exposes it. */
export function totalFromContentRange(header: string | null): number | undefined {
  const m = header ? /\/(\d+)\s*$/.exec(header) : null;
  return m ? Number(m[1]) : undefined;
}

/**
 * Fetch an address: the first megabyte by a range request (for the head hash, and to learn whether the server
 * supports ranges), then the rest of the file unless DuckDB can read it by ranges (Parquet, unless `whole`).
 */
export async function fetchAddress(address: string | URL, opts: FetchOptions = {}): Promise<Fetched> {
  const url = typeof address === 'string' ? parseAddress(address) : address;
  const probe = await request(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } }, opts);
  const head = new Uint8Array(await probe.arrayBuffer());
  const format = formatFromAddress(url, probe.headers.get('content-type'), head);
  const hash = await headHash(new Blob([head.slice(0, HEAD_BYTES)]));
  const ranged = probe.status === 206;
  const total = ranged ? totalFromContentRange(probe.headers.get('content-range')) : head.byteLength;
  // The server ignored the range and sent the whole file, or the file ended inside the first megabyte.
  const whole = !ranged || head.byteLength < HEAD_BYTES || (total != null && total <= head.byteLength);
  if (whole) return { format, headHash: hash, size: head.byteLength, data: head, ranged: false };
  if (format === 'parquet' && !opts.whole) return { format, headHash: hash, size: total, ranged: true };
  const full = new Uint8Array(await (await request(url, {}, opts)).arrayBuffer());
  return { format, headHash: hash, size: full.byteLength, data: full, ranged: false };
}
