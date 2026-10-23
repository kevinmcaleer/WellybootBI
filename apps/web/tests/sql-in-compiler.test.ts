// SQL for data is written only in src/compiler/, and quoted only through its sql.ts: this test reads every other
// source file and fails on any string or template that starts a SQL statement. Tests may build their own fixtures.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const SRC = resolve(__dirname, '../src');
const STATEMENT = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|DESCRIBE|COPY|PRAGMA|INSTALL|LOAD|ATTACH|SET|WITH)\s+["'(*\w]/;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

/** The text of every string and template literal in a source file that reads like the start of a SQL statement. */
export function sqlLiterals(fileName: string, text: string): string[] {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (STATEMENT.test(node.text)) found.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      const whole = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('…');
      if (STATEMENT.test(whole)) found.push(whole);
      node.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('SQL lives in src/compiler/', () => {
  it('finds no SQL built anywhere else', () => {
    const offences = [...sourceFiles(SRC)]
      .filter((path) => !relative(SRC, path).startsWith('compiler/'))
      .flatMap((path) => sqlLiterals(path, readFileSync(path, 'utf8')).map((sql) => `${relative(SRC, path)}: ${sql}`));
    expect(offences).toEqual([]);
  });

  it('would catch a query written outside the compiler, but not words in sentences', () => {
    expect(sqlLiterals('a.ts', 'const q = `SELECT * FROM ${table}`;')).toEqual(['SELECT * FROM …']);
    expect(sqlLiterals('a.ts', `run("DROP TABLE x"); const n = 'WITH "rows" AS (SELECT 1)';`)).toHaveLength(2);
    expect(sqlLiterals('a.ts', `const label = 'Select a dataset'; const set = 'Set its type in Puddle';`)).toEqual([]);
  });
});
