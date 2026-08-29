import { describe, expect, it } from 'vitest';
import { runBundle } from './bundle.js';
import { makeGrid, makeReading } from '../../../test/support/factories.js';
import type { GridAxis } from '../model/grid.js';

const grid = makeGrid();

function axis(bundle: GridAxis['bundle']): GridAxis {
  return { id: 'a', label: 'Axis A', bundle };
}

describe('runBundle', () => {
  it('elects the confidence-weighted majority level', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'y', weight: 1, role: 'level', params: {} },
      { criterionId: 'z', weight: 1, role: 'level', params: {} },
    ]);
    const verdict = runBundle(grid, a, [
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
    const verdict = runBundle(grid, a, [
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
    const verdict = runBundle(grid, a, [
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
    const verdict = runBundle(grid, a, [
      makeReading({ criterionId: 'x', levelId: 'l2', levelRank: 2, confidence: 1 }),
      makeReading({ criterionId: 'contra', role: 'confidence', levelId: 'l0', levelRank: 0, confidence: 0.3 }),
    ]);
    expect(verdict.levelId).toBe('l2');
    expect(verdict.confidence).toBeLessThanOrEqual(0.3);
  });

  it('scores a contradiction by the rank gap when the bundle entry declares a contradictionSlope', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'declared', weight: 1, role: 'confidence', params: { contradictionSlope: 0.35 } },
    ]);
    // Declared l5 (rank 5) against an elected l1 (rank 1): gap 4, strength max(0, 1 - 0.35*4) = 0.
    const far = runBundle(grid, a, [
      makeReading({ criterionId: 'x', levelId: 'l1', levelRank: 1, confidence: 1 }),
      makeReading({ criterionId: 'declared', role: 'confidence', levelId: 'l5', levelRank: 5, confidence: 1 }),
    ]);
    expect(far.levelId).toBe('l1');
    expect(far.confidence).toBeCloseTo(0, 5);

    // Declared l2 against elected l1: gap 1, strength 1 - 0.35 = 0.65 — a milder dent.
    const near = runBundle(grid, a, [
      makeReading({ criterionId: 'x', levelId: 'l1', levelRank: 1, confidence: 1 }),
      makeReading({ criterionId: 'declared', role: 'confidence', levelId: 'l2', levelRank: 2, confidence: 1 }),
    ]);
    expect(near.levelId).toBe('l1');
    expect(near.confidence).toBeCloseTo(0.65, 5);
  });

  it('leaves confidence untouched when the slope-scored reading agrees with the winner', () => {
    const a = axis([
      { criterionId: 'x', weight: 1, role: 'level', params: {} },
      { criterionId: 'declared', weight: 1, role: 'confidence', params: { contradictionSlope: 0.35 } },
    ]);
    const verdict = runBundle(grid, a, [
      makeReading({ criterionId: 'x', levelId: 'l3', levelRank: 3, confidence: 1 }),
      makeReading({ criterionId: 'declared', role: 'confidence', levelId: 'l3', levelRank: 3, confidence: 1 }),
    ]);
    expect(verdict.levelId).toBe('l3');
    expect(verdict.confidence).toBeCloseTo(1, 5);
  });
});
