import type { Dossier } from '../model/dossier.js';
import { missingSections } from '../model/dossier.js';
import type { Grille, GrilleAxis, FaisceauEntry } from '../model/grille.js';
import { levelById } from '../model/grille.js';
import type { AxisVerdict, CriterionReading, Resultat } from '../model/resultat.js';
import type { CriterionEvaluator } from '../ports/criterion-evaluator.js';
import type { EvaluatorCatalogue } from '../ports/evaluator-catalogue.js';
import { aggregate } from './aggregate.js';
import { foldConfidence } from './confidence.js';
import { runFaisceau } from './faisceau.js';
import { planProgression } from './progression.js';

export interface EvaluateOptions {
  /** Minimum axes that must be ruled on before a global level is emitted. */
  readonly minRuledAxes?: number;
  /** Injected clock, for deterministic output. */
  readonly now?: () => Date;
}

export function evaluate(
  dossier: Dossier,
  grille: Grille,
  catalogue: EvaluatorCatalogue,
  options: EvaluateOptions = {},
): Resultat {
  const minRuledAxes = options.minRuledAxes ?? 1;
  const now = options.now ?? ((): Date => new Date());

  const axisVerdicts: AxisVerdict[] = grille.axes.map((axis) =>
    evaluateAxis(dossier, grille, axis, catalogue),
  );

  const global = aggregate(grille, axisVerdicts, minRuledAxes);
  const progression = planProgression(grille, global, axisVerdicts);

  return {
    subjectId: dossier.subject.id,
    grilleId: grille.id,
    global,
    axes: axisVerdicts,
    progression,
    generatedAt: now().toISOString(),
  };
}

function evaluateAxis(
  dossier: Dossier,
  grille: Grille,
  axis: GrilleAxis,
  catalogue: EvaluatorCatalogue,
): AxisVerdict {
  const readings = axis.faisceau.map((entry) =>
    readCriterion(dossier, grille, axis, entry, catalogue.get(entry.criterionId)),
  );
  return runFaisceau(grille, axis, readings);
}

function readCriterion(
  dossier: Dossier,
  grille: Grille,
  axis: GrilleAxis,
  entry: FaisceauEntry,
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

  const missing = missingSections(dossier, evaluator.needs);
  if (missing.length > 0) {
    return {
      ...base,
      status: 'unknown',
      levelId: undefined,
      levelRank: undefined,
      rawValue: undefined,
      confidence: 0,
      limitingFactor: 'sufficiency',
      evidence: `needs ${missing.join(', ')} — not in the dossier`,
    };
  }

  const outcome = evaluator.evaluate({
    dossier,
    grille,
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
  const level = levelById(grille, outcome.value.levelId);

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
