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
import type { CiFacts } from '../../core/model/profile.js';
import { BAND_LABEL, bandMargin, rankForBand } from './intervention-bands.js';

/**
 * Places the subject on the Intervention axis from a third signal family,
 * independent of `pr-correction-load` and `review-comment-load`: the CI
 * iteration. A pull request that takes many runs to go green, or a CI that
 * fails often, is work the human keeps having to pick back up — it reads as
 * "intervenes after the fact, on most PRs". A CI that goes green in one shot
 * reads as "intervenes at key stages only".
 *
 * Two signals, same "CI health" family, so single-source: `agreement` is
 * disabled and flagged. Each signal lands its own band; the *worst* (lowest)
 * band wins, since either kind of churn is the human stepping back in.
 *
 *   runs to green:  >= runsAfterMost   → band 0 (after most)
 *                   >= runsAfterSome   → band 1 (after some)
 *                   otherwise          → band 2 (key stages)
 *   failure rate:   >= failAfterMost   → band 0
 *                   >= failAfterSome   → band 1
 *                   otherwise          → band 2
 *
 * Band → level is grid calibration (`params`): band 2 maps to the *top* of its
 * cell (Copper), per the axis's band → rank = high-of-band convention. Band 3
 * (Silver/Gold, "never, once framed") is out of scope — no public sample
 * profile reaches it, nothing to calibrate against yet.
 */

const PARAM_DEFAULTS = {
  runsAfterMost: 3,
  runsAfterSome: 2,
  failAfterMost: 0.25,
  failAfterSome: 0.08,
  rankAfterMost: 1,
  rankAfterSome: 2,
  rankKeyStages: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

function bandFor(value: number, lo: number, hi: number): number {
  if (value >= hi) return 0;
  if (value >= lo) return 1;
  return 2;
}

interface Signal {
  readonly value: number;
  readonly band: number;
  readonly lo: number;
  readonly hi: number;
}

export const ciIterationLoad: CriterionEvaluator = {
  id: 'ci-iteration-load',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const ci = context.profile.vcsActivity?.ci;
    if (ci === undefined) {
      return err(missingPiece(['vcsActivity'], 'no CI facts in the profile'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const signals: Signal[] = [];
    if (ci.medianRunsToGreen !== undefined) {
      signals.push({
        value: ci.medianRunsToGreen,
        band: bandFor(ci.medianRunsToGreen, p.runsAfterSome, p.runsAfterMost),
        lo: p.runsAfterSome,
        hi: p.runsAfterMost,
      });
    }
    if (ci.failureRate !== undefined) {
      signals.push({
        value: ci.failureRate,
        band: bandFor(ci.failureRate, p.failAfterSome, p.failAfterMost),
        lo: p.failAfterSome,
        hi: p.failAfterMost,
      });
    }
    if (signals.length === 0) {
      return err(
        missingPiece(
          ['vcsActivity'],
          'no CI iteration signals (needs median runs to green or failure rate)',
        ),
      );
    }

    // The worst (lowest) band wins — either kind of churn is the human stepping in.
    const band = Math.min(...signals.map((s) => s.band));
    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    // Confidence rests on the signals that actually produced the winning band;
    // the narrowest clearance to their threshold is the most conservative.
    const margin = Math.min(
      ...signals
        .filter((s) => s.band === band)
        .map((s) => bandMargin(s.value, band, s.lo, s.hi, true)),
    );

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin,
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(ci, band),
    });
  },
};

function describe(ci: CiFacts, band: number): Message {
  return msg('criterion.ci-iteration-load', {
    runs: ci.medianRunsToGreen === undefined ? '?' : String(ci.medianRunsToGreen),
    failRate:
      ci.failureRate === undefined ? '?' : `${String(Math.round(ci.failureRate * 1000) / 10)}%`,
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
