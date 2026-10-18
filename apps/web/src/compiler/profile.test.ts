import { profileSql } from './profile';

it('profiles every field in one query, with top values for text', () => {
  const sql = profileSql('ds_abc12345', [
    { name: 'id', type: 'BIGINT', orderable: true, top: false },
    { name: 'say "hi"', type: 'VARCHAR', orderable: true, top: true },
    { name: 'tags', type: 'VARCHAR[]', orderable: false, top: false },
  ]);
  expect(sql).toContain('count(*)::BIGINT AS "rows"');
  expect(sql).toContain('count(DISTINCT "id")::BIGINT AS f0_distinct');
  expect(sql).toContain('min("say ""hi""")::VARCHAR AS f1_min');
  expect(sql).not.toContain('f2_min');
  expect(sql).toContain('f1_top_values');
  expect(sql).not.toContain('f0_top_values');
  expect(sql.match(/FROM "ds_abc12345"/g)).toHaveLength(3);
});
