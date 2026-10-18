// The filter editor's words and drafts. A filter is edited as text (what is in the boxes) and becomes a query filter
// only once it is complete and fits its field, so a half-typed value never reaches the query.
import type { Filter, FilterOp, FilterValue, RelativeDate, RelativeUnit } from '@wellyboot/shared';
import { asNumber, fieldKind, valueFits, type FieldKind } from '../compiler/types';

export const OP_LABEL: Record<FilterOp, string> = {
  '=': 'is',
  '<>': 'is not',
  '<': 'is less than',
  '<=': 'is at most',
  '>': 'is more than',
  '>=': 'is at least',
  contains: 'contains',
  starts: 'starts with',
  ends: 'ends with',
  empty: 'is empty',
  notEmpty: 'is not empty',
  between: 'is between',
  in: 'is one of',
  relative: 'is in',
};

/** The operators that suit each kind of field, in the order the menu lists them. */
const OPS: Record<FieldKind, FilterOp[]> = {
  text: ['=', '<>', 'in', 'contains', 'starts', 'ends', 'empty', 'notEmpty'],
  number: ['=', '<>', '<', '<=', '>', '>=', 'between', 'in', 'empty', 'notEmpty'],
  date: ['relative', '=', '<', '<=', '>', '>=', 'between', 'empty', 'notEmpty'],
  datetime: ['relative', '<', '<=', '>', '>=', 'between', 'empty', 'notEmpty'],
  time: ['=', '<', '<=', '>', '>=', 'between', 'empty', 'notEmpty'],
  boolean: ['=', '<>', 'empty', 'notEmpty'],
};

export const opsFor = (type: string): FilterOp[] => OPS[fieldKind(type)];

const UNIT_WORDS: Record<RelativeUnit, [string, string]> = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], quarter: ['quarter', 'quarters'], year: ['year', 'years'] };

/** A relative date in words: "the last 3 months", "this year", "year to date". */
export function relativeWords(r: RelativeDate): string {
  if (r.kind === 'last') return `the last ${r.n === 1 ? UNIT_WORDS[r.unit][0] : `${r.n} ${UNIT_WORDS[r.unit][1]}`}`;
  if (r.kind === 'this') return `this ${r.unit}`;
  return `${r.unit} to date`;
}

const shown = (v: FilterValue) => String(v);

/** A filter's condition, without its field, for its chip: "is North", "is between 1 and 5". */
export function filterWords(f: Filter): string {
  switch (f.op) {
    case 'empty':
    case 'notEmpty':
      return OP_LABEL[f.op];
    case 'between':
      return `${OP_LABEL.between} ${shown(f.from)} and ${shown(f.to)}`;
    case 'in':
      return `${OP_LABEL.in} ${f.values.map(shown).join(', ')}`;
    case 'relative':
      return `${OP_LABEL.relative} ${relativeWords(f.range)}`;
    default:
      return `${OP_LABEL[f.op]} ${shown(f.value)}`;
  }
}

/** What the filter editor's boxes hold. */
export interface FilterDraft {
  op: FilterOp;
  value: string;
  to: string;
  /** For "is one of": the values, one a line or comma-separated. */
  values: string;
  range: RelativeDate;
}

export const newDraft = (type: string): FilterDraft => ({ op: opsFor(type)[0]!, value: '', to: '', values: '', range: { kind: 'last', n: 3, unit: 'month' } });

export function draftOf(f: Filter): FilterDraft {
  const base = { op: f.op, value: '', to: '', values: '', range: { kind: 'last', n: 3, unit: 'month' } as RelativeDate };
  if ('value' in f) return { ...base, value: String(f.value) };
  if (f.op === 'between') return { ...base, value: String(f.from), to: String(f.to) };
  if (f.op === 'in') return { ...base, values: f.values.map(String).join(', ') };
  if (f.op === 'relative') return { ...base, range: f.range };
  return base;
}

/** A value typed in a box, as the field's type wants it: numbers as numbers, true and false as booleans. */
function valueOf(text: string, type: string): FilterValue | undefined {
  const kind = fieldKind(type);
  const t = text.trim();
  if (!t && kind !== 'text') return undefined;
  const v = kind === 'number' ? asNumber(t) : kind === 'boolean' ? (t === 'true' ? true : t === 'false' ? false : undefined) : kind === 'text' ? text : t;
  return v !== undefined && valueFits(v, type) ? v : undefined;
}

const NEEDS: Record<FieldKind, string> = {
  number: 'a number',
  text: 'some text',
  date: 'a date, such as 2026-03-01',
  datetime: 'a date and time, such as 2026-03-01 14:00',
  time: 'a time, such as 14:00',
  boolean: 'true or false',
};

/** The filter a draft makes, or a sentence naming the field when it isn't complete or doesn't fit it. */
export function filterOf(d: FilterDraft, field: string, type: string): { filter: Filter } | { error: string } {
  const kind = fieldKind(type);
  const need = `${field} needs ${NEEDS[kind]}`;
  switch (d.op) {
    case 'empty':
    case 'notEmpty':
      return { filter: { field, op: d.op } };
    case 'relative':
      return { filter: { field, op: 'relative', range: d.range } };
    case 'between': {
      const from = valueOf(d.value, type);
      const to = valueOf(d.to, type);
      if (from === undefined || to === undefined || (kind === 'text' && (!d.value || !d.to))) return { error: `${need} at each end` };
      return { filter: { field, op: 'between', from, to } };
    }
    case 'in': {
      const parts = d.values.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const values = parts.map((p) => valueOf(p, type));
      if (!parts.length) return { error: `${need} or more, separated by commas` };
      if (values.some((v) => v === undefined)) return { error: `${need} in each place` };
      return { filter: { field, op: 'in', values: values as FilterValue[] } };
    }
    case 'contains':
    case 'starts':
    case 'ends':
      return d.value ? { filter: { field, op: d.op, value: d.value } } : { error: `Type the text ${field} ${OP_LABEL[d.op]}` };
    default: {
      const value = valueOf(d.value, type);
      if (value === undefined || (kind === 'text' && !d.value)) return { error: need };
      return { filter: { field, op: d.op, value } };
    }
  }
}
