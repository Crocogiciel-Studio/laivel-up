/**
 * Composition root shared by every delivery layer (the CLI, the studio server).
 * It is the one place allowed to wire the engine to the built-in catalogue; the
 * core stays free of that choice.
 */
import type { EvaluateOptions } from './core/index.js';
import { evaluate } from './core/index.js';
import type { Evaluation } from './core/model/evaluation.js';
import type { Grid } from './core/model/grid.js';
import type { Profile } from './core/model/profile.js';
import { inMemoryCatalogue } from './adapters/catalogue/in-memory-catalogue.js';
import { builtInEvaluators } from './criteria/index.js';

export { parseGrid } from './adapters/inbound/json-grid.js';
export { parseProfile } from './adapters/inbound/domain-profile.js';
export { renderEvaluationJson } from './adapters/outbound/json-evaluation.js';
export { builtInEvaluators } from './criteria/index.js';

/** Run the engine over a profile and grid with the coded criterion catalogue. */
export function evaluateWithBuiltins(
  profile: Profile,
  grid: Grid,
  options: EvaluateOptions = {},
): Evaluation {
  return evaluate(profile, grid, inMemoryCatalogue(builtInEvaluators), options);
}
