/**
 * Shape of the JSON emitted by `src/adapters/outbound/json-evaluation.ts` in the
 * core repo, kept in step with `docs/evaluation.schema.json` (#21).
 *
 * TODO(#42): `evidence` / `note` / `actions` become `{ key, params }` descriptors
 * resolved through the shared i18n catalogue — this file and view-model.ts change
 * with it.
 */

// `JSON.stringify` drops `undefined` properties, so a field the model types as
// `X | undefined` is simply absent from the JSON. Model those as optional here;
// a hand-written file that puts an explicit `null` is tolerated too.
type Absent<T> = T | null | undefined;
type Factor = 'agreement' | 'margin' | 'sufficiency' | 'none';

export interface CriterionReading {
  readonly criterionId: string;
  readonly axisId: string;
  readonly status: 'read' | 'unknown';
  readonly role: 'level' | 'confidence' | 'cap';
  readonly levelId?: Absent<string>;
  readonly levelRank?: Absent<number>;
  readonly rawValue?: Absent<number | string>;
  readonly confidence: number;
  readonly limitingFactor: Factor;
  readonly evidence: string;
}

export interface AxisVerdict {
  readonly axisId: string;
  readonly levelId?: Absent<string>;
  readonly levelRank?: Absent<number>;
  readonly confidence: number;
  readonly limitingFactor: Factor;
  readonly readings: readonly CriterionReading[];
}

export interface GlobalVerdict {
  readonly levelId?: Absent<string>;
  readonly levelRank?: Absent<number>;
  readonly confidence: number;
  readonly bindingAxisId?: Absent<string>;
  readonly note: string;
}

export interface ProgressionPlan {
  readonly targetLevelId?: Absent<string>;
  readonly bindingAxisId?: Absent<string>;
  readonly actions: readonly string[];
}

export interface Evaluation {
  readonly subjectId: string;
  readonly gridId: string;
  readonly global: GlobalVerdict;
  readonly axes: readonly AxisVerdict[];
  readonly progression: ProgressionPlan;
  readonly generatedAt: string;
}

export type ParseResult =
  | { readonly ok: true; readonly value: Evaluation }
  | { readonly ok: false; readonly error: string };

/**
 * Minimal structural guard for the scaffold — enough to reject a file that is not
 * an evaluation at all. Full JSON-Schema validation is #41 viewer work (needs #21).
 */
export function parseEvaluation(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { ok: false, error: `not valid JSON: ${(cause as Error).message}` };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'expected a JSON object' };
  }
  const obj = raw as Record<string, unknown>;
  for (const key of ['subjectId', 'gridId', 'global', 'axes', 'progression'] as const) {
    if (!(key in obj)) {
      return { ok: false, error: `missing "${key}" — is this a laivel-up evaluation?` };
    }
  }
  if (!Array.isArray(obj['axes'])) {
    return { ok: false, error: '"axes" must be an array' };
  }
  return { ok: true, value: raw as Evaluation };
}
