import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/index.js';
import { inMemoryCatalogue } from '../../src/adapters/catalogue/in-memory-catalogue.js';
import { readDossierFromDirectory } from '../../src/adapters/inbound/json-dossier.js';
import { jsonGrilleSource } from '../../src/adapters/inbound/json-grille.js';
import { builtInEvaluators } from '../../src/criteria/index.js';
import { levelById } from '../../src/core/model/grille.js';

/**
 * The four public sample profiles are a guardrail, not a tuning target. Until
 * every axis has real criteria the engine cannot place a full global level, so
 * this asserts the weaker invariant that must already hold: no wired axis may
 * read *below* the profile's known level (a min-aggregated global could never
 * then reach that level). Tighten to an exact global-level check as the Taille,
 * Intervention and Parallèle axes come online.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures/profiles');
const GRILLE = resolve(HERE, '../../presets/aidd.json');

const KNOWN: Record<string, string> = {
  perceval: 'red',
  bohort: 'blue',
  leodagan: 'green',
  arthur: 'copper',
};

const grilleResult = jsonGrilleSource(GRILLE).load();
if (!grilleResult.ok) {
  throw new Error(`preset failed to load: ${grilleResult.error.message}`);
}
const grille = grilleResult.value;
const catalogue = inMemoryCatalogue(builtInEvaluators);

describe('known profiles guardrail', () => {
  for (const [name, expectedLevelId] of Object.entries(KNOWN)) {
    const dir = resolve(FIXTURES, name);
    const runner = existsSync(dir) ? it : it.skip;

    runner(`${name}: no wired axis reads below ${expectedLevelId}`, () => {
      const dossierResult = readDossierFromDirectory(dir);
      expect(dossierResult.ok, JSON.stringify(dossierResult)).toBe(true);
      if (!dossierResult.ok) return;

      const expectedRank = levelById(grille, expectedLevelId)?.rank ?? 0;
      const resultat = evaluate(dossierResult.value, grille, catalogue, {
        now: () => new Date('2026-08-29T00:00:00.000Z'),
      });

      const ruledAxes = resultat.axes.filter((axis) => axis.levelRank !== undefined);
      expect(ruledAxes.length).toBeGreaterThan(0);
      for (const axis of ruledAxes) {
        expect(
          axis.levelRank,
          `${name} axis ${axis.axisId} read ${String(axis.levelId)} below ${expectedLevelId}`,
        ).toBeGreaterThanOrEqual(expectedRank);
      }
    });
  }
});
