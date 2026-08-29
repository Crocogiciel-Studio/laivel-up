import { describe, expect, it } from 'vitest';
import { declaratifContradiction } from './declaratif-contradiction.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { DeclaredProfile } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  declared: Partial<DeclaredProfile> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof declaratifContradiction.evaluate> {
  return declaratifContradiction.evaluate({
    profile: makeProfile({
      available: declared === undefined ? [] : ['declared'],
      declared:
        declared === undefined
          ? undefined
          : { stack: [], teamSize: undefined, selfAssessedLevel: undefined, notes: [], ...declared },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('declaratifContradiction', () => {
  it('is a confidence-role helper: single-source, points at the declared level, never at a raw value', () => {
    const out = run({ selfAssessedLevel: 'l3' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('l3');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.margin).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
    }
  });

  it('quotes the declared level label in the evidence', () => {
    const out = run({ selfAssessedLevel: 'l4' });
    expect(out.ok && out.value.evidence).toContain('L4');
    expect(out.ok && out.value.evidence).toContain('never raises it');
  });

  it('falls back to the raw id in the evidence when the grid has no such level', () => {
    const out = run({ selfAssessedLevel: 'wizard' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('wizard');
      expect(out.value.evidence).toContain('wizard');
    }
  });

  it('perceval — declares "l3" while the axes read lower: emits the l3 reading for the engine to score', () => {
    const out = run({ selfAssessedLevel: 'l3' });
    expect(out.ok && out.value.levelId).toBe('l3');
    expect(out.ok && out.value.rawValue).toBe('l3');
  });

  it('bohort — declares "l2": emits an l2 reading (agrees with a blue election, so the engine ignores it)', () => {
    const out = run({ selfAssessedLevel: 'l2' });
    expect(out.ok && out.value.levelId).toBe('l2');
  });

  it('arthur — no self-assessed level: missing-piece, the criterion does not weigh in', () => {
    const out = run({ selfAssessedLevel: undefined });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('declared');
      expect(out.error.detail).toBe('no self-assessed level');
    }
  });

  it('returns missing-piece when the profile carries no declared section at all', () => {
    const out = run(undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.needed).toContain('declared');
  });

  it('reads no grid calibration of its own — the slope lives on the engine side', () => {
    const out = run({ selfAssessedLevel: 'l3' }, { contradictionSlope: 0.9 });
    expect(out.ok && out.value.levelId).toBe('l3');
    expect(out.ok && out.value.confidence.margin).toBe(1);
  });
});
