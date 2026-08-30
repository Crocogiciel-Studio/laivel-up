import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { msg, type Message } from '../core/model/evaluation.js';
import { ok, err } from '../core/model/result.js';
import type { GridLevel } from '../core/model/grid.js';
import { levelByRank, orderedLevels } from '../core/model/grid.js';

/**
 * Caps the Intervention axis. A high revert rate is autonomy that failed: work
 * that shipped and then had to be pulled back. However the other criteria read,
 * the axis cannot climb past what that failure rate allows.
 *
 * Role `cap` (see `applyCaps` in `src/core/engine/bundle.ts`): the reading only
 * ever pulls the elected level *down*, never up. Reads one signal —
 * `vcsActivity.pullRequests.revertedRatio` (reverted / total, already computed
 * by the inbound adapter):
 *
 *   >= revertHigh (default 0.15) → cap at `rankCapHigh` (default 2 = Blue)
 *   >= revertMid  (default 0.08) → cap at `rankCapMid`  (default 3 = Green)
 *   otherwise                    → no cap: reads the grid's top level, which
 *                                  `applyCaps` ignores because a cap reading
 *                                  never sits below an elected winner.
 *
 * Single-source: `agreement` is disabled and flagged. `margin` is the ratio's
 * distance to the threshold it was judged against; `sufficiency` is 1 whenever
 * the ratio is present. Thresholds and cap ranks are grid calibration
 * (`params`), so the same reading caps differently under a different preset.
 */

const PARAM_DEFAULTS = {
  revertHigh: 0.15,
  revertMid: 0.08,
  rankCapHigh: 2,
  rankCapMid: 3,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Cap band, low → high severity: 0 no cap, 1 cap mid, 2 cap high. */
const BAND_LABEL: Record<number, string> = { 0: 'no-cap', 1: 'cap-mid', 2: 'cap-high' };
const NO_CAP = 0;
const CAP_MID = 1;
const CAP_HIGH = 2;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

function capBand(ratio: number, p: Params): number {
  if (ratio >= p.revertHigh) return CAP_HIGH;
  if (ratio >= p.revertMid) return CAP_MID;
  return NO_CAP;
}

/** Distance-to-threshold, normalized to `[MIN_MARGIN, 1]`. */
function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/**
 * How far the ratio sits from the threshold its band was read against. The two
 * cap bands are open-ended upward — distance from the threshold they cleared;
 * the mid band is also bounded above by `revertHigh`, so its margin is taken
 * from the nearer boundary over half the band's width and peaks at the centre.
 * "No cap" is bounded above by `revertMid` — distance down to it.
 */
function bandMargin(ratio: number, band: number, p: Params): number {
  if (band === CAP_HIGH) return clampMargin(ratio - p.revertHigh, p.revertHigh);
  if (band === CAP_MID) {
    const half = (p.revertHigh - p.revertMid) / 2;
    return clampMargin(Math.min(ratio - p.revertMid, p.revertHigh - ratio), half);
  }
  return clampMargin(p.revertMid - ratio, p.revertMid);
}

/** The level this cap reads: an actual cap for the two upper bands, the grid's top otherwise. */
function capLevel(context: CriterionContext, band: number, p: Params): GridLevel | undefined {
  if (band === NO_CAP) {
    const levels = orderedLevels(context.grid);
    return levels[levels.length - 1];
  }
  const rank = band === CAP_HIGH ? p.rankCapHigh : p.rankCapMid;
  return levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
}

export const revertRate: CriterionEvaluator = {
  id: 'revert-rate',
  needs: ['vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const pr = context.profile.vcsActivity?.pullRequests;
    if (pr === undefined) {
      return err(missingPiece(['vcsActivity'], 'no pull-request facts in the profile'));
    }
    const ratio = pr.revertedRatio;
    if (ratio === undefined) {
      return err(
        missingPiece(
          ['vcsActivity'],
          'no reverted-PR ratio in the profile (needs both reverted and total)',
        ),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const band = capBand(ratio, p);
    const level = capLevel(context, band, p);
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin: bandMargin(ratio, band, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(ratio, band),
    });
  },
};

function describe(ratio: number, band: number): Message {
  return msg('criterion.revert-rate', {
    pct: Math.round(ratio * 1000) / 10,
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
