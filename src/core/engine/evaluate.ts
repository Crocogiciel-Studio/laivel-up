import type { Profile } from '../model/profile.js';
import { missingSections } from '../model/profile.js';
import type { Grid, GridAxis, BundleEntry } from '../model/grid.js';
import { levelById } from '../model/grid.js';
import type { AxisVerdict, CriterionReading, Evaluation } from '../model/evaluation.js';
import type { CriterionEvaluator } from '../ports/criterion-evaluator.js';
import type { EvaluatorCatalogue } from '../ports/evaluator-catalogue.js';
import { aggregate } from './aggregate.js';
import { foldConfidence } from './confidence.js';
import { runBundle } from './bundle.js';
import { planProgression } from './progression.js';

export interface EvaluateOptions {
  /** Minimum axes that must be ruled on before a global level is emitted. */
  readonly minRuledAxes?: number;
  /** Injected clock, for deterministic output. */
  readonly now?: () => Date;
}

export function evaluate(
  profile: Profile,
  grid: Grid,
  catalogue: EvaluatorCatalogue,
  options: EvaluateOptions = {},
): Evaluation {
  const minRuledAxes = options.minRuledAxes ?? 1;
  const now = options.now ?? ((): Date => new Date());

  const axisVerdicts: AxisVerdict[] = grid.axes.map((axis) =>
    evaluateAxis(profile, grid, axis, catalogue),
  );

  const global = aggregate(grid, axisVerdicts, minRuledAxes);
  const progression = planProgression(grid, global, axisVerdicts);

  return {
    subjectId: profile.subject.id,
    gridId: grid.id,
    global,
    axes: axisVerdicts,
    progression,
    generatedAt: now().toISOString(),
  };
}

function evaluateAxis(
  profile: Profile,
  grid: Grid,
  axis: GridAxis,
  catalogue: EvaluatorCatalogue,
): AxisVerdict {
  const readings = axis.bundle.map((entry) =>
    readCriterion(profile, grid, axis, entry, catalogue.get(entry.criterionId)),
  );
  return runBundle(grid, axis, readings);
}

function readCriterion(
  profile: Profile,
  grid: Grid,
  axis: GridAxis,
  entry: BundleEntry,
  evaluator: CriterionEvaluator | undefined,
): CriterionReading {
  const base = {
    criterionId: entry.criterionId,
    axisId: axis.id,
    role: entry.role,
  } as const;

  if (evaluator === undefined) {
    return {
      ...base,
      status: 'unknown',
      levelId: undefined,
      levelRank: undefined,
      rawValue: undefined,
      confidence: 0,
      limitingFactor: 'sufficiency',
      evidence: `no evaluator registered for "${entry.criterionId}"`,
    };
  }

  const missing = missingSections(profile, evaluator.needs);
  if (missing.length > 0) {
    return {
      ...base,
      status: 'unknown',
      levelId: undefined,
      levelRank: undefined,
      rawValue: undefined,
      confidence: 0,
      limitingFactor: 'sufficiency',
      evidence: `needs ${missing.join(', ')} — not in the profile`,
    };
  }

  const outcome = evaluator.evaluate({
    profile,
    grid,
    axisId: axis.id,
    params: entry.params,
  });

  if (!outcome.ok) {
    return {
      ...base,
      status: 'unknown',
      levelId: undefined,
      levelRank: undefined,
      rawValue: undefined,
      confidence: 0,
      limitingFactor: 'sufficiency',
      evidence: outcome.error.detail,
    };
  }

  const folded = foldConfidence(outcome.value.confidence);
  const level = levelById(grid, outcome.value.levelId);

  return {
    ...base,
    status: 'read',
    levelId: outcome.value.levelId,
    levelRank: level?.rank,
    rawValue: outcome.value.rawValue,
    confidence: folded.value,
    limitingFactor: folded.limitingFactor,
    evidence: outcome.value.evidence,
  };
}
