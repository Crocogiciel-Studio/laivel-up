/**
 * The ordinal size ladder shared by the two Size-axis criteria. `pr-feature-size`
 * reads it from the pre-aggregated histogram, `pr-raw-distribution` recounts it
 * from the raw pull requests — both must bucket and rank identically, so the
 * ladder and its tier → rank map live here rather than in either file.
 */

/** Ordinal size tiers. `0` means "no features shipped". */
export const TIER = { none: 0, s: 1, m: 2, l: 3, xl: 4 } as const;
export type Tier = (typeof TIER)[keyof typeof TIER];

/** The rank knobs a grid supplies to place a tier on its levels. */
export interface TierRankParams {
  readonly rankNone: number;
  readonly rankS: number;
  readonly rankM: number;
  readonly rankL: number;
  readonly rankLxl: number;
}

export function rankForTier(tier: number, p: TierRankParams): number {
  switch (tier) {
    case TIER.none:
      return p.rankNone;
    case TIER.s:
      return p.rankS;
    case TIER.m:
      return p.rankM;
    case TIER.l:
      return p.rankL;
    default:
      return p.rankLxl;
  }
}
