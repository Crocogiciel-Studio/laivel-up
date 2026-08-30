import { describe, expect, it } from 'vitest';
import { branchBurstiness } from './branch-burstiness.js';
import { evidenceText } from '../../test/support/evidence.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { ParallelismFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  parallelism: Partial<ParallelismFacts> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof branchBurstiness.evaluate> {
  return branchBurstiness.evaluate({
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

describe('branchBurstiness', () => {
  it('is a confidence-role helper: single-source, never leans on agreement', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
    }
  });

  it('perceval — max 2 / median 1, ratio 2: band 1, agrees with concurrent-streams', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l3');
      expect(out.value.rawValue).toBe('single-stream');
      expect(out.value.confidence.margin).toBeCloseTo(1 / 3, 5);
    }
  });

  it('bohort — max 3 / median 1, ratio 3: bursty, drops to band 0 and contradicts', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l0');
      expect(out.value.rawValue).toBe('none');
      expect(evidenceText(out.value.evidence)).toContain('bursty');
      expect(out.value.confidence.margin).toBeCloseTo(0, 5);
    }
  });

  it('leodagan — max 2 / median 1, ratio 2: band 1, no burst', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 });
    expect(out.ok && out.value.levelId).toBe('l3');
    expect(out.ok && out.value.rawValue).toBe('single-stream');
  });

  it('arthur — max 7 / median 4, ratio 1.75: band 2 sustained, agrees with concurrent-streams', () => {
    const out = run({ medianConcurrentBranches: 4, maxConcurrentBranches: 7 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('multi-stream');
      expect(out.value.confidence.margin).toBeCloseTo(1.25 / 3, 5);
    }
  });

  it('a multi-stream median with a towering peak drops one band to single-stream', () => {
    const out = run({ medianConcurrentBranches: 4, maxConcurrentBranches: 12 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('single-stream');
      expect(out.value.levelId).toBe('l3');
    }
  });

  it('never drops below band 0 however large the ratio', () => {
    const out = run({ medianConcurrentBranches: 0, maxConcurrentBranches: 20 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('none');
      expect(out.value.levelId).toBe('l0');
    }
  });

  it('divides by max(median, 1) so a zero median does not blow up the ratio', () => {
    const out = run({ medianConcurrentBranches: 0, maxConcurrentBranches: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(evidenceText(out.value.evidence)).toContain('ratio 2');
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ medianConcurrentBranches: 4, maxConcurrentBranches: 5 }, { rankMultiStream: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('honours the grid calibration for the bursty ratio', () => {
    const out = run({ medianConcurrentBranches: 1, maxConcurrentBranches: 2 }, { burstyRatio: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('none');
      expect(out.value.levelId).toBe('l0');
    }
  });

  it('honours the grid calibration for the multi-stream threshold', () => {
    const out = run({ medianConcurrentBranches: 2, maxConcurrentBranches: 3 }, { multiStreamThreshold: 2 });
    expect(out.ok).toBe(true);
    // median 2 >= threshold 2 => band 2; ratio 1.5 < 3 => not bursty
    if (out.ok) expect(out.value.rawValue).toBe('multi-stream');
  });

  it('returns missing-piece when the profile carries no parallelism facts', () => {
    const out = run(undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('vcsActivity');
    }
  });

  it('returns missing-piece when the median concurrent-branch count is absent', () => {
    const out = run({ maxConcurrentBranches: 5 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when the peak concurrent-branch count is absent', () => {
    const out = run({ medianConcurrentBranches: 2 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
