import type { CriterionEvaluator } from './criterion-evaluator.js';

/**
 * The set of criterion evaluators the engine can draw on. A grille references
 * criteria by id; the catalogue resolves them. An id with no evaluator yields an
 * "unknown" reading rather than an error.
 */
export interface EvaluatorCatalogue {
  get(criterionId: string): CriterionEvaluator | undefined;
  has(criterionId: string): boolean;
  ids(): readonly string[];
}
