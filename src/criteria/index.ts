import type { CriterionEvaluator } from '../core/ports/criterion-evaluator.js';
import { toolingContextDepth } from './tooling-context-depth.js';
import { behaviorArtifactDensity } from './behavior-artifact-density.js';
import { prFeatureSize } from './pr-feature-size.js';
import { prCorrectionLoad } from './pr-correction-load.js';
import { concurrentStreams } from './concurrent-streams.js';

/** Every coded criterion the engine ships with. A grid picks from these by id. */
export const builtInEvaluators: readonly CriterionEvaluator[] = [
  toolingContextDepth,
  behaviorArtifactDensity,
  prFeatureSize,
  prCorrectionLoad,
  concurrentStreams,
];

export {
  toolingContextDepth,
  behaviorArtifactDensity,
  prFeatureSize,
  prCorrectionLoad,
  concurrentStreams,
};
