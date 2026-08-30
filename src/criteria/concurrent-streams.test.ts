import { describe, expect, it } from 'vitest';
import { concurrentStreams } from './concurrent-streams.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { ParallelismFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  parallelism: Partial<ParallelismFacts> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof concurrentStreams.evaluate> {
  return concurrentStreams.evaluate({
    profile: makeProfile({
      available: ['vcsActivity'],
      vcsActivity: {
        pullRequests: undefined,
        rawPullRequests: undefined,
        commits: undefined,
        tests: undefined,
        parallelism:
          parallelism === undefined
            ? undefined
            : {
                maxConcurrentBranches: undefined,
                medianConcurrentBranches: undefined,
                ...parallelism,
              },
        ci: undefined,
      },
    }),
    grid,
    axisId: 'parallelism',
    params,
  });
}

describe('concurrentStreams', () => {
  it('reads single-stream like perceval — median 1, peak 2', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('single-stream');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeCloseTo(2 / 3, 5);
    }
  });

  it('reads single-stream like bohort — median 1, peak 3 touches the threshold and dampens the margin', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('single-stream');
      expect(out.value.confidence.margin).toBeCloseTo(1 / 3, 5);
    }
  });

  it('reads single-stream like leodagan — median 1, peak 2 (known level, not binding)', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 });
    expect(out.ok && out.value.levelId).toBe('l3');
  });

  it('reads multi-stream like arthur — median 4, peak 7', () => {
    const out = run({ medianConcurrentBranches: 4, maxConcurrentBranches: 7 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('multi-stream');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.margin).toBeCloseTo(1 / 3, 5);
    }
  });

  it('reads band 0 when the median is zero or below', () => {
    const out = run({ medianConcurrentBranches: 0, maxConcurrentBranches: 1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l0');
      expect(out.value.rawValue).toBe('none');
    }
  });

  it('the peak never lifts the band — median 1 with a lone spike of 99 stays single-stream', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 99 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('single-stream');
      // still dampened by the spike, but the band is untouched
      expect(out.value.confidence.margin).toBeCloseTo(1 / 3, 5);
    }
  });

  it('floors the margin when the median lands exactly on the threshold', () => {
    const out = run({ medianConcurrentBranches: 3, maxConcurrentBranches: 4 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('multi-stream');
      // |3 - 3| / 3 = 0, floored to MIN_MARGIN so the vote keeps some mass.
      expect(out.value.confidence.margin).toBeCloseTo(0.15, 5);
    }
  });

  it('does not dampen the margin when there is no recorded peak', () => {
    const out = run({ medianConcurrentBranches: 1 });
    expect(out.ok && out.value.confidence.margin).toBeCloseTo(2 / 3, 5);
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ medianConcurrentBranches: 4 }, { rankMultiStream: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('honours the grid calibration for the multi-stream threshold', () => {
    const out = run({ medianConcurrentBranches: 2 }, { multiStreamThreshold: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('multi-stream');
    }
  });

  it('returns missing-piece when the profile carries no parallelism facts', () => {
    const out = run(undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when the median concurrent-branch count is absent', () => {
    const out = run({ maxConcurrentBranches: 5 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
