import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/index.js';
import { inMemoryCatalogue } from '../../src/adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../../src/adapters/inbound/json-profile.js';
import { jsonGridSource } from '../../src/adapters/inbound/json-grid.js';
import { builtInEvaluators } from '../../src/criteria/index.js';
import { levelById } from '../../src/core/model/grid.js';

/**
 * The four public sample profiles are a guardrail, not a tuning target. Until
 * every axis has real criteria the engine cannot place a full global level, so
 * this asserts the weaker invariant that must already hold: no wired axis may
 * read *below* the profile's known level (a min-aggregated global could never
 * then reach that level). Tighten to an exact global-level check as the
 * Intervention and Parallelism axes come online.
 *
 * The Size axis is already calibrated against these four, so it gets the
 * stronger check: it must read the known level *exactly*.
 */

const EXACT_AXES = ['size'];

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures/profiles');
const GRID = resolve(HERE, '../../presets/aidd.json');

const KNOWN: Record<string, string> = {
  perceval: 'red',
  bohort: 'blue',
  leodagan: 'green',
  arthur: 'copper',
};

const gridResult = jsonGridSource(GRID).load();
if (!gridResult.ok) {
  throw new Error(`preset failed to load: ${gridResult.error.message}`);
}
const grid = gridResult.value;
const catalogue = inMemoryCatalogue(builtInEvaluators);

describe('known profiles guardrail', () => {
  for (const [name, expectedLevelId] of Object.entries(KNOWN)) {
    it(`${name}: no wired axis reads below ${expectedLevelId}`, () => {
      const dir = resolve(FIXTURES, name);
      expect(existsSync(dir), `missing regression fixture: ${dir}`).toBe(true);

      const profileResult = readProfileFromDirectory(dir);
      expect(profileResult.ok, JSON.stringify(profileResult)).toBe(true);
      if (!profileResult.ok) return;

      const expectedRank = levelById(grid, expectedLevelId)?.rank ?? 0;
      const evaluation = evaluate(profileResult.value, grid, catalogue, {
        now: () => new Date('2026-08-29T00:00:00.000Z'),
      });

      // The preset's evidenceFloor must stay below every public profile's global
      // confidence — a criterion retune that pushes one under it would silently
      // stop the CLI emitting a level.
      expect(
        evaluation.global.levelId,
        `${name} fell under presets/aidd.json evidenceFloor (global confidence ${String(evaluation.global.confidence)})`,
      ).toBeDefined();

      const ruledAxes = evaluation.axes.filter((axis) => axis.levelRank !== undefined);
      expect(ruledAxes.length).toBeGreaterThan(0);
      for (const axis of ruledAxes) {
        expect(
          axis.levelRank,
          `${name} axis ${axis.axisId} read ${String(axis.levelId)} below ${expectedLevelId}`,
        ).toBeGreaterThanOrEqual(expectedRank);
        if (EXACT_AXES.includes(axis.axisId)) {
          expect(
            axis.levelRank,
            `${name} axis ${axis.axisId} read ${String(axis.levelId)}, expected ${expectedLevelId}`,
          ).toBe(expectedRank);
        }
      }
    });
  }
});
