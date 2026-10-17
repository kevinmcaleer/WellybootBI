import { fieldKind, isOrderable } from './fields';

it.each([
  ['INTEGER', 'number'],
  ['BIGINT', 'number'],
  ['DOUBLE', 'number'],
  ['DECIMAL(18,3)', 'number'],
  ['UHUGEINT', 'number'],
  ['VARCHAR', 'text'],
  ['UUID', 'text'],
  ['VARCHAR[]', 'text'],
  ['STRUCT(a INTEGER)', 'text'],
  ['BOOLEAN', 'boolean'],
  ['DATE', 'date'],
  ['TIME', 'time'],
  ['TIME WITH TIME ZONE', 'time'],
  ['TIMESTAMP', 'datetime'],
  ['TIMESTAMP WITH TIME ZONE', 'datetime'],
  ['TIMESTAMP_NS', 'datetime'],
  ['date', 'date'],
] as const)('%s is %s', (type, kind) => {
  expect(fieldKind(type)).toBe(kind);
});

it('orders only scalar types', () => {
  expect(isOrderable('VARCHAR')).toBe(true);
  expect(isOrderable('DATE')).toBe(true);
  expect(isOrderable('INTEGER[]')).toBe(false);
  expect(isOrderable('STRUCT(a INTEGER)')).toBe(false);
  expect(isOrderable('BLOB')).toBe(false);
});
