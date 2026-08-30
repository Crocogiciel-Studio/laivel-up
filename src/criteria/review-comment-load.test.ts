import { describe, expect, it } from 'vitest';
import { reviewCommentLoad } from './review-comment-load.js';
import { evidenceText } from '../../test/support/evidence.js';
import { makeProfile, makeGrid, makePrProfile } from '../../test/support/factories.js';
import type { PullRequestFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  pr: Partial<PullRequestFacts>,
  params: Record<string, number> = {},
): ReturnType<typeof reviewCommentLoad.evaluate> {
  return reviewCommentLoad.evaluate({
    profile: makePrProfile(pr),
    grid,
    axisId: 'intervention',
    params,
  });
}

describe('reviewCommentLoad', () => {
  it('reads band 0 (after most) like perceval — median 7 review comments', () => {
    const out = run({ medianReviewComments: 7 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('after-most');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads band 1 (after some) like bohort — median 3 review comments', () => {
    const out = run({ medianReviewComments: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('after-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads band 2 (key stages) like leodagan — median 2 review comments', () => {
    const out = run({ medianReviewComments: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('key-stages');
    }
  });

  it('reads band 2 (key stages) like arthur — median 1 review comment', () => {
    const out = run({ medianReviewComments: 1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('key-stages');
      expect(evidenceText(out.value.evidence)).toContain('1 review comment per PR');
    }
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ medianReviewComments: 7 }, { rankAfterMost: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('reads the boundary value exactly at commentsAfterMost as band 0', () => {
    const out = run({ medianReviewComments: 6 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('after-most');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads the boundary value exactly at commentsAfterSome as band 1', () => {
    const out = run({ medianReviewComments: 3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('after-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('is more confident at the centre of band 1 than at either of its edges', () => {
    const lowerEdge = run({ medianReviewComments: 3.6 });
    const centre = run({ medianReviewComments: 4.5 }); // band 1's centre ([3, 6])
    const upperEdge = run({ medianReviewComments: 5.4 });
    expect(lowerEdge.ok && centre.ok && upperEdge.ok).toBe(true);
    if (lowerEdge.ok && centre.ok && upperEdge.ok) {
      expect(lowerEdge.value.rawValue).toBe('after-some');
      expect(centre.value.rawValue).toBe('after-some');
      expect(upperEdge.value.rawValue).toBe('after-some');
      expect(centre.value.confidence.margin).toBeGreaterThan(lowerEdge.value.confidence.margin);
      expect(centre.value.confidence.margin).toBeGreaterThan(upperEdge.value.confidence.margin);
    }
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ medianReviewComments: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('returns missing-piece when there are no pull-request facts', () => {
    const out = reviewCommentLoad.evaluate({
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

  it('returns missing-piece when the review-comment signal is absent', () => {
    const out = run({ total: 12 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
