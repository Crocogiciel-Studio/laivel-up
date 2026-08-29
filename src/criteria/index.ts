import type { CriterionEvaluator } from '../core/ports/criterion-evaluator.js';
import { toolingContextDepth } from './tooling-context-depth.js';
import { prFeatureSize } from './pr-feature-size.js';

/** Every coded criterion the engine ships with. A grid picks from these by id. */
export const builtInEvaluators: readonly CriterionEvaluator[] = [
  toolingContextDepth,
  prFeatureSize,
];

export { toolingContextDepth, prFeatureSize };
