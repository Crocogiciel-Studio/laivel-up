/**
 * The threshold-band arithmetic shared by the Intervention-axis `level`-family
 * criteria — `pr-correction-load`, `review-comment-load` and `ci-iteration-load`.
 * Each reads a different signal (correction commits, review comments, CI runs)
 * but lands it on the same three bands with the same margin-to-boundary model,
 * so the ladder, labels and arithmetic live here rather than in three copies.
 */

/** Band index, low → high: 0 after-the-fact on most, 2 at key stages only. */
export const BAND_LABEL: Record<number, string> = {
  0: 'after-most',
  1: 'after-some',
  2: 'key-stages',
};

/** A reading sitting anywhere inside its band still carries some confidence. */
export const MIN_MARGIN = 0.15;

/** The band → rank knobs a grid supplies. */
export interface InterventionBandRankParams {
  readonly rankAfterMost: number;
  readonly rankAfterSome: number;
  readonly rankKeyStages: number;
}

export function rankForBand(band: number, p: InterventionBandRankParams): number {
  switch (band) {
    case 0:
      return p.rankAfterMost;
    case 1:
      return p.rankAfterSome;
    default:
      return p.rankKeyStages;
  }
}

/**
 * Distance-to-boundary, normalized to `[MIN_MARGIN, 1]`. `span` is what a full
 * unit of confidence is worth; a reading on the boundary is floored rather than
 * zeroed, so an achievable integer sitting on a band edge still carries some
 * evidence.
 */
export function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/**
 * How far `value` sits from the boundary its band was read against. Bands 0 and
 * 2 are open-ended — distance from their single boundary. Band 1 is bounded both
 * sides — distance from the *nearer* boundary over half the band's width, so the
 * margin peaks at the band's centre, not at either edge. `lo < hi` are the two
 * thresholds; `band0IsHigh` says which side band 0 lies on (true when a larger
 * signal means more after-the-fact rework, as for the corrections, comments and
 * CI-run families).
 */
export function bandMargin(
  value: number,
  band: number,
  lo: number,
  hi: number,
  band0IsHigh: boolean,
): number {
  if (band === 0) return band0IsHigh ? clampMargin(value - hi, hi) : clampMargin(lo - value, lo);
  if (band === 2) return band0IsHigh ? clampMargin(lo - value, lo) : clampMargin(value - hi, 1 - hi);
  return clampMargin(Math.min(value - lo, hi - value), (hi - lo) / 2);
}
