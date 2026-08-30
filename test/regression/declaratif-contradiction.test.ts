import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evidenceText } from '../support/evidence.js';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/index.js';
import { inMemoryCatalogue } from '../../src/adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../../src/adapters/inbound/json-profile.js';
import { jsonGridSource } from '../../src/adapters/inbound/json-grid.js';
import { builtInEvaluators } from '../../src/criteria/index.js';
import type { Evaluation } from '../../src/core/model/evaluation.js';

/**
 * End-to-end check for the cross-cutting `declaratif-contradiction` criterion:
 * a self-assessment that overshoots the measured level lowers the confidence of
 * every axis it lands on and is visible in the trace; one that agrees changes
 * nothing; and no axis level ever moves because of it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../fixtures/profiles');
const GRID = resolve(HERE, '../../presets/aidd.json');

const gridResult = jsonGridSource(GRID).load();
if (!gridResult.ok) throw new Error(`preset failed to load: ${gridResult.error.message}`);
const grid = gridResult.value;
const catalogue = inMemoryCatalogue(builtInEvaluators);

function evaluateFixture(name: string): Evaluation {
  const profileResult = readProfileFromDirectory(resolve(FIXTURES, name));
  if (!profileResult.ok) throw new Error(`fixture ${name} failed to parse`);
  return evaluate(profileResult.value, grid, catalogue, {
    now: () => new Date('2026-08-29T00:00:00.000Z'),
  });
}

describe('declaratif-contradiction end to end', () => {
  it('perceval: the over-optimistic self-assessment dents every axis and shows in the evidence', () => {
    const evaluation = evaluateFixture('perceval');

    for (const axis of evaluation.axes) {
      const reading = axis.readings.find((r) => r.criterionId === 'declaratif-contradiction');
      expect(reading, `no declaratif-contradiction reading on ${axis.axisId}`).toBeDefined();
      expect(reading?.status).toBe('read');
      expect(reading?.levelId).toBe('green');
      expect(evidenceText(reading!.evidence)).toContain('self-assessment');
      expect(evidenceText(reading!.evidence)).toContain('never raises it');
    }

    const size = evaluation.axes.find((a) => a.axisId === 'size');
    // Size still reads red — a declared signal never raises a level ...
    expect(size?.levelId).toBe('red');
    // ... but the green self-assessment (rank 3) against red (rank 1) pulls the
    // axis confidence down to the rank-gap strength, 1 - 0.35 * 2 = 0.3.
    expect(size?.confidence).toBeCloseTo(0.3, 5);
    expect(size?.limitingFactor).toBe('agreement');
  });

  it('bohort: the self-assessment agrees with the measured level and changes nothing', () => {
    const evaluation = evaluateFixture('bohort');

    const size = evaluation.axes.find((a) => a.axisId === 'size');
    const reading = size?.readings.find((r) => r.criterionId === 'declaratif-contradiction');
    expect(reading?.levelId).toBe('blue');
    expect(size?.levelId).toBe('blue');
    // The Size axis has only its level criterion plus this agreeing reading, so
    // its confidence is the level read's own, undisturbed.
    expect(size?.confidence).toBeCloseTo(0.5, 5);
    expect(size?.limitingFactor).toBe('sufficiency');
  });

  it('arthur: no self-report, so the criterion abstains on every axis', () => {
    const evaluation = evaluateFixture('arthur');
    for (const axis of evaluation.axes) {
      const reading = axis.readings.find((r) => r.criterionId === 'declaratif-contradiction');
      expect(reading?.status).toBe('unknown');
      expect(reading ? evidenceText(reading.evidence) : '').toBe('no self-assessed level');
    }
  });
});
