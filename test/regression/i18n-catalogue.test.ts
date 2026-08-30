import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/index.js';
import type { Message } from '../../src/core/model/evaluation.js';
import { inMemoryCatalogue } from '../../src/adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../../src/adapters/inbound/json-profile.js';
import { jsonGridSource } from '../../src/adapters/inbound/json-grid.js';
import { builtInEvaluators } from '../../src/criteria/index.js';
import { resolveMessage, type MessageCatalogue } from '../../src/adapters/outbound/resolve-message.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FIXTURES = resolve(ROOT, 'test/fixtures/profiles');
const GRID = resolve(ROOT, 'presets/aidd.json');

const load = (lang: string): MessageCatalogue =>
  JSON.parse(readFileSync(resolve(ROOT, 'i18n', `${lang}.json`), 'utf8')) as MessageCatalogue;

/** Same scan as `scripts/i18n-extract.mjs`: every `msg('key', …)` literal in src/. */
function keysInSource(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        for (const m of readFileSync(full, 'utf8').matchAll(/\bmsg\(\s*(['"])((?:(?!\1).)+)\1/g)) {
          keys.add(m[2]!);
        }
      }
    }
  };
  walk(resolve(ROOT, 'src'));
  return keys;
}

const gridResult = jsonGridSource(GRID).load();
if (!gridResult.ok) throw new Error(gridResult.error.message);
const grid = gridResult.value;
const catalogue = inMemoryCatalogue(builtInEvaluators);

/** Every Message the engine emits for a profile: the global note and each action. */
function messagesFor(name: string): Message[] {
  const profileResult = readProfileFromDirectory(resolve(FIXTURES, name));
  if (!profileResult.ok) throw new Error(profileResult.error.message);
  const ev = evaluate(profileResult.value, grid, catalogue, { now: () => new Date('2026-01-01') });
  return [ev.global.note, ...ev.progression.actions];
}

describe('i18n catalogue', () => {
  const keys = [...keysInSource()].sort();

  it('every msg() key in src/ has an en.json and fr.json entry', () => {
    const en = new Set(Object.keys(load('en')));
    const fr = new Set(Object.keys(load('fr')));
    expect(keys.filter((k) => !en.has(k)), 'missing in en.json').toEqual([]);
    expect(keys.filter((k) => !fr.has(k)), 'missing in fr.json').toEqual([]);
  });

  it.each(['perceval', 'bohort', 'leodagan', 'arthur'])(
    'resolves %s in both languages with no leftover placeholder',
    (name) => {
      const messages = messagesFor(name);
      expect(messages.length).toBeGreaterThan(0);
      for (const lang of ['en', 'fr'] as const) {
        const cat = load(lang);
        for (const message of messages) {
          const text = resolveMessage(message, cat);
          expect(text, `${lang}: ${message.key} not found`).not.toBe(message.key);
          expect(text, `${lang}: ${message.key} left a hole`).not.toMatch(/\{[a-z]+\}/i);
        }
      }
    },
  );
});
