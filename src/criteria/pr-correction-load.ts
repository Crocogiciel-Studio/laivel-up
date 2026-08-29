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
 * Places the subject on the Intervention axis: how much correction the human
 * applies to the assistant's pull requests, and how much of it lands after
 * the PR is already open. Two independent signal families are read:
 *
 *   A — reprise après coup: the median number of correction commits pushed
 *       after a PR opens. This alone decides the band.
 *   B — autonomy: the share of PRs merged without any human edit. It only
 *       corroborates — a high (optimistic) B reading can never lift the band
 *       A decided, it only affects `agreement`.
 *
 * When only one family is present, that family's own band decides — the
 * missing family costs `sufficiency`, not the reading itself. Band 3
 * (Silver/Gold, "never, once framed") is out of scope: no public sample
 * profile reaches it, so there is nothing to calibrate against yet. Band →
 * level is grid calibration (`params`): band 2 maps to the *top* of its cell
 * (Copper), per the axis's band → rank = high-of-band convention.
 */

const PARAM_DEFAULTS = {
  correctionsAfterMost: 3,
  correctionsAfterSome: 2,
  ratioAfterSome: 0.15,
  ratioKeyStages: 0.4,
  rankAfterMost: 1,
  rankAfterSome: 2,
  rankKeyStages: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Band index, low → high: 0 after-the-fact on most, 2 at key stages only. */
const BAND_LABEL: Record<number, string> = { 0: 'after-most', 1: 'after-some', 2: 'key-stages' };

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

/** Distance from `value` to the boundary it crossed, normalized to `[0, 1]`. */
function marginFromCorrections(value: number, band: number, p: Params): number {
  if (band === 0) {
    const span = Math.max(p.correctionsAfterMost, 1);
    return Math.min(1, (value - p.correctionsAfterMost) / span);
  }
  if (band === 2) {
    const span = Math.max(p.correctionsAfterSome, 1);
    return Math.min(1, (p.correctionsAfterSome - value) / span);
  }
  const width = Math.max(p.correctionsAfterMost - p.correctionsAfterSome, 1);
  const distanceToNearestEdge = Math.min(
    value - p.correctionsAfterSome,
    p.correctionsAfterMost - value,
  );
  return Math.min(1, Math.max(0, distanceToNearestEdge / (width / 2)));
}

/** Mirror of `marginFromCorrections` for the ratio family — lower is band 0 here. */
function marginFromRatio(value: number, band: number, p: Params): number {
  if (band === 0) {
    const span = Math.max(p.ratioAfterSome, 0.01);
    return Math.min(1, (p.ratioAfterSome - value) / span);
  }
  if (band === 2) {
    const span = Math.max(1 - p.ratioKeyStages, 0.01);
    return Math.min(1, (value - p.ratioKeyStages) / span);
  }
  const width = Math.max(p.ratioKeyStages - p.ratioAfterSome, 0.01);
  const distanceToNearestEdge = Math.min(value - p.ratioAfterSome, p.ratioKeyStages - value);
  return Math.min(1, Math.max(0, distanceToNearestEdge / (width / 2)));
}

function describe(
  correctionCommits: number | undefined,
  noEditRatio: number | undefined,
  bandA: number | undefined,
  bandB: number | undefined,
  band: number,
): string {
  const parts: string[] = [];
  parts.push(
    `median ${correctionCommits === undefined ? '?' : String(correctionCommits)} correction commits after open`,
  );
  parts.push(
    `${noEditRatio === undefined ? '?' : String(Math.round(noEditRatio * 100))}% merged without human edit`,
  );
  const famA = bandA === undefined ? '—' : (BAND_LABEL[bandA] ?? String(bandA));
  const famB = bandB === undefined ? '—' : (BAND_LABEL[bandB] ?? String(bandB));
  parts.push(`reprise ${famA}, autonomie ${famB} => ${BAND_LABEL[band] ?? String(band)}`);
  return `correction load: ${parts.join('; ')}`;
}

export const prCorrectionLoad: CriterionEvaluator = {
  id: 'pr-correction-load',
  needs: ['vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const pr = context.profile.vcsActivity?.pullRequests;
    if (pr === undefined) {
      return err(missingPiece(['vcsActivity'], 'no pull-request facts in the profile'));
    }

    const correctionCommits = pr.medianCorrectionCommitsAfterOpen;
    const noEditRatio = pr.mergedWithoutHumanEditRatio;
    if (correctionCommits === undefined && noEditRatio === undefined) {
      return err(
        missingPiece(
          ['vcsActivity'],
          'no median correction commits and no merged-without-edit ratio',
        ),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };

    const bandA = correctionCommits !== undefined ? bandFromCorrections(correctionCommits, p) : undefined;
    const bandB = noEditRatio !== undefined ? bandFromRatio(noEditRatio, p) : undefined;

    // Family A decides whenever present; family B only fills in when A is missing.
    const band = bandA ?? bandB;
    if (band === undefined) {
      return err(missingPiece(['vcsActivity'], 'neither signal family produced a band'));
    }

    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    const singleSource = bandA === undefined || bandB === undefined;
    const agreement =
      bandA !== undefined && bandB !== undefined ? Math.max(0, 1 - 0.4 * Math.abs(bandA - bandB)) : 1;
    const sufficiency = singleSource ? 0.7 : 1;

    let margin: number;
    let rawValue: number;
    if (correctionCommits !== undefined) {
      margin = marginFromCorrections(correctionCommits, band, p);
      rawValue = correctionCommits;
    } else if (noEditRatio !== undefined) {
      margin = marginFromRatio(noEditRatio, band, p);
      rawValue = noEditRatio;
    } else {
      return err(missingPiece(['vcsActivity'], 'neither signal family produced a band'));
    }

    return ok({
      levelId: level.id,
      rawValue,
      confidence: { agreement, margin, sufficiency, singleSource },
      evidence: describe(correctionCommits, noEditRatio, bandA, bandB, band),
    });
  },
};
