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
    expect(global.note).toEqual({
      key: 'aggregate.evidence-bar-not-met',
      params: { ruled: 1, total: 3, required: 2 },
    });
  });

  it('withholds the level when global confidence is below the evidence floor', () => {
    // 3/3 axes ruled (coverage 1), binding confidence 0.2 -> below a 0.5 floor
    const global = aggregate(
      grid,
      [verdict('a', 2, 0.2), verdict('b', 1, 0.2), verdict('c', 3, 0.2)],
      1,
      0.5,
    );
    expect(global.levelId).toBeUndefined();
    expect(global.levelRank).toBeUndefined();
    expect(global.bindingAxisId).toBe('b'); // kept for diagnosis
    expect(global.note).toEqual({
      key: 'aggregate.confidence-below-floor',
      params: { confidence: 0.2, floor: 0.5 },
    });
  });

  it('rules normally when confidence sits on or above the floor', () => {
    const global = aggregate(
      grid,
      [verdict('a', 2, 0.6), verdict('b', 1, 0.6), verdict('c', 3, 0.6)],
      1,
      0.5,
    );
    expect(global.levelId).toBe('l1');
    expect(global.note.key).toBe('aggregate.binding');
  });

  it('defaults to no confidence gate when evidenceFloor is omitted', () => {
    const global = aggregate(grid, [verdict('a', 1, 0.01), verdict('b', 1, 0.01), verdict('c', 1, 0.01)], 1);
    expect(global.levelId).toBe('l1');
  });
});
