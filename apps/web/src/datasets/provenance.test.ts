import { parseProvenance } from './provenance';

describe('provenance from Puddle’s metadata', () => {
  it('reads every key Puddle writes', () => {
    expect(
      parseProvenance({
        'puddle.project': 'Shop',
        'puddle.node': 'Clean orders',
        'puddle.exportedAt': '2026-10-17T12:00:00.000Z',
        'puddle.sources': '[{"name":"orders.csv","headHash":"abc"}]',
        'puddle.rulesPassed': '["No missing ids","Totals are positive"]',
      }),
    ).toEqual({
      project: 'Shop',
      node: 'Clean orders',
      exportedAt: '2026-10-17T12:00:00.000Z',
      sources: [{ name: 'orders.csv', headHash: 'abc' }],
      rulesPassed: ['No missing ids', 'Totals are positive'],
    });
  });

  it('is undefined for a file without it', () => {
    expect(parseProvenance({})).toBeUndefined();
    expect(parseProvenance({ 'other.key': 'x' })).toBeUndefined();
  });

  it('leaves out a malformed value and keeps the rest', () => {
    expect(parseProvenance({ 'puddle.project': 'Shop', 'puddle.exportedAt': 'last week', 'puddle.sources': '{not json', 'puddle.rulesPassed': '[1,2]' })).toEqual({ project: 'Shop' });
  });
});
