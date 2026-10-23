import type { ColumnSchema } from '@wellyboot/shared';

export interface SchemaDiff {
  added: ColumnSchema[];
  removed: ColumnSchema[];
  retyped: { name: string; from: string; to: string }[];
}

/** What a newer export changes about a dataset's columns, by name, in the newer file's order. */
export function schemaDiff(before: ColumnSchema[], after: ColumnSchema[]): SchemaDiff {
  const old = new Map(before.map((c) => [c.name, c.type]));
  const next = new Set(after.map((c) => c.name));
  return {
    added: after.filter((c) => !old.has(c.name)),
    removed: before.filter((c) => !next.has(c.name)),
    retyped: after.flatMap((c) => {
      const from = old.get(c.name);
      return from != null && from !== c.type ? [{ name: c.name, from, to: c.type }] : [];
    }),
  };
}

export const isSameSchema = (d: SchemaDiff) => !d.added.length && !d.removed.length && !d.retyped.length;
