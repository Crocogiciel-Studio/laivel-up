/**
 * The evaluation model — the only thing besides the dossier and the grille that
 * crosses the boundary outward. It carries the verdict, the per-axis and
 * per-criterion trace that justifies it, and a progression plan.
 */

export type LimitingFactor = 'agreement' | 'margin' | 'sufficiency' | 'none';

export type ReadingStatus = 'read' | 'unknown';

export interface CriterionReading {
  readonly criterionId: string;
  readonly axisId: string;
  readonly status: ReadingStatus;
  readonly role: 'level' | 'confidence' | 'cap';
  readonly levelId: string | undefined;
  readonly levelRank: number | undefined;
  readonly rawValue: number | string | undefined;
  readonly confidence: number;
  readonly limitingFactor: LimitingFactor;
  readonly evidence: string;
}

export interface AxisVerdict {
  readonly axisId: string;
  readonly levelId: string | undefined;
  readonly levelRank: number | undefined;
  readonly confidence: number;
  readonly limitingFactor: LimitingFactor;
  readonly readings: readonly CriterionReading[];
}

export interface GlobalVerdict {
  /** `undefined` => the evidence bar to rule was not met. */
  readonly levelId: string | undefined;
  readonly levelRank: number | undefined;
  readonly confidence: number;
  readonly bindingAxisId: string | undefined;
  readonly note: string;
}

export interface ProgressionPlan {
  readonly targetLevelId: string | undefined;
  readonly bindingAxisId: string | undefined;
  readonly actions: readonly string[];
}

export interface Resultat {
  readonly subjectId: string;
  readonly grilleId: string;
  readonly global: GlobalVerdict;
  readonly axes: readonly AxisVerdict[];
  readonly progression: ProgressionPlan;
  readonly generatedAt: string;
}
