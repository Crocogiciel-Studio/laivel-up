/** Public surface of the core. Only the model and the engine cross the boundary. */

export * from './model/result.js';
export * from './model/profile.js';
export * from './model/grid.js';
export * from './model/evaluation.js';

export * from './ports/criterion-evaluator.js';
export * from './ports/evaluator-catalogue.js';
export * from './ports/io.js';

export { evaluate } from './engine/evaluate.js';
export type { EvaluateOptions } from './engine/evaluate.js';
export { foldConfidence, weakestOf } from './engine/confidence.js';
export type { FoldedConfidence } from './engine/confidence.js';
export { runBundle } from './engine/bundle.js';
export { aggregate } from './engine/aggregate.js';
export { planProgression } from './engine/progression.js';
