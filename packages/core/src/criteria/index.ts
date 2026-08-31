import type { CriterionEvaluator } from '../core/ports/criterion-evaluator.js';

// Evaluators are grouped in folders by the concern they measure. The folders
// are a reading aid only — a grid still binds each criterion to an axis by id,
// and nothing here assumes the AIDD preset's axis names.
import { prFeatureSize } from './size/pr-feature-size.js';
import { prRawDistribution } from './size/pr-raw-distribution.js';

import { toolingContextDepth } from './harness/tooling-context-depth.js';
import { behaviorArtifactDensity } from './harness/behavior-artifact-density.js';
import { memoryMaintenance } from './harness/memory-maintenance.js';
import { assistantIntegration } from './harness/assistant-integration.js';
import { loopConvergence } from './harness/loop-convergence.js';
import { commitDiscipline } from './harness/commit-discipline.js';
import { testEnforcement } from './harness/test-enforcement.js';
import { codeQualityFloor } from './harness/code-quality-floor.js';
import { bugsFloor } from './harness/bugs-floor.js';

import { prCorrectionLoad } from './intervention/pr-correction-load.js';
import { sessionIntervention } from './intervention/session-intervention.js';
import { reviewCommentLoad } from './intervention/review-comment-load.js';
import { ciIterationLoad } from './intervention/ci-iteration-load.js';
import { revertRate } from './intervention/revert-rate.js';

import { concurrentStreams } from './parallelism/concurrent-streams.js';
import { branchBurstiness } from './parallelism/branch-burstiness.js';

// Cross-axis: every axis bundle carries it as a confidence signal.
import { declaratifContradiction } from './declaratif-contradiction.js';

/** Every coded criterion the engine ships with. A grid picks from these by id. */
export const builtInEvaluators: readonly CriterionEvaluator[] = [
  prFeatureSize,
  prRawDistribution,
  toolingContextDepth,
  behaviorArtifactDensity,
  memoryMaintenance,
  assistantIntegration,
  loopConvergence,
  commitDiscipline,
  testEnforcement,
  codeQualityFloor,
  bugsFloor,
  prCorrectionLoad,
  sessionIntervention,
  reviewCommentLoad,
  ciIterationLoad,
  revertRate,
  concurrentStreams,
  branchBurstiness,
  declaratifContradiction,
];

export {
  prFeatureSize,
  prRawDistribution,
  toolingContextDepth,
  behaviorArtifactDensity,
  memoryMaintenance,
  assistantIntegration,
  loopConvergence,
  commitDiscipline,
  testEnforcement,
  codeQualityFloor,
  bugsFloor,
  prCorrectionLoad,
  sessionIntervention,
  reviewCommentLoad,
  ciIterationLoad,
  revertRate,
  concurrentStreams,
  branchBurstiness,
  declaratifContradiction,
};
