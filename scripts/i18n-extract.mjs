#!/usr/bin/env node
// Cross-check the message catalogues against the keys the code emits.
//
//   pnpm i18n:check
//
// A key the code can emit — a `msg('some.key')` first argument, a namespaced
// string literal passed as a param value, or one of the DYNAMIC_KEYS built as
// `` `band.${MAP[x]}` `` — must have an entry in both i18n/en.json and
// i18n/fr.json. A catalogue entry nothing emits is an orphan. Any mismatch fails.

import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NS = ['criterion.', 'reading.', 'aggregate.', 'progression.', 'factor.', 'band.', 'tier.', 'unit.', 'flag.'];
// First arg of a `msg(...)` call.
const KEY_CALL = /\bmsg\(\s*(['"])((?:(?!\1).)+)\1/g;
// A namespaced string literal (a key passed as a param value, e.g. 'factor.margin').
const KEY_LITERAL = /(['"])([a-z][\w-]*(?:\.[\w-]+)+)\1/g;

// Keys built at a call site as `` `<prefix>.${LABEL_MAP[x]}` `` and so invisible
// to the literal scan. Keep in step with the label maps they come from:
//   band.*  — BAND_LABEL in bugs-floor / commit-discipline / revert-rate /
//             code-quality-floor / shared/intervention-bands / loop-convergence
//   tier.*  — memory-maintenance.Tier, test-enforcement.Tier, assistant-integration.Tier
//   unit.*  — review-comment-load; flag.* — assistant-integration
//   factor.* — progression.ts (LimitingFactor)
const DYNAMIC_KEYS = [
  'factor.agreement', 'factor.margin', 'factor.sufficiency', 'factor.none',
  'band.no-cap', 'band.cap-mid', 'band.cap-buggy', 'band.cap-soft', 'band.cap-hard',
  'band.cap-high', 'band.cap-poor', 'band.after-most', 'band.after-some', 'band.key-stages',
  'band.converging', 'band.non-converging',
  'tier.nothing', 'tier.prompts', 'tier.memory', 'tier.behavior',
  'unit.comment', 'unit.comments', 'flag.yes', 'flag.no',
];

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
  const emitted = new Set(DYNAMIC_KEYS);
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(KEY_CALL)) emitted.add(m[2]);
    for (const m of text.matchAll(KEY_LITERAL)) {
      if (NS.some((p) => m[2].startsWith(p))) emitted.add(m[2]);
    }
  }
  const load = (lang) =>
    new Set(Object.keys(JSON.parse(readFileSync(join(root, 'i18n', `${lang}.json`), 'utf8'))));
  const en = load('en');
  const fr = load('fr');
  const notIn = (set) => (k) => !set.has(k);

  return {
    keys: [...emitted].sort(),
    missingEn: [...emitted].filter(notIn(en)).sort(),
    missingFr: [...emitted].filter(notIn(fr)).sort(),
    orphanEn: [...en].filter(notIn(emitted)).sort(),
    orphanFr: [...fr].filter(notIn(emitted)).sort(),
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
  process.stdout.write(`${String(r.keys.length)} message keys emitted by src/\n`);
  line('missing in en.json', r.missingEn);
  line('missing in fr.json', r.missingFr);
  line('orphan in en.json', r.orphanEn);
  line('orphan in fr.json', r.orphanFr);
  const bad = r.missingEn.length + r.missingFr.length + r.orphanEn.length + r.orphanFr.length;
  process.stdout.write(bad === 0 ? 'catalogues in step\n' : `${String(bad)} problem(s)\n`);
  process.exit(bad > 0 ? 1 : 0);
}
