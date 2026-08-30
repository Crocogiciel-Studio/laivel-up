/**
 * Shape of the JSON emitted by `src/adapters/outbound/json-evaluation.ts` in the
 * core repo, as of today. Kept here by hand for the scaffold.
 *
 * TODO(#21): regenerate this from `docs/evaluation.schema.json` once that lands.
 * TODO(#42): `evidence` / `note` / `actions` become `{ key, params }` descriptors
 * resolved through the shared i18n catalogue — this file changes with it.
 */

export interface CriterionReading {
  readonly criterionId: string;
  readonly axisId: string;
  readonly status: 'read' | 'unknown';
  readonly role: 'level' | 'confidence' | 'cap';
  readonly levelId: string | null;
  readonly levelRank: number | null;
  readonly rawValue: number | string | null;
  readonly confidence: number;
  readonly limitingFactor: 'agreement' | 'margin' | 'sufficiency' | 'none';
  readonly evidence: string;
}

export interface AxisVerdict {
  readonly axisId: string;
  readonly levelId: string | null;
  readonly levelRank: number | null;
  readonly confidence: number;
  readonly limitingFactor: 'agreement' | 'margin' | 'sufficiency' | 'none';
  readonly readings: readonly CriterionReading[];
}

export interface GlobalVerdict {
  readonly levelId: string | null;
  readonly levelRank: number | null;
  readonly confidence: number;
  readonly bindingAxisId: string | null;
  readonly note: string;
}

export interface ProgressionPlan {
  readonly targetLevelId: string | null;
  readonly bindingAxisId: string | null;
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
