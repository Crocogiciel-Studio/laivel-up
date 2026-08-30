/**
 * The evaluation model — the only thing besides the profile and the grid that
 * crosses the boundary outward. It carries the verdict, the per-axis and
 * per-criterion trace that justifies it, and a progression plan.
 */

/**
 * A translatable sentence: a stable `key` plus the values that fill its
 * template. The core emits these and names no language; a consumer (an outbound
 * adapter, the viewer) resolves them against a catalogue it owns.
 */
export interface Message {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export function msg(
  key: string,
  params?: Readonly<Record<string, string | number>>,
): Message {
  return params === undefined ? { key } : { key, params };
}

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
  readonly note: Message;
}

export interface ProgressionPlan {
  readonly targetLevelId: string | undefined;
  readonly bindingAxisId: string | undefined;
  readonly actions: readonly Message[];
}

export interface Evaluation {
  readonly subjectId: string;
  readonly gridId: string;
  readonly global: GlobalVerdict;
  readonly axes: readonly AxisVerdict[];
  readonly progression: ProgressionPlan;
  readonly generatedAt: string;
}
