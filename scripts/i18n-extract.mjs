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
const KEY_CALL = /\bmsg\(\s*(['"])((?:(?!\1).)+)\1/g;

// Keys built dynamically (`factor.${limitingFactor}` in progression.ts) so the
// static scan cannot see them. LimitingFactor is a closed enum; keep in step.
const DYNAMIC_KEYS = ['factor.agreement', 'factor.margin', 'factor.sufficiency', 'factor.none'];

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
  const keys = new Set(DYNAMIC_KEYS);
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(KEY_CALL)) keys.add(match[2]);
  }
  const load = (lang) => new Set(Object.keys(JSON.parse(readFileSync(join(root, 'i18n', `${lang}.json`), 'utf8'))));
  const en = load('en');
  const fr = load('fr');
  const diff = (a, b) => [...a].filter((k) => !b.has(k)).sort();
  return {
    keys: [...keys].sort(),
    missingEn: diff(keys, en),
    missingFr: diff(keys, fr),
    orphanEn: diff(en, keys),
    orphanFr: diff(fr, keys),
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
