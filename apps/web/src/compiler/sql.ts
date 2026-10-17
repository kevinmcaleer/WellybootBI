// The only place identifiers and literals are quoted. Every other module builds SQL through these.
// Ported from Puddle's src/compiler/sql.ts.

/** Quote an identifier (column or table name) for DuckDB. */
export function ident(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** Quote a string literal for DuckDB. */
export function str(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

/** A numeric literal; refuses NaN and Infinity so they never reach the SQL. */
export function num(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  return String(value);
}

export function bool(value: boolean): string {
  return value ? 'true' : 'false';
}

export const list = (items: string[]) => items.join(', ');

/** A DuckDB list literal of strings: ['a', 'b']. */
export const strList = (items: string[]) => '[' + items.map(str).join(', ') + ']';

/** Point DuckDB's extension installs and autoloads at another repository. */
export const setExtensionRepository = (url: string) => [`SET custom_extension_repository = ${str(url)}`, `SET autoinstall_extension_repository = ${str(url)}`];

/** Turn off DuckDB optimizers by name, for the rest of the connection (see EngineClient's plan-copy retry). */
export const disableOptimizers = (names: string[]) => `SET disabled_optimizers = ${str(names.join(','))}`;
