import { describe, expect, it } from 'vitest';
import type { Filter } from '@wellyboot/shared';
import { draftOf, filterOf, filterWords, newDraft, opsFor, relativeWords } from './filters';

describe('filter words', () => {
  it('writes a condition without its field', () => {
    expect(filterWords({ field: 'Region', op: '<>', value: 'West' })).toBe('is not West');
    expect(filterWords({ field: 'Sales', op: 'between', from: 1, to: 5 })).toBe('is between 1 and 5');
    expect(filterWords({ field: 'Region', op: 'in', values: ['North', 'South'] })).toBe('is one of North, South');
    expect(filterWords({ field: 'Region', op: 'empty' })).toBe('is empty');
    expect(filterWords({ field: 'Date', op: 'relative', range: { kind: 'last', n: 3, unit: 'month' } })).toBe('is in the last 3 months');
  });

  it('writes relative dates as a person would', () => {
    expect(relativeWords({ kind: 'last', n: 1, unit: 'week' })).toBe('the last week');
    expect(relativeWords({ kind: 'this', unit: 'year' })).toBe('this year');
    expect(relativeWords({ kind: 'toDate', unit: 'quarter' })).toBe('quarter to date');
  });
});

describe('filter drafts', () => {
  it('offers operators that suit the field, dates starting with relative', () => {
    expect(opsFor('VARCHAR')).toContain('contains');
    expect(opsFor('DOUBLE')).not.toContain('contains');
    expect(opsFor('DATE')[0]).toBe('relative');
    expect(newDraft('DATE').op).toBe('relative');
  });

  it('makes typed numbers into numbers and refuses what is not one', () => {
    expect(filterOf({ ...newDraft('DOUBLE'), op: '>', value: '12.5' }, 'Sales', 'DOUBLE')).toEqual({ filter: { field: 'Sales', op: '>', value: 12.5 } });
    expect(filterOf({ ...newDraft('DOUBLE'), op: '>', value: 'lots' }, 'Sales', 'DOUBLE')).toEqual({ error: 'Sales needs a number' });
    expect(filterOf({ ...newDraft('DOUBLE'), op: '=', value: '' }, 'Sales', 'DOUBLE')).toEqual({ error: 'Sales needs a number' });
  });

  it('needs both ends of a range and each of a list', () => {
    expect(filterOf({ ...newDraft('INTEGER'), op: 'between', value: '1', to: '' }, 'Qty', 'INTEGER')).toEqual({ error: 'Qty needs a number at each end' });
    expect(filterOf({ ...newDraft('INTEGER'), op: 'in', values: '1, x' }, 'Qty', 'INTEGER')).toEqual({ error: 'Qty needs a number in each place' });
    expect(filterOf({ ...newDraft('INTEGER'), op: 'in', values: '1,\n2' }, 'Qty', 'INTEGER')).toEqual({ filter: { field: 'Qty', op: 'in', values: [1, 2] } });
  });

  it('needs text to search for', () => {
    expect(filterOf({ ...newDraft('VARCHAR'), op: 'contains', value: '' }, 'Rep', 'VARCHAR')).toEqual({ error: 'Type the text Rep contains' });
    expect(filterOf({ ...newDraft('VARCHAR'), op: 'contains', value: 'an' }, 'Rep', 'VARCHAR')).toEqual({ filter: { field: 'Rep', op: 'contains', value: 'an' } });
  });

  it('checks dates and booleans fit their field', () => {
    expect(filterOf({ ...newDraft('DATE'), op: '>=', value: '2026-03-01' }, 'Date', 'DATE')).toEqual({ filter: { field: 'Date', op: '>=', value: '2026-03-01' } });
    expect('error' in filterOf({ ...newDraft('DATE'), op: '>=', value: 'March' }, 'Date', 'DATE')).toBe(true);
    expect(filterOf({ ...newDraft('BOOLEAN'), op: '=', value: 'true' }, 'Paid', 'BOOLEAN')).toEqual({ filter: { field: 'Paid', op: '=', value: true } });
  });

  it('reads a filter back into a draft that makes the same filter', () => {
    const filters: [Filter, string][] = [
      [{ field: 'Sales', op: '>=', value: 10 }, 'DOUBLE'],
      [{ field: 'Sales', op: 'between', from: 1, to: 5 }, 'DOUBLE'],
      [{ field: 'Region', op: 'in', values: ['North', 'South'] }, 'VARCHAR'],
      [{ field: 'Region', op: 'notEmpty' }, 'VARCHAR'],
      [{ field: 'Date', op: 'relative', range: { kind: 'this', unit: 'year' } }, 'DATE'],
    ];
    for (const [f, type] of filters) expect(filterOf(draftOf(f), f.field, type)).toEqual({ filter: f });
  });
});
