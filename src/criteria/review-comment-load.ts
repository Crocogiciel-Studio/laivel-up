import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { ok, err } from '../core/model/result.js';
import { levelByRank, orderedLevels } from '../core/model/grid.js';

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

/** Band index, low → high: 0 after-the-fact on most, 2 at key stages only. */
const BAND_LABEL: Record<number, string> = { 0: 'after-most', 1: 'after-some', 2: 'key-stages' };

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

function bandFromComments(value: number, p: Params): number {
  if (value >= p.commentsAfterMost) return 0;
  if (value >= p.commentsAfterSome) return 1;
  return 2;
}

function rankForBand(band: number, p: Params): number {
  switch (band) {
    case 0:
      return p.rankAfterMost;
    case 1:
      return p.rankAfterSome;
    default:
      return p.rankKeyStages;
  }
}

/**
 * Distance-to-boundary, normalized to `[MIN_MARGIN, 1]`. `span` is what a full
 * unit of confidence is worth; a reading on the boundary is floored rather than
 * zeroed, so a whole-number median sitting on a band edge still carries some
 * evidence.
 */
function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/**
 * How far the median sits from the threshold its band was read against. Bands 0
 * and 2 are open-ended — distance from their single threshold. Band 1 is bounded
 * both sides — distance from the *nearer* threshold over half the band's width,
 * so the margin peaks at the band's centre, not at either edge.
 */
function bandMargin(value: number, band: number, p: Params): number {
  const lo = p.commentsAfterSome;
  const hi = p.commentsAfterMost;
  if (band === 0) return clampMargin(value - hi, hi);
  if (band === 2) return clampMargin(lo - value, lo);
  return clampMargin(Math.min(value - lo, hi - value), (hi - lo) / 2);
}

export const reviewCommentLoad: CriterionEvaluator = {
  id: 'review-comment-load',
  needs: ['vcsActivity'],

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
        margin: bandMargin(comments, band, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(comments, band),
    });
  },
};

function describe(comments: number, band: number): string {
  const unit = comments === 1 ? 'comment' : 'comments';
  return `review comment load: median ${String(comments)} review ${unit} per PR => ${BAND_LABEL[band] ?? String(band)}`;
}
