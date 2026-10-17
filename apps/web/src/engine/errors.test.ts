import { EngineError, toEngineError } from './errors';

describe('toEngineError', () => {
  it.each([
    ['Parser Error: syntax error at or near "SELEC"\n\nLINE 1: SELEC 1', 'syntax', /couldn't be read: syntax error at or near "SELEC"/],
    ['Binder Error: Referenced column "order_dt" not found in FROM clause!', 'missing', /The field order_dt isn't in this data source/],
    ["Binder Error: No function matches the given name and argument types 'year(VARCHAR)'. You might need to add explicit type casts.", 'missing', /text where dates or numbers are needed\. Set its type in Puddle/],
    ['Catalog Error: Table with name ds_x does not exist!', 'missing', /ds_x isn't loaded\. Add the data source again/],
    ["Conversion Error: Could not convert string 'abc' to INT32", 'conversion', /couldn't be converted/],
    ['IO Error: No files found that match the pattern "x.csv"', 'io', /file couldn't be read.*export from Puddle/],
    ['Out of Memory Error: failed to allocate data of size 2.0 GiB', 'out-of-memory', /ran out of memory/],
    ['Invalid Input Error: Error when sniffing file', 'invalid-input', /^Error when sniffing file\.$/],
    ['Catalog Error: Table Function with name "read_json_auto" is not in the catalog, but it exists in the json extension.', 'missing-extension', /needs DuckDB's json extension/],
    ['INTERRUPT Error: Interrupted!', 'cancelled', /cancelled/],
    // An error the app raises on purpose is shown as written.
    ['Invalid Input Error: Wellyboot BI: This chart needs a number on its value axis.', 'invalid-input', /^This chart needs a number on its value axis\.$/],
    [
      'Binder Error: column "name" must appear in the GROUP BY clause or must be part of an aggregate function.\nEither add it to the GROUP BY list, or use "ANY_VALUE(name)" if the exact value of "name" is not important.',
      'invalid-input',
      /^name is used but neither grouped nor summarised\. Group by it, or summarise it\.$/,
    ],
    ['Something odd', 'unknown', /Something odd/],
  ])('%s', (raw, code, message) => {
    const e = toEngineError(new Error(raw));
    expect(e).toBeInstanceOf(EngineError);
    expect(e.code).toBe(code);
    expect(e.message).toMatch(message);
    expect(e.detail).toBe(raw);
  });

  it('passes EngineErrors through', () => {
    const e = new EngineError('io', 'x');
    expect(toEngineError(e)).toBe(e);
  });
});
