// A small sales dataset for compiler and query tests, made as the dataset table ds_sales0001 with exact types.
import type { ColumnSchema } from '@wellyboot/shared';
import type { EngineClient } from '../../src/engine/client';

/**
 * Ten sales, built with exact types (CSV sniffing can't give DECIMAL or TIMESTAMPTZ): two with no region, one with
 * no amount, a region name with quotes in it, and a column name with spaces and quotes.
 */
export const SALES_ROWS = [
  // Region, amount, units, placed, at, paid, rep
  ['North', '10.50', 1, '2026-01-05', '2026-01-05 09:15:00', true, 'Ann'],
  ['North', '20.25', 2, '2026-01-20', '2026-01-20 09:45:00', false, 'Ann'],
  ['South', '5.00', 3, '2026-02-02', '2026-02-02 10:00:00', true, 'Bob'],
  ['South', '7.75', 4, '2026-02-14', '2026-02-14 10:30:00', true, 'Bob'],
  ['South', null, 5, '2026-02-28', '2026-02-28 23:59:59', false, 'Bob'],
  ['East', '100.00', 6, '2026-03-01', '2026-03-01 00:00:00', true, 'Cy'],
  ["O'Brien's", '1.00', 7, '2026-03-15', '2026-03-15 12:00:00', true, 'Dee'],
  ['West', '2.00', 8, '2026-04-10', '2026-04-10 12:00:00', false, 'Dee'],
  [null, '3.00', 9, '2026-04-11', '2026-04-11 12:00:00', true, 'Eve'],
  [null, '4.00', 10, '2026-05-01', '2026-05-01 12:00:00', false, 'Eve'],
] as const;

export const SALES_ID = 'sales0001';

// Test setup only: datasets are normally registered through src/datasets/register.ts.
const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));
const COLUMNS = [
  ['Region', 'Region', 'VARCHAR'],
  ['amount', 'amount', 'DECIMAL(18,2)'],
  ['units', 'units', 'BIGINT'],
  ['placed', 'placed', 'DATE'],
  ['at', 'at', 'TIMESTAMP'],
  ['at', 'at_tz', 'TIMESTAMPTZ'],
  ['paid', 'paid', 'BOOLEAN'],
  ['rep', 'Sales "rep" name', 'VARCHAR'],
] as const;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CREATE_SALES = `CREATE OR REPLACE TABLE "ds_${SALES_ID}" AS SELECT ${COLUMNS.map(([from, to, type]) => `CAST(${q(from)} AS ${type}) AS ${q(to)}`).join(', ')}
  FROM (VALUES ${SALES_ROWS.map((r) => `(${r.map(lit).join(', ')})`).join(', ')}) AS t("Region", "amount", "units", "placed", "at", "paid", "rep")`;

/** Create the sales table and return its columns as DuckDB describes them. */
export async function createSales(engine: EngineClient): Promise<ColumnSchema[]> {
  await engine.query(CREATE_SALES);
  return engine.describe(`SELECT * FROM "ds_${SALES_ID}"`);
}
