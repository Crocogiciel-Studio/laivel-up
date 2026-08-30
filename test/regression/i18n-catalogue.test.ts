import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/index.js';
import type { Message } from '../../src/core/model/evaluation.js';
import { inMemoryCatalogue } from '../../src/adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../../src/adapters/inbound/json-profile.js';
import { jsonGridSource } from '../../src/adapters/inbound/json-grid.js';
import { builtInEvaluators } from '../../src/criteria/index.js';
import { resolveMessage, type MessageCatalogue } from '../../src/adapters/outbound/resolve-message.js';
import { checkCatalogues } from '../../scripts/i18n-extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FIXTURES = resolve(ROOT, 'test/fixtures/profiles');
const GRID = resolve(ROOT, 'presets/aidd.json');

const load = (lang: string): MessageCatalogue =>
  JSON.parse(readFileSync(resolve(ROOT, 'i18n', `${lang}.json`), 'utf8')) as MessageCatalogue;

const placeholders = (template: string): Set<string> =>
  new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));

const gridResult = jsonGridSource(GRID).load();
if (!gridResult.ok) throw new Error(gridResult.error.message);
const grid = gridResult.value;
const catalogue = inMemoryCatalogue(builtInEvaluators);

/** Every Message the engine emits for a profile: the note, the actions, every reading's evidence. */
function messagesFor(name: string): Message[] {
  const profileResult = readProfileFromDirectory(resolve(FIXTURES, name));
  if (!profileResult.ok) throw new Error(profileResult.error.message);
  const ev = evaluate(profileResult.value, grid, catalogue, { now: () => new Date('2026-01-01') });
  return [
    ev.global.note,
    ...ev.progression.actions,
    ...ev.axes.flatMap((a) => a.readings.map((r) => r.evidence)),
  ];
}

describe('i18n catalogue', () => {
  const report = checkCatalogues(ROOT);
  const en = load('en');
  const fr = load('fr');

  it('every msg() key in src/ has an en.json and fr.json entry', () => {
    expect(report.missingEn).toEqual([]);
    expect(report.missingFr).toEqual([]);
  });

  it('no catalogue entry is unreferenced', () => {
    expect(report.orphanEn).toEqual([]);
    expect(report.orphanFr).toEqual([]);
  });

  it.each(report.keys)('%s declares the same placeholders in en and fr', (key) => {
    const enT = en[key];
    const frT = fr[key];
    expect(enT, `en.json missing ${key}`).toBeDefined();
    expect(frT, `fr.json missing ${key}`).toBeDefined();
    expect([...placeholders(frT ?? '')].sort()).toEqual([...placeholders(enT ?? '')].sort());
  });

  it.each(['perceval', 'bohort', 'leodagan', 'arthur'])(
    'resolves %s in both languages with no leftover placeholder',
    (name) => {
      const messages = messagesFor(name);
      expect(messages.length).toBeGreaterThan(0);
      for (const lang of [en, fr]) {
        for (const message of messages) {
          const text = resolveMessage(message, lang);
          expect(text, `${message.key} not found`).not.toBe(message.key);
          expect(text, `${message.key} left a hole`).not.toMatch(/\{[a-z]+\}/i);
        }
      }
    },
  );
});
