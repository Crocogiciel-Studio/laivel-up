/** Public surface of the core. Only the model and the engine cross the boundary. */

export * from './model/result.js';
export * from './model/dossier.js';
export * from './model/grille.js';
export * from './model/resultat.js';

export * from './ports/criterion-evaluator.js';
export * from './ports/evaluator-catalogue.js';
export * from './ports/io.js';

export { evaluate } from './engine/evaluate.js';
export type { EvaluateOptions } from './engine/evaluate.js';
export { foldConfidence, weakestOf } from './engine/confidence.js';
export type { FoldedConfidence } from './engine/confidence.js';
export { runFaisceau } from './engine/faisceau.js';
export { aggregate } from './engine/aggregate.js';
export { planProgression } from './engine/progression.js';
