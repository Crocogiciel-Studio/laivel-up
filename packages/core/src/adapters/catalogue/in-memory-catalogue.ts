import type { CriterionEvaluator } from '../../core/ports/criterion-evaluator.js';
import type { EvaluatorCatalogue } from '../../core/ports/evaluator-catalogue.js';

/** A catalogue backed by a fixed list of coded evaluators (the hackathon shape). */
export function inMemoryCatalogue(
  evaluators: readonly CriterionEvaluator[],
): EvaluatorCatalogue {
  const byId = new Map<string, CriterionEvaluator>();
  for (const evaluator of evaluators) {
    if (byId.has(evaluator.id)) {
      throw new Error(`duplicate criterion id in catalogue: "${evaluator.id}"`);
    }
    byId.set(evaluator.id, evaluator);
  }

  return {
    get: (criterionId) => byId.get(criterionId),
    has: (criterionId) => byId.has(criterionId),
    ids: () => [...byId.keys()],
  };
}
