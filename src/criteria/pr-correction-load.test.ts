import { describe, expect, it } from 'vitest';
import { prCorrectionLoad } from './pr-correction-load.js';
import { makeProfile, makeGrid } from '../../test/support/factories.js';
import type { Profile, PullRequestFacts } from '../core/model/profile.js';

const grid = makeGrid();

function prProfile(pr: Partial<PullRequestFacts>): Profile {
  return makeProfile({
    available: ['vcsActivity'],
    vcsActivity: {
      pullRequests: {
        total: undefined,
        sizeDistribution: undefined,
        medianFilesChanged: undefined,
        medianLinesChanged: undefined,
        medianCorrectionCommitsAfterOpen: undefined,
        mergedWithoutHumanEditRatio: undefined,
        revertedRatio: undefined,
        medianReviewComments: undefined,
        ...pr,
      },
      commits: undefined,
      tests: undefined,
      parallelism: undefined,
      ci: undefined,
    },
  });
}

function run(
  pr: Partial<PullRequestFacts>,
  params: Record<string, number> = {},
): ReturnType<typeof prCorrectionLoad.evaluate> {
  return prCorrectionLoad.evaluate({ profile: prProfile(pr), grid, axisId: 'intervention', params });
}

describe('prCorrectionLoad', () => {
  it('reads band 0 (after most) like perceval — 4 correction commits, 0.05 no-edit ratio', () => {
    const out = run({
      medianCorrectionCommitsAfterOpen: 4,
      mergedWithoutHumanEditRatio: 0.0476,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.confidence.singleSource).toBe(false);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('reads band 1 (after some) like bohort — 2 correction commits, 0.21 no-edit ratio', () => {
    const out = run({
      medianCorrectionCommitsAfterOpen: 2,
      mergedWithoutHumanEditRatio: 0.2083,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('reads band 2 (key stages) like leodagan — 0 correction commits, 0.52 no-edit ratio', () => {
    const out = run({
      medianCorrectionCommitsAfterOpen: 0,
      mergedWithoutHumanEditRatio: 0.521,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('does not let an optimistic family B lift the band — arthur: 1 correction commit, 0.30 no-edit ratio', () => {
    const out = run({
      medianCorrectionCommitsAfterOpen: 1,
      mergedWithoutHumanEditRatio: 0.2987,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.confidence.agreement).toBeCloseTo(0.6, 5);
    }
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ medianCorrectionCommitsAfterOpen: 4 }, { rankAfterMost: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('flags single-source and drops sufficiency when only family A is present', () => {
    const out = run({ medianCorrectionCommitsAfterOpen: 4 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.sufficiency).toBe(0.7);
    }
  });

  it('falls back to family B alone when family A is missing', () => {
    const out = run({ mergedWithoutHumanEditRatio: 0.521 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.sufficiency).toBe(0.7);
    }
  });

  it('returns missing-piece when there are no pull-request facts', () => {
    const out = prCorrectionLoad.evaluate({
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
      axisId: 'intervention',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when neither signal family is available', () => {
    const out = run({ total: 12 });
    expect(out.ok).toBe(false);
  });
});
