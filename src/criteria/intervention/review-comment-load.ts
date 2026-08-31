import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../../core/ports/criterion-evaluator.js';
import { missingPiece } from '../../core/ports/criterion-evaluator.js';
import type { Result } from '../../core/model/result.js';
import { msg, type Message } from '../../core/model/evaluation.js';
import { ok, err } from '../../core/model/result.js';
import { levelByRank, orderedLevels } from '../../core/model/grid.js';
import { BAND_LABEL, bandMargin, rankForBand } from './intervention-bands.js';

/**
 * Places the subject on the Intervention axis from a signal family independent
 * of `pr-correction-load`: the review-comment load. The more back-and-forth a
 * pull request draws in review, the more the human is stepping in — a high
 * median review-comment count reads as "intervenes after the fact, on most
 * PRs", a low one as "intervenes at key stages only".
 *
 * Single-source: only one family produces a band, so `agreement` is disabled
 * and flagged. Band → level is grid calibration (`params`): band 2 maps to the
 * *top* of its cell (Copper), per the axis's band → rank = high-of-band
 * convention. Band 3 (Silver/Gold, "never, once framed") is out of scope — no
 * public sample profile reaches it, nothing to calibrate against yet.
 */

const PARAM_DEFAULTS = {
  commentsAfterMost: 6,
  commentsAfterSome: 3,
  rankAfterMost: 1,
  rankAfterSome: 2,
  rankKeyStages: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

function bandFromComments(value: number, p: Params): number {
  if (value >= p.commentsAfterMost) return 0;
  if (value >= p.commentsAfterSome) return 1;
  return 2;
}

/** More review comments means more after-the-fact intervention, so band 0 is the high side. */
const marginFromComments = (value: number, band: number, p: Params): number =>
  bandMargin(value, band, p.commentsAfterSome, p.commentsAfterMost, true);

export const reviewCommentLoad: CriterionEvaluator = {
  id: 'review-comment-load',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const pr = context.profile.vcsActivity?.pullRequests;
    if (pr === undefined) {
      return err(missingPiece(['vcsActivity'], 'no pull-request facts in the profile'));
    }
    const comments = pr.medianReviewComments;
    if (comments === undefined) {
      return err(
        missingPiece(['vcsActivity'], 'no median review-comment count in the profile'),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const band = bandFromComments(comments, p);
    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin: marginFromComments(comments, band, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(comments, band),
    });
  },
};

function describe(comments: number, band: number): Message {
  return msg('criterion.review-comment-load', {
    comments,
    unit: comments === 1 ? 'unit.comment' : 'unit.comments',
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
