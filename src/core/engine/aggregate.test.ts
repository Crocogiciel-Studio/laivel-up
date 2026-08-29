import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate.js';
import { makeGrille } from '../../../test/support/factories.js';
import type { AxisVerdict } from '../model/resultat.js';

function verdict(axisId: string, rank: number | undefined, confidence = 0.9): AxisVerdict {
  return {
    axisId,
    levelId: rank === undefined ? undefined : `l${String(rank)}`,
    levelRank: rank,
    confidence,
    limitingFactor: 'none',
    readings: [],
  };
}

const grille = makeGrille({
  axes: [
    { id: 'a', label: 'A', faisceau: [] },
    { id: 'b', label: 'B', faisceau: [] },
    { id: 'c', label: 'C', faisceau: [] },
  ],
});

describe('aggregate', () => {
  it('takes the lowest axis level and marks it binding', () => {
    const global = aggregate(
      grille,
      [verdict('a', 3), verdict('b', 1), verdict('c', 2)],
      1,
    );
    expect(global.levelId).toBe('l1');
    expect(global.bindingAxisId).toBe('b');
  });

  it('caps global confidence by axis coverage', () => {
    const global = aggregate(grille, [verdict('a', 2, 1), verdict('b', 1, 1)], 1);
    // 2 of 3 axes ruled => coverage 0.667 caps confidence
    expect(global.confidence).toBeCloseTo(2 / 3);
  });

  it('refuses to rule when too few axes could be evaluated', () => {
    const global = aggregate(grille, [verdict('a', 2), verdict('b', undefined)], 2);
    expect(global.levelId).toBeUndefined();
    expect(global.note).toContain('evidence bar not met');
  });
});
