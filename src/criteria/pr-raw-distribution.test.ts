import { describe, expect, it } from 'vitest';
import { prRawDistribution } from './pr-raw-distribution.js';
import { makeGrid, makeProfile, makeRawPrProfile } from '../../test/support/factories.js';
import type { RawPullRequest } from '../core/model/profile.js';

const grid = makeGrid();

/** A raw PR whose churn is `lines`, split arbitrarily across additions/deletions. */
function pr(lines: number): Partial<RawPullRequest> {
  return { additions: lines - 10, deletions: 10 };
}

function run(
  rows: readonly Partial<RawPullRequest>[],
  params: Record<string, number> = {},
): ReturnType<typeof prRawDistribution.evaluate> {
  return prRawDistribution.evaluate({
    profile: makeRawPrProfile(rows),
    grid,
    axisId: 'size',
    params,
  });
}

describe('prRawDistribution', () => {
  it('reads M when the median raw PR lands in the M bucket', () => {
    const out = run([pr(40), pr(90), pr(200), pr(300), pr(380)]);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('M');
      expect(out.value.confidence.singleSource).toBe(true);
    }
  });

  it('reads L when the median raw PR lands in the L bucket', () => {
    const out = run([pr(150), pr(500), pr(600), pr(1000), pr(2000)]);
    expect(out.ok && out.value.levelId).toBe('l3');
  });

  it('buckets by additions + deletions against the line thresholds', () => {
    const s = run([{ additions: 100, deletions: 20 }]); // 120 => S
    const xl = run([{ additions: 800, deletions: 150 }]); // 950 => XL
    expect(s.ok && s.value.rawValue).toBe('S');
    expect(xl.ok && xl.value.rawValue).toBe('XL');
    expect(xl.ok && xl.value.levelId).toBe('l4');
  });

  it('margin is the share of PRs sitting in the retained tier', () => {
    const out = run([pr(40), pr(90), pr(200), pr(300), pr(380)]); // 3 of 5 in M
    expect(out.ok && out.value.confidence.margin).toBeCloseTo(0.6, 5);
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run([pr(200), pr(250), pr(300)], { rankM: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('drops sufficiency when the PR sample is thin', () => {
    const plenty = run(Array.from({ length: 12 }, () => pr(200)));
    const thin = run([pr(200), pr(250), pr(300)]);
    expect(plenty.ok && thin.ok).toBe(true);
    if (plenty.ok && thin.ok) {
      expect(thin.value.confidence.sufficiency).toBeLessThan(plenty.value.confidence.sufficiency);
      expect(thin.value.confidence.sufficiency).toBeCloseTo(0.3, 5);
      expect(plenty.value.confidence.sufficiency).toBe(1);
    }
  });

  it('returns missing-piece when rawPullRequests is absent', () => {
    const out = prRawDistribution.evaluate({
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
      axisId: 'size',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.detail).toBe('no raw pull requests');
    }
  });

  it('returns missing-piece when rawPullRequests is empty', () => {
    const out = run([]);
    expect(out.ok).toBe(false);
  });
});
