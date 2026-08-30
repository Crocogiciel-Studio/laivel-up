/**
 * Shape of the JSON emitted by `src/adapters/outbound/json-evaluation.ts` in the
 * core repo, kept in step with `docs/evaluation.schema.json` (#21).
 *
 * TODO(#42): `evidence` is still a plain sentence and stays English until the
 * criteria emit descriptors too. `note` and `actions[]` are already
 * `{ key, params }` and resolved in view-model.ts against the bundled catalogue.
 */

// `JSON.stringify` drops `undefined` properties, so a field the model types as
// `X | undefined` is simply absent from the JSON. Model those as optional here;
// a hand-written file that puts an explicit `null` is tolerated too.
type Absent<T> = T | null | undefined;
type Factor = 'agreement' | 'margin' | 'sufficiency' | 'none';

/** A translatable sentence emitted by the core: a catalogue key plus its fill values. */
export interface Message {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

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
  readonly note: Message;
}

export interface ProgressionPlan {
  readonly targetLevelId?: Absent<string>;
  readonly bindingAxisId?: Absent<string>;
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

export type ParseResult =
  | { readonly ok: true; readonly value: Evaluation }
  | { readonly ok: false; readonly error: string };

/**
 * Where the viewer tries to auto-load an evaluation from on startup: `?src=<url>`
 * when given, else `evaluation.json` next to the page (what `pnpm viz` writes to
 * the dev server's public dir). On a bare `file://` open the fetch just fails and
 * the drop zone stays — that path is drag-and-drop only.
 */
export function evaluationSource(search: string): string {
  return new URLSearchParams(search).get('src') ?? 'evaluation.json';
}

/**
 * The `pnpm viz` catalogue index — a JSON array of profile names — or `null`.
 * A dev server with no such file answers the probe with its HTML shell, which
 * must not be mistaken for a catalogue.
 */
export function parseNameList(text: string | null): string[] | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every((n) => typeof n === 'string')
      ? (value as string[])
      : null;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Structural guard — enough that the render path can dereference `global.*`,
 * `axes[].readings[]` and `progression.actions` without a `TypeError`. It is not
 * full validation against `docs/evaluation.schema.json`; that is still not done.
 */
export function parseEvaluation(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { ok: false, error: `not valid JSON: ${(cause as Error).message}` };
  }
  if (!isObject(raw)) {
    return { ok: false, error: 'expected a JSON object' };
  }
  for (const key of ['subjectId', 'gridId', 'global', 'axes', 'progression'] as const) {
    if (!(key in raw)) {
      return { ok: false, error: `missing "${key}" — is this a laivel-up evaluation?` };
    }
  }
  if (!isObject(raw['global'])) {
    return { ok: false, error: '"global" must be an object' };
  }
  if (!Array.isArray(raw['axes'])) {
    return { ok: false, error: '"axes" must be an array' };
  }
  for (const [i, axis] of raw['axes'].entries()) {
    if (!isObject(axis) || !Array.isArray(axis['readings'])) {
      return { ok: false, error: `"axes[${String(i)}].readings" must be an array` };
    }
  }
  if (!isObject(raw['progression']) || !Array.isArray(raw['progression']['actions'])) {
    return { ok: false, error: '"progression.actions" must be an array' };
  }
  return { ok: true, value: raw as unknown as Evaluation };
}
