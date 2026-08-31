import type { Profile, ProfileSection } from '../model/profile.js';
import type { Grid } from '../model/grid.js';
import type { Message } from '../model/evaluation.js';
import type { Result } from '../model/result.js';

/**
 * A criterion is a pluggable evaluator behind one generic interface. It declares
 * the profile sections it needs, returns `err(MissingPiece)` when they are
 * absent, and otherwise emits an ordinal level reading plus a three-part
 * confidence breakdown and one evidence sentence. It is deterministic and must
 * degrade without network or API key. One evaluator may be registered on
 * several axes.
 */

export interface CriterionContext {
  readonly profile: Profile;
  readonly grid: Grid;
  readonly axisId: string;
  /** The bundle entry's calibration knobs, straight from the grid. */
  readonly params: Readonly<Record<string, number>>;
}

/** Weakest-of-three confidence. `agreement` is ignored when `singleSource`. */
export interface ConfidenceBreakdown {
  readonly agreement: number;
  readonly margin: number;
  readonly sufficiency: number;
  readonly singleSource: boolean;
}

export interface CriterionOutput {
  readonly levelId: string;
  readonly rawValue: number | string;
  readonly confidence: ConfidenceBreakdown;
  /** One evidence sentence, as a translatable descriptor (`i18n/` catalogues). */
  readonly evidence: Message;
}

export interface MissingPiece {
  readonly kind: 'missing-piece';
  readonly needed: readonly ProfileSection[];
  readonly detail: string;
}

export interface CriterionEvaluator {
  readonly id: string;
  readonly needs: readonly ProfileSection[];
  /**
   * In-code defaults for this criterion's calibration knobs — the ones a grid
   * preset overrides through a bundle entry's `params` (`hexagon.md`
   * #calibration-in-the-grid). Surfaced so a grid editor can pre-fill a
   * criterion card with sensible values. Most evaluators also merge
   * `{ ...paramDefaults, ...context.params }` in `evaluate()`;
   * `declaratif-contradiction` is the exception — it reads `context.params`
   * raw, so a band the preset does not calibrate makes it abstain rather than
   * fall back to a default rank.
   */
  readonly paramDefaults: Readonly<Record<string, number>>;
  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece>;
}

export function missingPiece(
  needed: readonly ProfileSection[],
  detail: string,
): MissingPiece {
  return { kind: 'missing-piece', needed, detail };
}
