import type { Evaluation, Result } from 'laivel-up';
import { ok, err } from 'laivel-up';
import { parseGrid, parseProfile, evaluateWithBuiltins } from 'laivel-up/compose';

export interface EngineError {
  readonly message: string;
  readonly issues: readonly string[];
}

export interface RunInput {
  readonly minRuledAxes?: number;
}

export type RunEvaluation = (
  gridBody: unknown,
  profileBody: unknown,
  input: RunInput,
) => Result<Evaluation, EngineError>;

/**
 * Validate a grid body and a profile body, then run the engine over them with
 * the built-in criterion catalogue. Both bodies are the JSON the CLI adapters
 * already accept -- a grid preset, a domain profile.
 */
export const runEvaluation: RunEvaluation = (gridBody, profileBody, input) => {
  const grid = parseGrid(gridBody);
  if (!grid.ok) {
    return err({ message: grid.error.message, issues: grid.error.issues });
  }
  const profile = parseProfile(profileBody);
  if (!profile.ok) {
    return err({ message: profile.error.message, issues: profile.error.issues });
  }
  const options = input.minRuledAxes === undefined ? {} : { minRuledAxes: input.minRuledAxes };
  return ok(evaluateWithBuiltins(profile.value, grid.value, options));
};
