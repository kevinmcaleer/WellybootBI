// What kind of value each field holds, from its DuckDB type: the type tag in the data source picker, and later
// what a chart can do with the field. After Puddle's src/ui/columnKind.ts and src/compiler/types.ts.

export type FieldKind = 'number' | 'text' | 'date' | 'time' | 'datetime' | 'boolean';

export function fieldKind(duckType: string): FieldKind {
  const t = duckType.trim().toUpperCase();
  if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|REAL)$/.test(t) || t.startsWith('DECIMAL'))
    return 'number';
  if (t === 'BOOLEAN') return 'boolean';
  if (t === 'DATE') return 'date';
  if (t === 'TIME' || t.startsWith('TIME ')) return 'time';
  if (t.startsWith('TIMESTAMP')) return 'datetime';
  // Text, and anything a chart can only show as text: UUIDs, intervals, lists, structs, JSON.
  return 'text';
}

/** The tag's words. Types are never coloured. */
export const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  number: 'Number',
  text: 'Text',
  date: 'Date',
  time: 'Time',
  datetime: 'Date and time',
  boolean: 'True or false',
};

/** Whether min and max mean something for the type (not for lists, structs, maps or blobs). */
export const isOrderable = (duckType: string) => !/(\[\]$|^STRUCT|^MAP|^UNION|^BLOB|^BIT$)/i.test(duckType.trim());
