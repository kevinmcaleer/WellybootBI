import { describe, expect, it } from 'vitest';
import { DatasetZ, PUDDLE_KEYS, ProvenanceZ, type Dataset } from './index.ts';

const dataset: Dataset = {
  id: 'a1b2c3d4e5f6',
  name: 'Orders',
  fileName: 'orders.parquet',
  format: 'parquet',
  schema: [
    { name: 'order_id', type: 'BIGINT' },
    { name: 'placed', type: 'DATE' },
  ],
  rowCount: 1200,
  headHash: 'a'.repeat(64),
  size: 48_213,
  storage: 'opfs',
  provenance: { project: 'Shop', node: 'Clean orders', exportedAt: '2026-10-17T12:00:00Z', rulesPassed: ['No missing ids'] },
  addedAt: '2026-10-17T12:01:00.000Z',
  updatedAt: '2026-10-17T12:01:00.000Z',
};

const pathOf = (input: unknown) => DatasetZ.safeParse(input).error?.issues.map((i) => i.path.join('.'));

describe('DatasetZ', () => {
  it('accepts a complete record', () => {
    expect(DatasetZ.parse(dataset)).toEqual(dataset);
  });

  it('accepts a record with no provenance and an https address', () => {
    const { provenance: _, ...rest } = dataset;
    expect(DatasetZ.safeParse({ ...rest, url: 'https://example.com/orders.parquet' }).success).toBe(true);
  });

  it('rejects an http address', () => {
    expect(pathOf({ ...dataset, url: 'http://example.com/orders.parquet' })).toEqual(['url']);
  });

  it('rejects Excel, which this phase leaves out', () => {
    expect(pathOf({ ...dataset, format: 'xlsx' })).toEqual(['format']);
  });

  it('rejects a blank name and a column with no type, naming where', () => {
    expect(pathOf({ ...dataset, name: '  ', schema: [{ name: 'a', type: '' }] })).toEqual(['name', 'schema.0.type']);
  });

  it('rejects an id that could not be part of a view name', () => {
    expect(pathOf({ ...dataset, id: 'Orders; DROP' })).toEqual(['id']);
  });

  it('rejects a negative row count and a short head hash', () => {
    expect(pathOf({ ...dataset, rowCount: -1, headHash: 'abc' })).toEqual(['rowCount', 'headHash']);
  });
});

describe('ProvenanceZ', () => {
  it('accepts an empty object, for exports without Puddle metadata', () => {
    expect(ProvenanceZ.parse({})).toEqual({});
  });

  it('rejects an export time that is not a timestamp', () => {
    expect(ProvenanceZ.safeParse({ exportedAt: 'yesterday' }).success).toBe(false);
  });

  it('names the keys Puddle writes', () => {
    expect(Object.values(PUDDLE_KEYS)).toEqual(['puddle.project', 'puddle.node', 'puddle.exportedAt', 'puddle.sources', 'puddle.rulesPassed']);
  });
});
