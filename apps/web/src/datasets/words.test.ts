import { counted } from './words';

it('says one row, or many rows', () => {
  expect(counted(1, 'row')).toBe('1 row');
  expect(counted(0, 'column')).toBe('0 columns');
  expect(counted(1204, 'row')).toMatch(/^1.204 rows$/);
});
