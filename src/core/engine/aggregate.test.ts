import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate.js';
import { makeGrid } from '../../../test/support/factories.js';
import type { AxisVerdict } from '../model/evaluation.js';

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

const grid = makeGrid({
  axes: [
    { id: 'a', label: 'A', bundle: [] },
    { id: 'b', label: 'B', bundle: [] },
    { id: 'c', label: 'C', bundle: [] },
  ],
});

describe('aggregate', () => {
  it('takes the lowest axis level and marks it binding', () => {
    const global = aggregate(
      grid,
      [verdict('a', 3), verdict('b', 1), verdict('c', 2)],
      1,
    );
    expect(global.levelId).toBe('l1');
    expect(global.bindingAxisId).toBe('b');
  });

  it('caps global confidence by axis coverage', () => {
    const global = aggregate(grid, [verdict('a', 2, 1), verdict('b', 1, 1)], 1);
    // 2 of 3 axes ruled => coverage 0.667 caps confidence
    expect(global.confidence).toBeCloseTo(2 / 3);
  });

  it('refuses to rule when too few axes could be evaluated', () => {
    const global = aggregate(grid, [verdict('a', 2), verdict('b', undefined)], 2);
    expect(global.levelId).toBeUndefined();
    expect(global.note).toContain('evidence bar not met');
  });
});
