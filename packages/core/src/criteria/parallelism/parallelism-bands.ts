/**
 * The concurrent-branch band ladder shared by the two Parallelism-axis criteria.
 * `concurrent-streams` places the subject from the median; `branch-burstiness`
 * reads the same ladder and drops a band when the peak towers over the median.
 * Both must agree on where the bands sit, so the ladder and its band → rank map
 * live here rather than in either file.
 */

/** Band index, low → high. */
export const BAND_LABEL: Record<number, string> = {
  0: 'none',
  1: 'single-stream',
  2: 'multi-stream',
};

/** A band reading sitting anywhere inside its band still carries some confidence. */
export const MIN_MARGIN = 0.15;

/** The knobs a grid supplies to read and place a band. */
export interface ParallelismBandParams {
  readonly multiStreamThreshold: number;
  readonly rankNone: number;
  readonly rankSingleStream: number;
  readonly rankMultiStream: number;
}

export function bandFromMedian(
  median: number,
  p: Pick<ParallelismBandParams, 'multiStreamThreshold'>,
): number {
  if (median <= 0) return 0;
  if (median < p.multiStreamThreshold) return 1;
  return 2;
}

export function rankForBand(
  band: number,
  p: Omit<ParallelismBandParams, 'multiStreamThreshold'>,
): number {
  switch (band) {
    case 0:
      return p.rankNone;
    case 1:
      return p.rankSingleStream;
    default:
      return p.rankMultiStream;
  }
}
