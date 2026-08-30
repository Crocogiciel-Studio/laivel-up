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
import type { RawPullRequest } from '../core/model/profile.js';
import { TIER, rankForTier } from './shared/size-tiers.js';
import type { Tier } from './shared/size-tiers.js';

/**
 * Size-axis cross-check with role `confidence`. Where `pr-feature-size` trusts
 * the pre-aggregated `size_distribution` histogram, this one recounts the size
 * distribution from the *raw* pull requests in `pull-requests.json` — an
 * independent source. Each PR is bucketed by `additions + deletions` against the
 * same S/M/L/XL line thresholds (grid `params`), and the tier of the median PR
 * is emitted as a level, using the tier → rank map `pr-feature-size` carries.
 *
 * `applyContradictions` in `src/core/engine/bundle.ts` only lets it bite when
 * that tier differs from the one the Size axis elected, and then only pulls the
 * axis confidence down — a corroborating read never raises the level
 * (`criterion-contract.md` #declaratif-never-raises). Single-source: `agreement`
 * is inert and flagged.
 */

const PARAM_DEFAULTS = {
  rankNone: 0,
  rankS: 1,
  rankM: 2,
  rankL: 3,
  rankLxl: 4,
  linesS: 120,
  linesM: 400,
  linesL: 900,
  minSamples: 10,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

const TIER_LABEL: Record<Tier, string> = { 0: 'none', 1: 'S', 2: 'M', 3: 'L', 4: 'XL' };

/** Bucket one PR by its total churn against the grid's line thresholds. */
function bucketOf(pr: RawPullRequest, p: Params): Tier {
  const lines = (pr.additions ?? 0) + (pr.deletions ?? 0);
  if (lines <= p.linesS) return TIER.s;
  if (lines <= p.linesM) return TIER.m;
  if (lines <= p.linesL) return TIER.l;
  return TIER.xl;
}

export const prRawDistribution: CriterionEvaluator = {
  id: 'pr-raw-distribution',
  needs: ['vcsActivity'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const raw = context.profile.vcsActivity?.rawPullRequests;
    if (raw === undefined || raw.length === 0) {
      return err(missingPiece(['vcsActivity'], 'no raw pull requests'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };

    const sized = raw
      .map((pr) => ({
        lines: (pr.additions ?? 0) + (pr.deletions ?? 0),
        tier: bucketOf(pr, p),
      }))
      .sort((a, b) => a.lines - b.lines);

    // Median PR, same lower-middle convention as `pr-feature-size`'s histogram.
    const medianTier = sized[Math.ceil(sized.length / 2) - 1]?.tier ?? TIER.s;

    const rank = rankForTier(medianTier, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    const n = sized.length;
    const inTier = sized.filter((s) => s.tier === medianTier).length;
    const margin = inTier / n;
    const sufficiency = p.minSamples > 0 ? Math.min(1, n / p.minSamples) : 1;

    return ok({
      levelId: level.id,
      rawValue: TIER_LABEL[medianTier],
      confidence: { agreement: 1, margin, sufficiency, singleSource: true },
      evidence: describe(sized, medianTier),
    });
  },
};

function describe(
  sized: readonly { readonly lines: number; readonly tier: Tier }[],
  medianTier: Tier,
): string {
  const counts: Record<Tier, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of sized) counts[s.tier] += 1;
  return (
    `raw PR sizes S${String(counts[TIER.s])}/M${String(counts[TIER.m])}/` +
    `L${String(counts[TIER.l])}/XL${String(counts[TIER.xl])} over ${String(sized.length)} PRs ` +
    `=> median tier ${TIER_LABEL[medianTier]}`
  );
}
