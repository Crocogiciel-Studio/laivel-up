import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { builtInEvaluators } from './index.js';

/**
 * `paramDefaults` is what a grid editor pre-fills a criterion card with
 * (#59). Two invariants keep it honest: it is a flat map of numbers, and the
 * reference preset only overrides knobs the criterion actually declares.
 */

const aidd = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../presets/aidd.json', import.meta.url)), 'utf8'),
) as {
  axes: { bundle: { criterionId: string; params: Record<string, number> }[] }[];
};

describe('criterion paramDefaults', () => {
  it('every built-in evaluator exposes a flat number map', () => {
    for (const evaluator of builtInEvaluators) {
      expect(evaluator.paramDefaults, evaluator.id).toBeTypeOf('object');
      for (const [key, value] of Object.entries(evaluator.paramDefaults)) {
        expect(typeof value, `${evaluator.id}.${key}`).toBe('number');
      }
    }
  });

  it("the AIDD preset only sets params a criterion declares a default for", () => {
    const defaultsById = new Map(
      builtInEvaluators.map((e) => [e.id, new Set(Object.keys(e.paramDefaults))]),
    );
    for (const axis of aidd.axes) {
      for (const entry of axis.bundle) {
        const declared = defaultsById.get(entry.criterionId);
        expect(declared, `unknown criterion in preset: ${entry.criterionId}`).toBeDefined();
        for (const key of Object.keys(entry.params)) {
          expect(declared?.has(key), `${entry.criterionId}: preset sets undeclared "${key}"`).toBe(
            true,
          );
        }
      }
    }
  });
});
