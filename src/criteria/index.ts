import type { CriterionEvaluator } from '../core/ports/criterion-evaluator.js';
import { toolingContextDepth } from './tooling-context-depth.js';
import { behaviorArtifactDensity } from './behavior-artifact-density.js';
import { prFeatureSize } from './pr-feature-size.js';
import { prCorrectionLoad } from './pr-correction-load.js';
import { reviewCommentLoad } from './review-comment-load.js';
import { ciIterationLoad } from './ci-iteration-load.js';
import { revertRate } from './revert-rate.js';
import { concurrentStreams } from './concurrent-streams.js';
import { branchBurstiness } from './branch-burstiness.js';
import { loopConvergence } from './loop-convergence.js';
import { commitDiscipline } from './commit-discipline.js';
import { codeQualityFloor } from './code-quality-floor.js';
import { bugsFloor } from './bugs-floor.js';
import { memoryMaintenance } from './memory-maintenance.js';
import { testEnforcement } from './test-enforcement.js';
import { declaratifContradiction } from './declaratif-contradiction.js';

/** Every coded criterion the engine ships with. A grid picks from these by id. */
export const builtInEvaluators: readonly CriterionEvaluator[] = [
  toolingContextDepth,
  behaviorArtifactDensity,
  prFeatureSize,
  prCorrectionLoad,
  reviewCommentLoad,
  ciIterationLoad,
  revertRate,
  concurrentStreams,
  branchBurstiness,
  loopConvergence,
  commitDiscipline,
  codeQualityFloor,
  bugsFloor,
  memoryMaintenance,
  testEnforcement,
  declaratifContradiction,
];

export {
  toolingContextDepth,
  behaviorArtifactDensity,
  prFeatureSize,
  prCorrectionLoad,
  reviewCommentLoad,
  ciIterationLoad,
  revertRate,
  concurrentStreams,
  branchBurstiness,
  loopConvergence,
  commitDiscipline,
  codeQualityFloor,
  bugsFloor,
  memoryMaintenance,
  testEnforcement,
  declaratifContradiction,
};
