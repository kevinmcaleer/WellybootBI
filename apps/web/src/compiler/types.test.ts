import { decimalScale, describeType, typesFit, valueFits } from './types';

describe('types', () => {
  it('describes types in words', () => {
    expect(['BIGINT', 'DECIMAL(9,2)', 'VARCHAR', 'DATE', 'TIMESTAMP WITH TIME ZONE', 'TIME', 'BOOLEAN', 'UUID'].map(describeType)).toEqual([
      'a number',
      'a number',
      'text',
      'a date',
      'a date and time',
      'a time',
      'true or false',
      'text',
    ]);
  });

  it('lets numbers meet numbers and dates meet timestamps', () => {
    expect(typesFit('INTEGER', 'DOUBLE')).toBe(true);
    expect(typesFit('DATE', 'TIMESTAMP')).toBe(true);
    expect(typesFit('VARCHAR', 'BIGINT')).toBe(false);
  });

  it('reads the decimals a type fixes', () => {
    expect([decimalScale('DECIMAL(18,3)'), decimalScale('BIGINT'), decimalScale('DOUBLE')]).toEqual([3, 0, undefined]);
  });

  it.each([
    [3, 'BIGINT', true],
    [' 3.5 ', 'DOUBLE', true],
    ['3 apples', 'DOUBLE', false],
    ['true', 'BOOLEAN', true],
    [1, 'BOOLEAN', false],
    ['2026-03-01', 'DATE', true],
    ['2026-03-01 14:00', 'DATE', false],
    ['2026-03-01 14:00:05.5', 'TIMESTAMP', true],
    ['2026-03-01T14:00:00Z', 'TIMESTAMP WITH TIME ZONE', true],
    ['14:00', 'TIME', true],
    [42, 'VARCHAR', true],
  ])('%j fits %s: %s', (v, type, fits) => {
    expect(valueFits(v, type)).toBe(fits);
  });
});
