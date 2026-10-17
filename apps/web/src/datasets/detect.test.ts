import { ACCEPT, datasetName, detectFormat, formatFromBytes, formatFromName, SourceError } from './detect';
import { headHash } from './hash';

const bytes = (s: string) => new TextEncoder().encode(s);
const file = (name: string, body: Uint8Array | string) => new File([typeof body === 'string' ? body : new Uint8Array(body)], name);
const PARQUET = new Uint8Array([0x50, 0x41, 0x52, 0x31, 0, 0, 0]);

describe('format from a file name', () => {
  it.each([
    ['orders.csv', 'csv'],
    ['ORDERS.CSV', 'csv'],
    ['notes.txt', 'csv'],
    ['orders.tsv', 'tsv'],
    ['orders.tab', 'tsv'],
    ['items.json', 'json'],
    ['events.ndjson', 'ndjson'],
    ['events.jsonl', 'ndjson'],
    ['data.parquet', 'parquet'],
    ['data.pq', 'parquet'],
  ])('%s is %s', (name, format) => {
    expect(formatFromName(name)).toBe(format);
  });

  it('asks for a Parquet export instead of an Excel workbook', () => {
    expect(() => formatFromName('book.xlsx')).toThrow(SourceError);
    expect(() => formatFromName('book.xlsx')).toThrow('book.xlsx: Excel workbooks can’t be added yet. Export the Output node from Puddle as Parquet, then add that.');
    expect(() => formatFromName('book.xls')).toThrow(/Export the Output node from Puddle as Parquet/);
  });

  it('refuses unknown formats with what it can read', () => {
    expect(() => formatFromName('photo.png')).toThrow('photo.png isn\'t a format Wellyboot BI reads. Add a Parquet, CSV, TSV, JSON or NDJSON file.');
    expect(() => formatFromName('README')).toThrow(SourceError);
  });

  it('accepts exactly the extensions it can read in the file chooser', () => {
    for (const ext of ACCEPT.split(',')) expect(() => formatFromName(`f${ext}`)).not.toThrow();
  });
});

describe('format from the first bytes', () => {
  it.each([
    ['  [{"a":1}]', 'json'],
    ['﻿{"a":1}', 'json'],
    ['{"a":1}\n{"a":2}', 'ndjson'],
    ['{\n  "a": 1\n}', 'json'],
    ['a,b\n1,2', undefined],
  ])('%j is %s', (text, format) => {
    expect(formatFromBytes(bytes(text))).toBe(format);
  });

  it('knows Parquet by its magic number', () => {
    expect(formatFromBytes(PARQUET)).toBe('parquet');
  });
});

describe('detecting a file’s format', () => {
  it('trusts the extension for text formats', async () => {
    expect(await detectFormat(file('orders.csv', 'a,b\n1,2'))).toBe('csv');
    expect(await detectFormat(file('rows.json', '{"a":1}\n{"a":2}'))).toBe('json');
  });

  it('reads a Parquet file whatever it is called', async () => {
    expect(await detectFormat(file('export.csv', PARQUET))).toBe('parquet');
    expect(await detectFormat(file('export', PARQUET))).toBe('parquet');
  });

  it('sniffs JSON when the name has no extension', async () => {
    expect(await detectFormat(file('download', '{"a":1}\n{"a":2}\n'))).toBe('ndjson');
  });

  it('refuses a file it can’t place', async () => {
    await expect(detectFormat(file('download', 'a,b'))).rejects.toThrow(SourceError);
  });
});

it('names a dataset after its file, without the extension', () => {
  expect(datasetName('orders.parquet')).toBe('orders');
  expect(datasetName('Sales 2026.CSV')).toBe('Sales 2026');
  expect(datasetName('notes')).toBe('notes');
  expect(datasetName('  ')).toBe('Untitled dataset');
  expect(datasetName('.parquet')).toBe('Untitled dataset');
});

describe('head hash', () => {
  it('is stable for the same bytes and ignores anything past the first megabyte', async () => {
    const mb = 1024 * 1024;
    const a = new Uint8Array(mb + 10).fill(7);
    const b = new Uint8Array(mb + 10).fill(7);
    b[mb + 5] = 9;
    expect(await headHash(new Blob([a]))).toBe(await headHash(new Blob([b])));
    b[0] = 1;
    expect(await headHash(new Blob([b]))).not.toBe(await headHash(new Blob([a])));
    expect(await headHash(new Blob([a]))).toMatch(/^[0-9a-f]{64}$/);
  });
});
