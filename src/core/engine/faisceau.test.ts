import { describe, expect, it } from 'vitest';
import { runFaisceau } from './faisceau.js';
import { makeGrille, makeReading } from '../../../test/support/factories.js';
import type { GrilleAxis } from '../model/grille.js';

const grille = makeGrille();

function axis(faisceau: GrilleAxis['faisceau']): GrilleAxis {
  return { id: 'a', label: 'Axis A', faisceau };
}

describe('runFaisceau', () => {
  it('elects the confidence-weighted majority level', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'y', weight: 1, role: 'level', params: {} },
      { criterionId: 'z', weight: 1, role: 'level', params: {} },
    ]);
    const verdict = runFaisceau(grille, a, [
      makeReading({ criterionId: 'x', levelId: 'l2', levelRank: 2, confidence: 0.9 }),
      makeReading({ criterionId: 'y', levelId: 'l2', levelRank: 2, confidence: 0.8 }),
      makeReading({ criterionId: 'z', levelId: 'l1', levelRank: 1, confidence: 0.5 }),
    ]);
    expect(verdict.levelId).toBe('l2');
    expect(verdict.levelRank).toBe(2);
    expect(verdict.confidence).toBeGreaterThan(0);
  });

  it('returns an unknown verdict when no level reading came through', () => {
    const a = axis([{ criterionId: 'x', weight: 1, role: 'level', params: {} }]);
    const verdict = runFaisceau(grille, a, [
      makeReading({ criterionId: 'x', status: 'unknown', levelId: undefined, levelRank: undefined, confidence: 0 }),
    ]);
    expect(verdict.levelId).toBeUndefined();
    expect(verdict.confidence).toBe(0);
    expect(verdict.limitingFactor).toBe('sufficiency');
  });

  it('lets a cap reading clamp the elected level down', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'cap', weight: 1, role: 'cap', params: {} },
    ]);
    const verdict = runFaisceau(grille, a, [
      makeReading({ criterionId: 'x', levelId: 'l3', levelRank: 3, confidence: 0.9 }),
      makeReading({ criterionId: 'cap', role: 'cap', levelId: 'l1', levelRank: 1, confidence: 0.8 }),
    ]);
    expect(verdict.levelId).toBe('l1');
    expect(verdict.levelRank).toBe(1);
  });

  it('drops axis confidence when a confidence-role reading contradicts the winner', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'contra', weight: 1, role: 'confidence', params: {} },
    ]);
    const verdict = runFaisceau(grille, a, [
      makeReading({ criterionId: 'x', levelId: 'l2', levelRank: 2, confidence: 1 }),
      makeReading({ criterionId: 'contra', role: 'confidence', levelId: 'l0', levelRank: 0, confidence: 0.3 }),
    ]);
    expect(verdict.levelId).toBe('l2');
    expect(verdict.confidence).toBeLessThanOrEqual(0.3);
  });
});
