import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../../core/ports/criterion-evaluator.js';
import { missingPiece } from '../../core/ports/criterion-evaluator.js';
import type { Result } from '../../core/model/result.js';
import { msg, type Message } from '../../core/model/evaluation.js';
import { ok, err } from '../../core/model/result.js';
import { levelByRank, orderedLevels } from '../../core/model/grid.js';
import type { WorkSession } from '../../core/model/profile.js';

/**
 * Places the subject on the Intervention axis from a direct observation: the
 * `session.md` transcript of one prompt→commit session. When it exists it is
 * the axis's strongest signal — an eyewitness account of how much the human
 * steers mid-task, not a proxy read off pull-request metadata.
 *
 * One signal family (single-source): the count of explicit mid-task
 * course-corrections the inbound adapter pulled from the human turns, placed in
 * a band. Bands run low → high like `pr-correction-load`, and band → rank is
 * the *top* of the band's grid cell (`params`), per the axis convention:
 *
 *   band 0  many corrections (`> interventionsMost`)                  → `rankAfterMost`
 *   band 1  some (`interventionsSome < n <= interventionsMost`)        → `rankAfterSome`
 *   band 2  few (`n <= interventionsSome`), or a framing-only run      → `rankKeyStages`
 *
 * A framing-only transcript with no mid-task correction would read "never, once
 * framed" — a notional band 3 (Silver/Gold). That is out of scope: no sample
 * profile calibrates it, so it is capped to band 2, exactly as
 * `pr-correction-load` caps its own top band.
 *
 * The reading rests on shallow text heuristics, so `sufficiency` is held at
 * `0.7`: an indirect, fragile signal that corroborates more than it decides.
 */

const PARAM_DEFAULTS = {
  interventionsSome: 1,
  interventionsMost: 3,
  rankAfterMost: 1,
  rankAfterSome: 2,
  rankKeyStages: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Band index, low → high: 0 corrects on most tasks, 2 frames then lets it run. */
const BAND_LABEL: Record<number, string> = {
  0: 'mid-task-heavy',
  1: 'mid-task-some',
  2: 'framing-mostly',
};

/** Textual heuristics never carry full weight — held constant, per the contract. */
const SUFFICIENCY = 0.7;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

function bandFor(interventions: number, framingOnly: boolean | undefined, p: Params): number {
  // Framing-only with no reprise is a notional band 3 ("never, once framed"),
  // capped here to band 2 for want of anything to calibrate the higher cell.
  if (framingOnly === true && interventions <= 0) return 2;
  if (interventions <= p.interventionsSome) return 2;
  if (interventions <= p.interventionsMost) return 1;
  return 0;
}

function rankForBand(band: number, p: Params): number {
  switch (band) {
    case 0:
      return p.rankAfterMost;
    case 1:
      return p.rankAfterSome;
    default:
      return p.rankKeyStages;
  }
}

/**
 * Distance from the boundary the band was read against, normalised to
 * `[MIN_MARGIN, 1]`. Bands 0 and 2 are open-ended — distance from their single
 * threshold. Band 1 is bounded both sides — distance from the *nearer* edge over
 * half the band's width, so the margin peaks at the band's centre.
 */
function bandMargin(value: number, band: number, p: Params): number {
  const lo = p.interventionsSome;
  const hi = p.interventionsMost;
  if (band === 0) return clampMargin(value - hi, hi);
  if (band === 2) return clampMargin(lo - value, Math.max(lo, 1));
  return clampMargin(Math.min(value - lo, hi - value), (hi - lo) / 2);
}

export const sessionIntervention: CriterionEvaluator = {
  id: 'session-intervention',
  needs: ['workSession'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const ws = context.profile.workSession;
    if (ws === undefined) {
      return err(missingPiece(['workSession'], 'no work session in the profile'));
    }

    const interventions = ws.humanInterventionsMidTask;
    if (interventions === undefined && ws.framingOnly !== true) {
      return err(
        missingPiece(['workSession'], 'session text yielded no usable intervention signal'),
      );
    }
    const n = interventions ?? 0;

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const band = bandFor(n, ws.framingOnly, p);
    const rank = rankForBand(band, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['workSession'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin: bandMargin(n, band, p),
        sufficiency: SUFFICIENCY,
        singleSource: true,
      },
      evidence: describe(ws, n, band),
    });
  },
};

function describe(ws: WorkSession, interventions: number, band: number): Message {
  const parts: string[] = [];
  if (ws.promptToCommitSteps !== undefined) {
    parts.push(`${String(ws.promptToCommitSteps)} prompt→commit turns`);
  }
  const unit = interventions === 1 ? 'intervention' : 'interventions';
  parts.push(`${String(interventions)} mid-task ${unit}`);
  if (ws.framingOnly === true) parts.push('framing only');
  parts.push(`=> ${BAND_LABEL[band] ?? String(band)}`);
  return msg('criterion.session-intervention', { detail: parts.join('; ') });
}
