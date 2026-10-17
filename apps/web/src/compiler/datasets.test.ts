import { countDataset, createRelation, datasetFileName, datasetRelationName, dropRelation, existingRelation, readDataset } from './datasets';

const ds = (format: 'parquet' | 'csv' | 'tsv' | 'json' | 'ndjson') => ({ id: 'abc12345', format });

describe('dataset SQL', () => {
  it('names the file and relation after the id', () => {
    expect(datasetFileName(ds('parquet'))).toBe('ds_abc12345.parquet');
    expect(datasetFileName(ds('ndjson'))).toBe('ds_abc12345.ndjson');
    expect(datasetRelationName(ds('csv'))).toBe('ds_abc12345');
  });

  it.each([
    ['parquet', `read_parquet('ds_abc12345.parquet')`],
    ['csv', `read_csv('ds_abc12345.csv', null_padding = true)`],
    ['tsv', `read_csv('ds_abc12345.tsv', delim = '\t', null_padding = true)`],
    ['json', `read_json_auto('ds_abc12345.json')`],
    ['ndjson', `read_json_auto('ds_abc12345.ndjson', format = 'newline_delimited')`],
  ] as const)('reads %s with %s', (format, sql) => {
    expect(readDataset(ds(format))).toBe(sql);
  });

  it('makes Parquet a view and the rest tables', () => {
    expect(createRelation(ds('parquet'))).toBe(`CREATE OR REPLACE VIEW "ds_abc12345" AS SELECT * FROM read_parquet('ds_abc12345.parquet')`);
    expect(createRelation(ds('csv'))).toMatch(/^CREATE OR REPLACE TABLE "ds_abc12345" AS SELECT \* FROM read_csv/);
  });

  it('drops whatever goes by the name, view or table', () => {
    expect(existingRelation(ds('csv'))).toContain(`table_name = 'ds_abc12345'`);
    expect(dropRelation(ds('csv'), 'VIEW')).toBe('DROP VIEW IF EXISTS "ds_abc12345"');
    expect(dropRelation(ds('csv'), 'BASE TABLE')).toBe('DROP TABLE IF EXISTS "ds_abc12345"');
  });

  it('counts rows', () => {
    expect(countDataset(ds('json'))).toBe('SELECT count(*)::BIGINT AS n FROM "ds_abc12345"');
  });
});
