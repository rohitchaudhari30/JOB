// Ratchet for component size (redesign IMP-021).
// - New/small files must stay <= LIMIT lines.
// - Files listed in file-size-baseline.json may not GROW beyond their recorded size.
// Shrinking a baseline file is encouraged: run `node scripts/check-file-size.mjs --update`
// to lower the recorded size (it never raises it).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 400;
const ROOT = fileURLToPath(new URL('../src', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('./file-size-baseline.json', import.meta.url));
const update = process.argv.includes('--update');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'tests' ? [] : walk(p);
    return /\.(tsx?|ts)$/.test(name) ? [p] : [];
  });
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const failures = [];
const next = { ...baseline };

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (rel in baseline) {
    if (lines > baseline[rel]) failures.push(`${rel}: ${lines} lines, baseline ${baseline[rel]} (must not grow)`);
    else if (lines < baseline[rel]) next[rel] = lines;
  } else if (lines > LIMIT) {
    failures.push(`${rel}: ${lines} lines exceeds ${LIMIT}; split it or justify a baseline entry`);
  }
}

if (update) {
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log('baseline lowered where files shrank');
}
if (failures.length) {
  console.error('File size check failed:\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log(`file size check ok (limit ${LIMIT}, ${Object.keys(baseline).length} baselined files)`);
