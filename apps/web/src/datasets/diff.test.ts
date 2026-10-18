import { isSameSchema, schemaDiff } from './diff';

it('lists exactly the added, removed and retyped columns', () => {
  const d = schemaDiff(
    [
      { name: 'id', type: 'BIGINT' },
      { name: 'total', type: 'DOUBLE' },
      { name: 'note', type: 'VARCHAR' },
    ],
    [
      { name: 'id', type: 'BIGINT' },
      { name: 'total', type: 'DECIMAL(18,2)' },
      { name: 'placed', type: 'DATE' },
    ],
  );
  expect(d).toEqual({
    added: [{ name: 'placed', type: 'DATE' }],
    removed: [{ name: 'note', type: 'VARCHAR' }],
    retyped: [{ name: 'total', from: 'DOUBLE', to: 'DECIMAL(18,2)' }],
  });
  expect(isSameSchema(d)).toBe(false);
});

it('finds no change when only the order differs', () => {
  const d = schemaDiff(
    [
      { name: 'a', type: 'INTEGER' },
      { name: 'b', type: 'VARCHAR' },
    ],
    [
      { name: 'b', type: 'VARCHAR' },
      { name: 'a', type: 'INTEGER' },
    ],
  );
  expect(isSameSchema(d)).toBe(true);
});
