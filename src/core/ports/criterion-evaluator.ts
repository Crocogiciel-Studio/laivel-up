import type { Dossier, DossierSection } from '../model/dossier.js';
import type { Grille } from '../model/grille.js';
import type { Result } from '../model/result.js';

/**
 * A criterion is a pluggable evaluator behind one generic interface. It declares
 * the dossier sections it needs, returns `err(MissingPiece)` when they are
 * absent, and otherwise emits an ordinal level reading plus a three-part
 * confidence breakdown and one evidence sentence. It is deterministic and must
 * degrade without network or API key. One evaluator may be registered on
 * several axes.
 */

export interface CriterionContext {
  readonly dossier: Dossier;
  readonly grille: Grille;
  readonly axisId: string;
  /** The faisceau entry's calibration knobs, straight from the grille. */
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
  readonly evidence: string;
}

export interface MissingPiece {
  readonly kind: 'missing-piece';
  readonly needed: readonly DossierSection[];
  readonly detail: string;
}

export interface CriterionEvaluator {
  readonly id: string;
  readonly needs: readonly DossierSection[];
  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece>;
}

export function missingPiece(
  needed: readonly DossierSection[],
  detail: string,
): MissingPiece {
  return { kind: 'missing-piece', needed, detail };
}
