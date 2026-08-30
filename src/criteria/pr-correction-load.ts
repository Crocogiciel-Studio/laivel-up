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
import { BAND_LABEL, bandMargin, rankForBand } from './shared/intervention-bands.js';

/**
 * Places the subject on the Intervention axis: how much correction the human
 * applies to the assistant's pull requests, and how much of it lands after
 * the PR is already open. Two independent signal families are read:
 *
 *   A — after-the-fact correction: the median number of correction commits
 *       pushed after a PR opens. Decides the band whenever present.
 *   B — autonomy: the share of PRs merged without any human edit. When A is
 *       present, B only corroborates — a high (optimistic) B reading can
 *       never lift the band A decided, it only affects `agreement`. When A is
 *       absent, B decides alone (at reduced `sufficiency`), since the grid
 *       still needs a reading from whatever single signal is available.
 *
 * Band 3 (Silver/Gold, "never, once framed") is out of scope: no public
 * sample profile reaches it, so there is nothing to calibrate against yet.
 * Band → level is grid calibration (`params`): band 2 maps to the *top* of
 * its cell (Copper), per the axis's band → rank = high-of-band convention.
 */

const PARAM_DEFAULTS = {
  correctionsAfterMost: 3,
  // Below 2 so a whole-number median of 2 — the canonical "after some" profile — sits inside the
  // band rather than exactly on its lower edge, where the margin would collapse to the floor.
  correctionsAfterSome: 1.5,
  ratioAfterSome: 0.15,
  ratioKeyStages: 0.4,
  rankAfterMost: 1,
  rankAfterSome: 2,
  rankKeyStages: 4,
  // Below this many PRs the reading is less trustworthy; folded into `sufficiency`.
  minSamples: 10,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

function bandFromCorrections(value: number, p: Params): number {
  if (value >= p.correctionsAfterMost) return 0;
  if (value >= p.correctionsAfterSome) return 1;
  return 2;
}

function bandFromRatio(value: number, p: Params): number {
  if (value < p.ratioAfterSome) return 0;
  if (value < p.ratioKeyStages) return 1;
  return 2;
}

const marginFromCorrections = (value: number, band: number, p: Params): number =>
  bandMargin(value, band, p.correctionsAfterSome, p.correctionsAfterMost, true);

const marginFromRatio = (value: number, band: number, p: Params): number =>
  bandMargin(value, band, p.ratioAfterSome, p.ratioKeyStages, false);

export const prCorrectionLoad: CriterionEvaluator = {
  id: 'pr-correction-load',
  needs: ['vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const pr = context.profile.vcsActivity?.pullRequests;
    if (pr === undefined) {
      return err(missingPiece(['vcsActivity'], 'no pull-request facts in the profile'));
    }
    if (pr.total === 0) {
      return err(missingPiece(['vcsActivity'], 'no pull requests shipped — nothing to read'));
    }

    const correctionCommits = pr.medianCorrectionCommitsAfterOpen;
    const noEditRatio = pr.mergedWithoutHumanEditRatio;
    const p: Params = { ...PARAM_DEFAULTS, ...context.params };

    const bandA = correctionCommits !== undefined ? bandFromCorrections(correctionCommits, p) : undefined;
    const bandB = noEditRatio !== undefined ? bandFromRatio(noEditRatio, p) : undefined;

    let band: number;
    let margin: number;
    if (correctionCommits !== undefined && bandA !== undefined) {
      band = bandA;
      margin = marginFromCorrections(correctionCommits, bandA, p);
    } else if (noEditRatio !== undefined && bandB !== undefined) {
      band = bandB;
      margin = marginFromRatio(noEditRatio, bandB, p);
    } else {
      return err(
        missingPiece(
          ['vcsActivity'],
          'no median correction commits and no merged-without-edit ratio',
        ),
      );
    }

    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    const singleSource = bandA === undefined || bandB === undefined;
    const agreement =
      bandA !== undefined && bandB !== undefined
        ? Math.max(0, 1 - 0.4 * Math.abs(bandA - bandB))
        : 1;
    // A reading over few PRs is worth less than the same reading over many.
    const sampleAdequacy =
      pr.total !== undefined ? Math.min(1, pr.total / Math.max(p.minSamples, 1)) : 1;
    const sufficiency = Math.min(singleSource ? 0.7 : 1, sampleAdequacy);

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: { agreement, margin, sufficiency, singleSource },
      evidence: describe(correctionCommits, noEditRatio, bandA, bandB, band),
    });
  },
};

function describe(
  correctionCommits: number | undefined,
  noEditRatio: number | undefined,
  bandA: number | undefined,
  bandB: number | undefined,
  band: number,
): string {
  const parts: string[] = [];
  if (correctionCommits !== undefined) {
    const unit = correctionCommits === 1 ? 'commit' : 'commits';
    parts.push(`median ${String(correctionCommits)} correction ${unit} after open`);
  }
  if (noEditRatio !== undefined) {
    parts.push(`${String(Math.round(noEditRatio * 100))}% merged without human edit`);
  }
  const famA = bandA === undefined ? '—' : (BAND_LABEL[bandA] ?? String(bandA));
  const famB = bandB === undefined ? '—' : (BAND_LABEL[bandB] ?? String(bandB));
  parts.push(`correction ${famA}, autonomy ${famB} => ${BAND_LABEL[band] ?? String(band)}`);
  return `correction load: ${parts.join('; ')}`;
}
