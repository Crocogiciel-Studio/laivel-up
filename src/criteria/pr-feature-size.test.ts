import { describe, expect, it } from 'vitest';
import { prFeatureSize } from './pr-feature-size.js';
import { makeGrid, makeProfile, makePrProfile } from '../../test/support/factories.js';
import type { PrSizeDistribution, PullRequestFacts } from '../core/model/profile.js';

const grid = makeGrid();

function dist(overrides: Partial<PrSizeDistribution> = {}): PrSizeDistribution {
  return { xs: 0, s: 0, m: 0, l: 0, xl: 0, ...overrides };
}

function run(
  pr: Partial<PullRequestFacts>,
  params: Record<string, number> = {},
): ReturnType<typeof prFeatureSize.evaluate> {
  return prFeatureSize.evaluate({ profile: makePrProfile(pr), grid, axisId: 'size', params });
}

describe('prFeatureSize', () => {
  it('reads S when the median PR is small and change size is small', () => {
    const out = run({
      total: 60,
      sizeDistribution: dist({ xs: 18, s: 34, m: 8 }),
      medianFilesChanged: 2,
      medianLinesChanged: 43,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('S');
      expect(out.value.confidence.singleSource).toBe(false);
    }
  });

  it('reads M when the median PR sits in the m bucket', () => {
    const out = run({
      total: 48,
      sizeDistribution: dist({ xs: 4, s: 12, m: 24, l: 7, xl: 1 }),
      medianFilesChanged: 7,
      medianLinesChanged: 251,
    });
    expect(out.ok && out.value.levelId).toBe('l2');
  });

  it('reads L when both families land on the l tier and xl is rare', () => {
    const out = run({
      total: 71,
      sizeDistribution: dist({ xs: 2, s: 8, m: 21, l: 32, xl: 8 }),
      medianFilesChanged: 13,
      medianLinesChanged: 579,
    });
    expect(out.ok && out.value.levelId).toBe('l3');
  });

  it('lifts an l-median to L-XL when xl work is routine', () => {
    const out = run({
      total: 154,
      sizeDistribution: dist({ xs: 3, s: 9, m: 29, l: 65, xl: 48 }),
      medianFilesChanged: 29,
      medianLinesChanged: 1050,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('L-XL');
    }
  });

  it('takes the lower family — raw magnitude never pushes the level up', () => {
    const out = run({
      total: 40,
      sizeDistribution: dist({ m: 30, l: 10 }), // histogram median => M
      medianFilesChanged: 25,
      medianLinesChanged: 1200, // magnitude => XL
    });
    expect(out.ok && out.value.levelId).toBe('l2');
    if (out.ok) expect(out.value.confidence.agreement).toBeLessThan(1);
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run(
      {
        total: 30,
        sizeDistribution: dist({ m: 30 }),
        medianFilesChanged: 7,
        medianLinesChanged: 250,
      },
      { rankM: 5 },
    );
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('flags single-source when only the histogram is present', () => {
    const out = run({ total: 30, sizeDistribution: dist({ s: 30 }) });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.confidence.singleSource).toBe(true);
    }
  });

  it('works from raw magnitude alone when the histogram is missing', () => {
    const out = run({ total: 30, medianFilesChanged: 13, medianLinesChanged: 600 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.confidence.singleSource).toBe(true);
    }
  });

  it('returns missing-piece when there are no pull-request facts', () => {
    const out = prFeatureSize.evaluate({
      profile: makeProfile({
        available: ['vcsActivity'],
        vcsActivity: {
          pullRequests: undefined,
          commits: undefined,
          tests: undefined,
          parallelism: undefined,
          ci: undefined,
        },
      }),
      grid,
      axisId: 'size',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when neither size signal is available', () => {
    const out = run({ total: 12 });
    expect(out.ok).toBe(false);
  });

  it('drops sufficiency when the PR sample is thin', () => {
    const plenty = run({ total: 40, sizeDistribution: dist({ m: 40 }), medianLinesChanged: 250, medianFilesChanged: 7 });
    const thin = run({ total: 3, sizeDistribution: dist({ m: 3 }), medianLinesChanged: 250, medianFilesChanged: 7 });
    expect(plenty.ok && thin.ok).toBe(true);
    if (plenty.ok && thin.ok) {
      expect(thin.value.confidence.sufficiency).toBeLessThan(plenty.value.confidence.sufficiency);
    }
  });
});
