#!/usr/bin/env node
// Cross-check the message catalogues against the keys the code actually emits.
//
//   pnpm i18n:check
//
// Every `msg('some.key', …)` call in src/ (tests excluded) must have an entry in
// i18n/en.json — EN is the pivot, so a missing EN key exits non-zero. Missing FR
// keys and catalogue entries no code references are reported but do not fail.

import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The first argument of a `msg(...)` call.
const KEY_CALL = /\bmsg\(\s*(['"])((?:(?!\1).)+)\1/g;
// Any `'a.b'` / `'a.b.c'` string literal — catches keys passed as param values
// (`factor.margin`, `band.no-cap`, `unit.comment`) or built as
// `` `band.${…}` `` fragments the call-site scan cannot see.
const KEY_LITERAL = /(['"`])([a-z][\w-]*(?:\.[\w-]+)+)\1/g;

// Prefixes whose full key set is a closed enum built dynamically at a call site.
const DYNAMIC_PREFIXES = ['factor.', 'band.', 'tier.', 'unit.', 'flag.'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** @returns {{ keys: string[], missingEn: string[], missingFr: string[], orphanEn: string[], orphanFr: string[] }} */
export function checkCatalogues(root = ROOT) {
  const called = new Set(); // first arg of a `msg(...)` call
  const seen = new Set(); // any 'a.b' string literal (param values, fragments)
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY_CALL)) called.add(m[2]);
    for (const m of text.matchAll(KEY_LITERAL)) seen.add(m[2]);
  }
  const load = (lang) => new Set(Object.keys(JSON.parse(readFileSync(join(root, 'i18n', `${lang}.json`), 'utf8'))));
  const en = load('en');
  const fr = load('fr');

  const referenced = (k) =>
    called.has(k) || seen.has(k) || DYNAMIC_PREFIXES.some((p) => k.startsWith(p));
  const notIn = (set) => (k) => !set.has(k);

  return {
    keys: [...called].sort(),
    missingEn: [...called].filter(notIn(en)).sort(),
    missingFr: [...called].filter(notIn(fr)).sort(),
    orphanEn: [...en].filter((k) => !referenced(k)).sort(),
    orphanFr: [...fr].filter((k) => !referenced(k)).sort(),
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const r = checkCatalogues();
  const line = (label, list) => {
    if (list.length > 0) process.stdout.write(`${label}:\n  ${list.join('\n  ')}\n`);
  };
  process.stdout.write(`${String(r.keys.length)} message keys in src/\n`);
  line('missing in en.json (FATAL)', r.missingEn);
  line('missing in fr.json', r.missingFr);
  line('orphan in en.json', r.orphanEn);
  line('orphan in fr.json', r.orphanFr);
  if (r.missingEn.length === 0) process.stdout.write('en.json complete\n');
  process.exit(r.missingEn.length > 0 ? 1 : 0);
}
