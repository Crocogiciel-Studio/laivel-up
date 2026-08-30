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
import type { GridLevel } from '../../core/model/grid.js';
import { levelByRank, orderedLevels } from '../../core/model/grid.js';
import type { CiFacts } from '../../core/model/profile.js';

/**
 * Caps the Harness axis. `tooling-context-depth` credits the top "loop" tier the
 * moment `autoRetryLoopPresent === true`; this criterion checks the loop
 * actually *converges*. A loop that re-runs the assistant but whose CI takes
 * forever to go green is not Silver/Gold work.
 *
 * Role `cap` (see `applyCaps` in `src/core/engine/bundle.ts`): the reading only
 * ever pulls the elected level *down*, never up. It judges only claimed loops:
 *
 *   no loop claimed                    → no cap: reads the grid's top level,
 *                                        which `applyCaps` ignores because a cap
 *                                        reading never sits below an elected
 *                                        winner. Convergence is not assessed.
 *   loop claimed, CI slow to green     → cap at `rankCapNonConverging`
 *     (`medianRunsToGreen >= runsHigh`     (default 4 = the "behavior" tier
 *      or `failureRate >= failHigh`)        without the loop credit)
 *   loop claimed, CI converges         → no cap
 *
 * `err(missingPiece)` when `toolingContext` is absent, or when a loop is claimed
 * but there are no CI facts to judge convergence against.
 *
 * Single-source: the two CI signals are the same "CI health" family, so the
 * agreement check is disabled and flagged. `margin` is the distance to the
 * threshold the reading was judged against; `sufficiency` is 1 when CI facts are
 * present. Thresholds and the cap rank are grid calibration (`params`), so the
 * same reading caps differently under a different preset.
 */

const PARAM_DEFAULTS = {
  runsHigh: 4,
  failHigh: 0.3,
  rankCapNonConverging: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Reading band: no loop to judge, a converging loop, or a non-converging one. */
const BAND_LABEL: Record<number, string> = {
  0: 'no-loop',
  1: 'converging',
  2: 'non-converging',
};
const NO_LOOP = 0;
const CONVERGING = 1;
const NON_CONVERGING = 2;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.1;

function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/** True when either CI signal clears the "slow to green" threshold it was read against. */
function isNonConverging(ci: CiFacts, p: Params): boolean {
  const runsSlow = ci.medianRunsToGreen !== undefined && ci.medianRunsToGreen >= p.runsHigh;
  const failsHigh = ci.failureRate !== undefined && ci.failureRate >= p.failHigh;
  return runsSlow || failsHigh;
}

/**
 * Distance of the CI signals to the threshold the band was read against,
 * normalized to `[MIN_MARGIN, 1]`. Non-converging: the widest overshoot past a
 * crossed threshold. Converging: the narrowest clearance below the thresholds —
 * the closest the loop came to being judged slow.
 */
function bandMargin(ci: CiFacts, band: number, p: Params): number {
  const clears: number[] = [];
  if (band === NON_CONVERGING) {
    if (ci.medianRunsToGreen !== undefined && ci.medianRunsToGreen >= p.runsHigh) {
      clears.push(clampMargin(ci.medianRunsToGreen - p.runsHigh, p.runsHigh));
    }
    if (ci.failureRate !== undefined && ci.failureRate >= p.failHigh) {
      clears.push(clampMargin(ci.failureRate - p.failHigh, p.failHigh));
    }
    return clears.length > 0 ? Math.max(...clears) : MIN_MARGIN;
  }
  if (ci.medianRunsToGreen !== undefined) {
    clears.push(clampMargin(p.runsHigh - ci.medianRunsToGreen, p.runsHigh));
  }
  if (ci.failureRate !== undefined) {
    clears.push(clampMargin(p.failHigh - ci.failureRate, p.failHigh));
  }
  return clears.length > 0 ? Math.min(...clears) : MIN_MARGIN;
}

/** The level this cap reads: an actual cap for a non-converging loop, the grid's top otherwise. */
function bandLevel(context: CriterionContext, band: number, p: Params): GridLevel | undefined {
  if (band === NON_CONVERGING) {
    return (
      levelByRank(context.grid, p.rankCapNonConverging) ?? orderedLevels(context.grid)[0]
    );
  }
  const levels = orderedLevels(context.grid);
  return levels[levels.length - 1];
}

export const loopConvergence: CriterionEvaluator = {
  id: 'loop-convergence',
  needs: ['toolingContext', 'vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const ci = context.profile.vcsActivity?.ci;

    // Only claimed loops are judged. No loop => neutral reading that never caps.
    if (tc.autoRetryLoopPresent !== true) {
      const level = bandLevel(context, NO_LOOP, p);
      if (level === undefined) {
        return err(missingPiece(['toolingContext'], 'grid declares no levels'));
      }
      return ok({
        levelId: level.id,
        rawValue: BAND_LABEL[NO_LOOP] ?? String(NO_LOOP),
        confidence: { agreement: 1, margin: 1, sufficiency: 1, singleSource: true },
        evidence: msg('criterion.loop-convergence.no-loop'),
      });
    }

    if (ci === undefined || (ci.medianRunsToGreen === undefined && ci.failureRate === undefined)) {
      return err(
        missingPiece(
          ['vcsActivity'],
          'auto-retry loop claimed but no CI facts to judge its convergence',
        ),
      );
    }

    const band = isNonConverging(ci, p) ? NON_CONVERGING : CONVERGING;
    const level = bandLevel(context, band, p);
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin: bandMargin(ci, band, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(ci, band),
    });
  },
};

function describe(ci: CiFacts, band: number): Message {
  return msg('criterion.loop-convergence', {
    runs: ci.medianRunsToGreen === undefined ? '?' : String(ci.medianRunsToGreen),
    failRate:
      ci.failureRate === undefined ? '?' : `${String(Math.round(ci.failureRate * 1000) / 10)}%`,
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
