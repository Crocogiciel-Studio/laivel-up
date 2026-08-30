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
import { levelByRank, orderedLevels } from '../core/model/grid.js';
import type { ParallelismFacts } from '../core/model/profile.js';
import { BAND_LABEL, MIN_MARGIN, bandFromMedian, rankForBand } from './shared/parallelism-bands.js';

/**
 * Places the subject on the Parallelism axis: how many streams of work usually
 * advance at once. One signal family, read from the *median* number of
 * concurrent branches — an isolated spike is not a habit, so the peak
 * (`maxConcurrentBranches`) never enters the reading. It only tempers
 * confidence, when it clears the threshold the median stays under and hints the
 * median understates a routine.
 *
 *   median <= 0         → nothing in parallel
 *   median < threshold  → a single stream at a time
 *   median >= threshold → several streams in flight
 *
 * Band → level is grid calibration (`params`), so the same reading yields a
 * different level under a different preset. Single-source: the agreement check
 * is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  rankNone: 0,
  rankSingleStream: 3,
  rankMultiStream: 6,
  multiStreamThreshold: 3,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** A peak clearing the threshold while the median does not: the median may understate the habit. */
const SPIKE_ATTENUATION = 0.5;

export const concurrentStreams: CriterionEvaluator = {
  id: 'concurrent-streams',
  needs: ['vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const parallelism = context.profile.vcsActivity?.parallelism;
    if (parallelism === undefined) {
      return err(missingPiece(['vcsActivity'], 'no parallelism facts in the profile'));
    }

    const median = parallelism.medianConcurrentBranches;
    if (median === undefined) {
      return err(missingPiece(['vcsActivity'], 'no median concurrent-branch count to read'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const band = bandFromMedian(median, p);
    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    const threshold = p.multiStreamThreshold;
    const max = parallelism.maxConcurrentBranches;
    // Normalized distance of the median to the threshold it was read against.
    let margin = Math.min(1, Math.abs(median - threshold) / Math.max(threshold, 1e-9));
    // A spike past the threshold while the median stays under it suggests an ambiguous habit.
    if (median < threshold && max !== undefined && max >= threshold) {
      margin *= SPIKE_ATTENUATION;
    }
    // A whole-number median landing exactly on the threshold is still a clean
    // band read — floor its margin rather than zero it (and with it the vote
    // mass), as the sibling `level` criteria do.
    margin = Math.max(MIN_MARGIN, margin);

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: { agreement: 1, margin, sufficiency: 1, singleSource: true },
      evidence: describe(parallelism, band, threshold),
    });
  },
};

function describe(parallelism: ParallelismFacts, band: number, threshold: number): Message {
  const parts = [`median ${String(parallelism.medianConcurrentBranches)} concurrent branches`];
  if (parallelism.maxConcurrentBranches !== undefined) {
    parts.push(`peak ${String(parallelism.maxConcurrentBranches)}`);
  }
  parts.push(`threshold ${String(threshold)} => ${BAND_LABEL[band] ?? String(band)}`);
  return msg('criterion.concurrent-streams', { detail: parts.join('; ') });
}
