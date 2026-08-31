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
import type { ParallelismFacts } from '../../core/model/profile.js';
import { BAND_LABEL, bandFromMedian, rankForBand } from './parallelism-bands.js';

/**
 * Corroborating reading for the Parallelism axis (role `confidence`, never
 * `level`). `concurrent-streams` places the subject from the *median* number of
 * concurrent branches and treats the peak as noise. This criterion checks the
 * same peak is not doing all the work: when `maxConcurrentBranches` towers over
 * `medianConcurrentBranches`, the parallelism came in a burst, not as a
 * sustained habit.
 *
 *   ratio = max / max(median, 1)
 *
 * It reads the band the same way `concurrent-streams` does — 0 when the median
 * is `<= 0`, 1 when it is `< multiStreamThreshold`, 2 otherwise — but drops one
 * band (floor 0) once `ratio >= burstyRatio`. That lowered reading then differs
 * from the band `concurrent-streams` elected, so `applyContradictions` in
 * `src/core/engine/bundle.ts` pulls the axis confidence down. An agreeing
 * reading has no effect; the level never moves.
 *
 * Band → rank is grid calibration (`params`), so the same ratio yields a
 * different level under a different preset. Single-source: the agreement check
 * is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  rankNone: 0,
  rankSingleStream: 3,
  rankMultiStream: 6,
  multiStreamThreshold: 3,
  burstyRatio: 3,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

export const branchBurstiness: CriterionEvaluator = {
  id: 'branch-burstiness',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const parallelism = context.profile.vcsActivity?.parallelism;
    if (parallelism === undefined) {
      return err(missingPiece(['vcsActivity'], 'no parallelism facts in the profile'));
    }

    const median = parallelism.medianConcurrentBranches;
    const max = parallelism.maxConcurrentBranches;
    if (median === undefined || max === undefined) {
      return err(
        missingPiece(['vcsActivity'], 'need both median and peak concurrent-branch counts'),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const ratio = max / Math.max(median, 1);
    const bursty = ratio >= p.burstyRatio;

    const baseBand = bandFromMedian(median, p);
    const band = bursty ? Math.max(0, baseBand - 1) : baseBand;
    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    // Normalized distance of the ratio to the bursty cutoff it was judged against.
    const margin = Math.min(1, Math.abs(ratio - p.burstyRatio) / Math.max(p.burstyRatio, 1e-9));

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: { agreement: 1, margin, sufficiency: 1, singleSource: true },
      evidence: describe(parallelism, ratio, p.burstyRatio, band, bursty),
    });
  },
};

function describe(
  parallelism: ParallelismFacts,
  ratio: number,
  burstyRatio: number,
  band: number,
  bursty: boolean,
): Message {
  const rounded = Math.round(ratio * 100) / 100;
  const tail = bursty ? ` (>= ${String(burstyRatio)}, bursty)` : ` (< ${String(burstyRatio)})`;
  const detail =
    `peak ${String(parallelism.maxConcurrentBranches)} vs median ` +
    `${String(parallelism.medianConcurrentBranches)} concurrent branches, ratio ${String(rounded)}` +
    `${tail} => ${BAND_LABEL[band] ?? String(band)}`;
  return msg('criterion.branch-burstiness', { detail });
}
