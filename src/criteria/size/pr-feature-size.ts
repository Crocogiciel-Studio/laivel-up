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
import type { PrSizeDistribution, PullRequestFacts } from '../../core/model/profile.js';
import { TIER, rankForTier } from './size-tiers.js';
import type { Tier } from './size-tiers.js';

/**
 * Places the subject on the Size axis: the *usual* size of the features they
 * ship with the assistant, not the biggest one ever. Two independent signal
 * families are read and reconciled conservatively:
 *
 *   A — histogram shape: the tier of the median pull request in the
 *       xs/s/m/l/xl distribution. An `l`-median is lifted to `L-XL` when `xl`
 *       is a routine part of the mix (share ≥ `xlShare`).
 *   B — raw magnitude: median files and median lines changed, each mapped to a
 *       tier by grid thresholds; the coarser of the two wins.
 *
 * The reading is `min` of the two families — raw magnitude can pull an inflated
 * bucket label down, it never pushes the level up. Tier → level is grid
 * calibration (`params`), so the same reading yields different levels under
 * different presets.
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
  filesS: 4,
  filesM: 12,
  filesL: 22,
  xlShare: 0.15,
  minSamples: 10,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Label of a single family's raw reading. */
const FAMILY_LABEL: Record<number, string> = { 0: 'none', 1: 'S', 2: 'M', 3: 'L', 4: 'XL' };
/** Label of the reconciled reading — the grid's top size cell is "L-XL", not "XL". */
const TIER_LABEL: Record<number, string> = { 0: 'none', 1: 'S', 2: 'M', 3: 'L', 4: 'L-XL' };

function bucketTotal(d: PrSizeDistribution): number {
  return d.xs + d.s + d.m + d.l + d.xl;
}

/** Family A: the tier of the median PR, walking the buckets in size order. */
function histogramTier(d: PrSizeDistribution): Tier | undefined {
  const total = bucketTotal(d);
  if (total <= 0) return undefined;

  const ordered: readonly (readonly [count: number, tier: Tier])[] = [
    [d.xs, TIER.s],
    [d.s, TIER.s],
    [d.m, TIER.m],
    [d.l, TIER.l],
    [d.xl, TIER.xl],
  ];
  const medianRank = Math.ceil(total / 2);
  let seen = 0;
  for (const [count, tier] of ordered) {
    seen += count;
    if (seen >= medianRank) return tier;
  }
  return TIER.xl;
}

/** Family B: coarser of the median-files and median-lines tiers. */
function magnitudeTier(pr: PullRequestFacts, p: Params): Tier | undefined {
  const byThreshold = (
    value: number | undefined,
    small: number,
    medium: number,
    large: number,
  ): Tier | undefined => {
    if (value === undefined) return undefined;
    if (value <= small) return TIER.s;
    if (value <= medium) return TIER.m;
    if (value <= large) return TIER.l;
    return TIER.xl;
  };

  const linesTier = byThreshold(pr.medianLinesChanged, p.linesS, p.linesM, p.linesL);
  const filesTier = byThreshold(pr.medianFilesChanged, p.filesS, p.filesM, p.filesL);
  const tiers = [linesTier, filesTier].filter((t): t is Tier => t !== undefined);
  return tiers.length > 0 ? (Math.max(...tiers) as Tier) : undefined;
}

/** Share of PRs sitting in the elected tier's bucket(s) — how decisive the read is. */
function tierShare(d: PrSizeDistribution, tier: number): number {
  const total = bucketTotal(d);
  if (total <= 0) return 0;
  const inTier =
    tier <= TIER.s
      ? d.xs + d.s
      : tier === TIER.m
        ? d.m
        : d.l + d.xl; // L and L-XL both look at the upper tail
  return inTier / total;
}

export const prFeatureSize: CriterionEvaluator = {
  id: 'pr-feature-size',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const pr = context.profile.vcsActivity?.pullRequests;
    if (pr === undefined) {
      return err(missingPiece(['vcsActivity'], 'no pull-request facts in the profile'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const dist = pr.sizeDistribution;

    const tierA = dist !== undefined ? histogramTier(dist) : undefined;
    const tierB = magnitudeTier(pr, p);

    if (tierA === undefined && tierB === undefined) {
      return err(
        missingPiece(['vcsActivity'], 'no PR size distribution and no median change size'),
      );
    }

    const families = [tierA, tierB].filter((t): t is Tier => t !== undefined);
    let tier = Math.min(...families);

    // An `l`-tier read becomes `L-XL` when extra-large work is routine.
    if (tier === TIER.l && dist !== undefined) {
      const total = bucketTotal(dist);
      if (total > 0 && dist.xl / total >= p.xlShare) tier = TIER.xl;
    }

    const rank = rankForTier(tier, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    const singleSource = families.length < 2;
    const agreement =
      tierA !== undefined && tierB !== undefined
        ? Math.max(0, 1 - 0.4 * Math.abs(tierA - tierB))
        : 1;
    const margin = dist !== undefined ? tierShare(dist, tier) : 0.6;
    const sampleCount = bucketTotal(dist ?? { xs: 0, s: 0, m: 0, l: 0, xl: 0 }) || (pr.total ?? 0);
    const sampleAdequacy = p.minSamples > 0 ? Math.min(1, sampleCount / p.minSamples) : 1;
    const familyCoverage = singleSource ? 0.7 : 1;
    const sufficiency = Math.min(familyCoverage, sampleAdequacy);

    return ok({
      levelId: level.id,
      rawValue: TIER_LABEL[tier] ?? String(tier),
      confidence: { agreement, margin, sufficiency, singleSource },
      evidence: describe(dist, pr, tierA, tierB, tier),
    });
  },
};

function describe(
  dist: PrSizeDistribution | undefined,
  pr: PullRequestFacts,
  tierA: Tier | undefined,
  tierB: Tier | undefined,
  tier: number,
): Message {
  const parts: string[] = [];
  if (dist !== undefined) {
    parts.push(
      `PR sizes xs${String(dist.xs)}/s${String(dist.s)}/m${String(dist.m)}/l${String(dist.l)}/xl${String(dist.xl)}`,
    );
  }
  if (pr.medianFilesChanged !== undefined || pr.medianLinesChanged !== undefined) {
    parts.push(
      `median ${String(pr.medianFilesChanged ?? '?')} files / ${String(pr.medianLinesChanged ?? '?')} lines`,
    );
  }
  const famA = tierA === undefined ? '—' : (FAMILY_LABEL[tierA] ?? String(tierA));
  const famB = tierB === undefined ? '—' : (FAMILY_LABEL[tierB] ?? String(tierB));
  const families = [tierA, tierB].filter((t): t is Tier => t !== undefined);
  const bumped = families.length > 0 && Math.min(...families) === TIER.l && tier === TIER.xl;
  const reconciled = `${TIER_LABEL[tier] ?? String(tier)}${bumped ? ' (xl share routine)' : ''}`;
  parts.push(`histogram ${famA}, magnitude ${famB} => ${reconciled}`);
  return msg('criterion.pr-feature-size', { detail: parts.join('; ') });
}
