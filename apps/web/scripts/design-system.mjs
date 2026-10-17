// Keeps the files vendored from Puddle in step with it. design-system.lock.json lists each vendored file with
// its SHA-256; tests/design-system.test.ts fails when a file no longer matches, so they can't be hand-edited.
//
//   node scripts/design-system.mjs check <puddle-checkout>   report files that differ from that checkout
//   node scripts/design-system.mjs sync <puddle-checkout>    copy them over and rewrite the lock
//
// Run from apps/web (npm run design-system -- check ../../../puddle).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LOCK = resolve(import.meta.dirname, '../design-system.lock.json');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function puddleCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const [command, puddleArg] = process.argv.slice(2);
if (!['check', 'sync'].includes(command) || !puddleArg) {
  console.error('Usage: node scripts/design-system.mjs check|sync <puddle-checkout>');
  process.exit(2);
}

const puddle = resolve(puddleArg);
const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
const web = resolve(import.meta.dirname, '..');
const files = Object.keys(lock.files);
const drifted = files.filter((file) => sha256(join(puddle, file)) !== sha256(join(web, file)));

if (command === 'check') {
  if (drifted.length === 0) {
    console.log(`All ${files.length} vendored files match Puddle at ${puddleCommit(puddle)}.`);
  } else {
    console.error(`These files differ from Puddle at ${puddleCommit(puddle)}:\n  ${drifted.join('\n  ')}`);
    console.error('Run "npm run design-system -- sync <puddle-checkout>" to re-copy them.');
    process.exit(1);
  }
} else {
  for (const file of drifted) copyFileSync(join(puddle, file), join(web, file));
  const next = {
    ...lock,
    puddleCommit: puddleCommit(puddle),
    files: Object.fromEntries(files.map((file) => [file, sha256(join(web, file))])),
  };
  writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Copied ${drifted.length} file(s) from Puddle at ${next.puddleCommit} and rewrote the lock.`);
  console.log('Update the commit in src/design-system/README.md and src/ui/README.md, then run the tests.');
}
