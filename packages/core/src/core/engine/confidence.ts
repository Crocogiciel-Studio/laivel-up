import type { ConfidenceBreakdown } from '../ports/criterion-evaluator.js';
import type { LimitingFactor } from '../model/evaluation.js';

/**
 * Confidence is the weakest of three checks, not their product — a product
 * collapses as criteria are added. The fold also names which check is the
 * limiting one so the report can say why it is unsure.
 */
export interface FoldedConfidence {
  readonly value: number;
  readonly limitingFactor: LimitingFactor;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function foldConfidence(breakdown: ConfidenceBreakdown): FoldedConfidence {
  const checks: readonly (readonly [LimitingFactor, number])[] = breakdown.singleSource
    ? [
        ['margin', clamp01(breakdown.margin)],
        ['sufficiency', clamp01(breakdown.sufficiency)],
      ]
    : [
        ['agreement', clamp01(breakdown.agreement)],
        ['margin', clamp01(breakdown.margin)],
        ['sufficiency', clamp01(breakdown.sufficiency)],
      ];

  let value = 1;
  let limitingFactor: LimitingFactor = 'none';
  for (const [factor, score] of checks) {
    if (score < value) {
      value = score;
      limitingFactor = factor;
    }
  }
  return { value, limitingFactor };
}

/** Combine independent confidence values as the weakest link, tagging the loser. */
export function weakestOf(
  parts: readonly (readonly [LimitingFactor, number])[],
): FoldedConfidence {
  let value = 1;
  let limitingFactor: LimitingFactor = 'none';
  for (const [factor, score] of parts) {
    const s = clamp01(score);
    if (s < value) {
      value = s;
      limitingFactor = factor;
    }
  }
  return { value, limitingFactor };
}
