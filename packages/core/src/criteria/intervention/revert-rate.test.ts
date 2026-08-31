import { describe, expect, it } from 'vitest';
import { revertRate } from './revert-rate.js';
import { makeProfile, makeGrid, makePrProfile } from '../../../test/support/factories.js';
import type { PullRequestFacts } from '../../core/model/profile.js';

const grid = makeGrid();

function run(
  pr: Partial<PullRequestFacts>,
  params: Record<string, number> = {},
): ReturnType<typeof revertRate.evaluate> {
  return revertRate.evaluate({
    profile: makePrProfile(pr),
    grid,
    axisId: 'intervention',
    params,
  });
}

describe('revertRate', () => {
  it('caps low (Blue) when the revert rate clears revertHigh — ratio 0.2', () => {
    const out = run({ revertedRatio: 0.2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('cap-high');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps mid (Green) when the revert rate clears revertMid only — ratio 0.1', () => {
    const out = run({ revertedRatio: 0.1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('cap-mid');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('does not cap when the revert rate is below revertMid — ratio 0.03', () => {
    const out = run({ revertedRatio: 0.03 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The grid's top level: a cap reading at the ceiling never sits below an
      // elected winner, so `applyCaps` ignores it.
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-cap');
    }
  });

  it('does not cap perceval — the highest public revert rate, 5/63 ≈ 0.079, is just under revertMid', () => {
    const out = run({ revertedRatio: 5 / 63 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-cap');
    }
  });

  it('honours the grid calibration for the cap ranks', () => {
    const out = run({ revertedRatio: 0.2 }, { rankCapHigh: 1 });
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('reads the boundary value exactly at revertHigh as cap-high', () => {
    const out = run({ revertedRatio: 0.15 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('cap-high');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads the boundary value exactly at revertMid as cap-mid', () => {
    const out = run({ revertedRatio: 0.08 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('cap-mid');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ revertedRatio: 0.1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('returns missing-piece when there are no pull-request facts', () => {
    const out = revertRate.evaluate({
      profile: makeProfile({
        available: ['vcsActivity'],
        vcsActivity: {
          pullRequests: undefined,
          rawPullRequests: undefined,
          commits: undefined,
          tests: undefined,
          parallelism: undefined,
          ci: undefined,
        },
      }),
      grid,
      axisId: 'intervention',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when the reverted ratio is absent (often: total missing)', () => {
    const out = run({ total: undefined, revertedRatio: undefined });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
