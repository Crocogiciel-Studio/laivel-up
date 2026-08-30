import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { ok, err } from '../core/model/result.js';
import { levelById, levelByRank } from '../core/model/grid.js';

/**
 * Cross-cutting reading, wired on every axis with role `confidence` (never
 * `level`). It carries the subject's own self-assessment —
 * `declared.selfAssessedLevel`, either a grid level id or a grid-neutral
 * experience band an inbound adapter read off the free-text self-report — into
 * the bundle so the engine can *show* when the self-image and the measured
 * level part ways.
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
 * A grid-neutral band token (`beginner` / `intermediate` / `advanced`) is
 * resolved to a level here, through `params.rankSelf{Beginner,Intermediate,
 * Advanced}` — the band → level mapping is grid calibration, so it lives in the
 * preset, not in the adapter. Anything else is taken as a literal grid level id.
 *
 * No self-assessment in the profile, or a band the preset does not calibrate →
 * `err(missingPiece)`: nothing to compare, so the criterion does not weigh in.
 */

/** Grid-neutral experience bands the adapter emits → the `params` key that ranks each. */
const BAND_RANK_PARAM: Readonly<Record<string, string>> = {
  beginner: 'rankSelfBeginner',
  intermediate: 'rankSelfIntermediate',
  advanced: 'rankSelfAdvanced',
};

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
    const selfAssessed = context.profile.declared?.selfAssessedLevel;
    if (selfAssessed === undefined) {
      return err(missingPiece(['declared'], 'no self-assessed level'));
    }

    const rankParam = BAND_RANK_PARAM[selfAssessed];
    let levelId = selfAssessed;
    if (rankParam !== undefined) {
      const rank = context.params[rankParam];
      const resolved = rank === undefined ? undefined : levelByRank(context.grid, rank);
      if (resolved === undefined) {
        return err(
          missingPiece(['declared'], `grid does not calibrate the "${selfAssessed}" band`),
        );
      }
      levelId = resolved.id;
    }

    const label = levelById(context.grid, levelId)?.label ?? levelId;

    return ok({
      levelId,
      rawValue: selfAssessed,
      confidence: { ...DECLARED_CONFIDENCE },
      evidence:
        `self-assessment: subject places themselves at "${label}" — ` +
        'shown against the measured level, never raises it',
    });
  },
};
