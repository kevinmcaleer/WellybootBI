// Wellyboot BI uses Puddle's design system. These tests keep it that way: the vendored files must match what
// was copied from Puddle (design-system.lock.json), and app code must style through the tokens, never raw
// colours, type sizes, spacing, radii or shadows. Layout sizes (widths, heights, grid tracks) are allowed, as
// in Puddle, since the tokens don't cover them.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB = resolve(__dirname, '..');
const lock = JSON.parse(readFileSync(join(WEB, 'design-system.lock.json'), 'utf8')) as {
  puddleCommit: string;
  files: Record<string, string>;
};

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const COLOUR_UTILITY =
  'bg|text|border(?:-[xytrbl])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow';
const SPACING_UTILITY = 'p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]';
// The spacing steps the tokens define (tailwind.preset.js), plus Tailwind's 0 and px.
const SPACING_STEPS = new Set(['0', 'px', '0.5', '1', '2', '3', '4', '6', '8']);

interface Rule {
  name: string;
  test: (line: string) => string | undefined;
}

const match = (re: RegExp) => (line: string) => re.exec(line)?.[0];

export const RULES: Rule[] = [
  { name: 'hex colour', test: match(/(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![/-])/) },
  { name: 'colour function', test: match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/) },
  { name: 'Tailwind palette colour', test: match(new RegExp(`\\b(?:${COLOUR_UTILITY})-(?:${PALETTE})\\b`)) },
  { name: 'arbitrary colour', test: match(new RegExp(`\\b(?:${COLOUR_UTILITY})-\\[(?:#|rgb|hsl|color:)`)) },
  { name: 'Tailwind type size', test: match(/\btext-(?:xs|sm|base|lg|[2-9]?xl|\[\d)/) },
  { name: 'raw font size', test: match(/\bfont-?[sS]ize\s*:\s*['"]?\d/) },
  {
    name: 'spacing off the token scale',
    test: (line) => {
      const re = new RegExp(`(?<![\\w-])-?(?:${SPACING_UTILITY})-(\\[[^\\]]*\\]|[\\d.]+)(?![\\w.])`, 'g');
      for (const m of line.matchAll(re)) if (!SPACING_STEPS.has(m[1]!)) return m[0];
      return undefined;
    },
  },
  { name: 'radius off the token scale', test: match(/\brounded(?:-[trblse]{1,2})?-(?:none|xl|2xl|3xl|\[)/) },
  { name: 'shadow off the token scale', test: match(/\bshadow(?:-(?:sm|md|lg|xl|2xl|inner|\[))?(?=["'`\s])/) },
];

/** Every rule a source line breaks, as `name: offending text`. */
export function violations(source: string): string[] {
  const found: string[] = [];
  source.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      const hit = rule.test(line);
      if (hit) found.push(`line ${i + 1}, ${rule.name}: ${hit}`);
    }
  });
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the vendored design system', () => {
  it.each(Object.entries(lock.files))('%s matches Puddle', (file, hash) => {
    const actual = createHash('sha256').update(readFileSync(join(WEB, file))).digest('hex');
    expect(actual, `${file} was changed by hand; re-copy it with scripts/design-system.mjs sync`).toBe(hash);
  });

  it('is recorded at the same Puddle commit in the READMEs', () => {
    const short = lock.puddleCommit.slice(0, 7);
    expect(readFileSync(join(WEB, 'src/design-system/README.md'), 'utf8')).toContain(short);
    expect(readFileSync(join(WEB, 'src/ui/README.md'), 'utf8')).toContain(short);
  });
});

describe('app code styles through the tokens', () => {
  const vendored = new Set(Object.keys(lock.files));
  const files = sourceFiles(join(WEB, 'src'))
    .map((path) => relative(WEB, path))
    .filter((file) => !file.startsWith('src/design-system/') && !vendored.has(file));

  it.each(files)('%s', (file) => {
    expect(violations(readFileSync(join(WEB, file), 'utf8'))).toEqual([]);
  });
});

describe('violations', () => {
  it.each([
    ['className="bg-[#ff0000]"', 'hex colour'],
    ["style={{ color: '#333' }}", 'hex colour'],
    ['color: rgb(0 0 0);', 'colour function'],
    ['className="text-gray-500"', 'Tailwind palette colour'],
    ['className="border-red-600"', 'Tailwind palette colour'],
    ['className="bg-white"', 'Tailwind palette colour'],
    ['className="text-sm"', 'Tailwind type size'],
    ['className="text-[15px]"', 'Tailwind type size'],
    ["style={{ fontSize: 14 }}", 'raw font size'],
    ['font-size: 14px;', 'raw font size'],
    ['className="p-5"', 'spacing off the token scale'],
    ['className="mt-[13px]"', 'spacing off the token scale'],
    ['className="gap-x-10"', 'spacing off the token scale'],
    ['className="-mx-1.5"', 'spacing off the token scale'],
    ['className="rounded-xl"', 'radius off the token scale'],
    ['className="shadow-lg"', 'shadow off the token scale'],
    ['className="shadow"', 'shadow off the token scale'],
  ])('flags %s', (line, rule) => {
    expect(violations(line).join()).toContain(rule);
  });

  it.each([
    'className="bg-surface-raised text-ink border-line"',
    'className="text-heading text-ink-muted"',
    'className="px-4 py-8 gap-2 -mt-0.5 p-px"',
    'className="rounded-md shadow-dialog"',
    'className="w-[560px] max-w-[calc(100vw-32px)] grid-cols-[minmax(0,1fr)_320px]"',
    "navigate('#/editor')",
    'background: var(--surface-panel);',
    'className="space-y-2 text-label"',
  ])('allows %s', (line) => {
    expect(violations(line)).toEqual([]);
  });
});
