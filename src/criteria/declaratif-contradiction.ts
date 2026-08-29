import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { ok, err } from '../core/model/result.js';
import { levelById } from '../core/model/grid.js';

/**
 * Cross-cutting reading, wired on every axis with role `confidence` (never
 * `level`). It carries the subject's own self-assessment —
 * `declared.selfAssessedLevel`, a level id an inbound adapter extracted from
 * the free-text self-report — into the bundle so the engine can *show* when the
 * self-image and the measured level part ways.
 *
 * The reading points at the declared level. `applyContradictions` in
 * `src/core/engine/bundle.ts` only lets it bite when that differs from the
 * level the axis elected, and then only pulls the axis confidence down — a
 * declared signal can never raise a level (`criterion-contract.md`
 * #declaratif-never-raises). The bite strength falls off with the rank gap,
 * `max(0, 1 - contradictionSlope * |rankDeclared - rankElected|)`; the slope is
 * grid calibration (`params.contradictionSlope`, default 0.35) and the engine
 * applies it, since only it knows the elected level.
 *
 * No self-assessment in the profile → `err(missingPiece)`: nothing to compare,
 * so the criterion does not weigh in at all.
 */

/**
 * The reading is a faithful copy of what the subject stated: its decisiveness
 * is not in question, only whether it agrees with the facts — and that the
 * engine scores from the rank gap. Single-source, so `agreement` is inert here.
 */
const DECLARED_CONFIDENCE = {
  agreement: 1,
  margin: 1,
  sufficiency: 1,
  singleSource: true,
} as const;

export const declaratifContradiction: CriterionEvaluator = {
  id: 'declaratif-contradiction',
  needs: ['declared'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const selfAssessedLevel = context.profile.declared?.selfAssessedLevel;
    if (selfAssessedLevel === undefined) {
      return err(missingPiece(['declared'], 'no self-assessed level'));
    }

    const declaredLevel = levelById(context.grid, selfAssessedLevel);
    const label = declaredLevel?.label ?? selfAssessedLevel;

    return ok({
      levelId: selfAssessedLevel,
      rawValue: selfAssessedLevel,
      confidence: { ...DECLARED_CONFIDENCE },
      evidence:
        `self-assessment: subject places themselves at "${label}" — ` +
        'shown against the measured level, never raises it',
    });
  },
};
