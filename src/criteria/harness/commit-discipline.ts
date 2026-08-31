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
import type { GridLevel } from '../../core/model/grid.js';
import { levelByRank, orderedLevels } from '../../core/model/grid.js';

/**
 * Caps the Harness axis. There is no real harness if the assistant co-signs
 * almost none of the commits: whatever scaffolding `tooling-context-depth`
 * credits, the axis cannot climb past what an absent AI hand on the code allows.
 * Exists for the hidden profiles that rig a harness the assistant never touches.
 *
 * Role `cap` (see `applyCaps` in `src/core/engine/bundle.ts`): the reading only
 * ever pulls the elected level *down*, never up. Reads one signal —
 * `vcsActivity.commits.aiCoauthoredRatio` (AI-co-signed / total, already
 * computed by the inbound adapter):
 *
 *   < aiFloorHard (default 0.15) → cap at `rankCapHard` (default 1 = prompts)
 *   < aiFloorSoft (default 0.35) → cap at `rankCapSoft` (default 2 = memory)
 *   otherwise                    → no cap: reads the grid's top level, which
 *                                  `applyCaps` ignores because a cap reading
 *                                  never sits below an elected winner.
 *
 * Single-source: `agreement` is disabled and flagged. `margin` is the ratio's
 * distance to the threshold it was judged against; `sufficiency` is 1 whenever
 * the ratio is present. Thresholds and cap ranks are grid calibration
 * (`params`), so the same reading caps differently under a different preset.
 */

const PARAM_DEFAULTS = {
  aiFloorHard: 0.15,
  aiFloorSoft: 0.35,
  rankCapHard: 1,
  rankCapSoft: 2,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Cap band, low → high severity: 0 no cap, 1 cap soft, 2 cap hard. */
const BAND_LABEL: Record<number, string> = { 0: 'no-cap', 1: 'cap-soft', 2: 'cap-hard' };
const NO_CAP = 0;
const CAP_SOFT = 1;
const CAP_HARD = 2;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

function capBand(ratio: number, p: Params): number {
  if (ratio < p.aiFloorHard) return CAP_HARD;
  if (ratio < p.aiFloorSoft) return CAP_SOFT;
  return NO_CAP;
}

/** Distance-to-threshold, normalized to `[MIN_MARGIN, 1]`. */
function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/**
 * How far the ratio sits from the threshold its band was read against. The hard
 * band is bounded above by `aiFloorHard` — distance down to it. The soft band is
 * bounded on both sides, so its margin is taken from the nearer boundary over
 * half the band's width and peaks at the centre. "No cap" is bounded below by
 * `aiFloorSoft` and open-ended upward — distance from the threshold it cleared.
 */
function bandMargin(ratio: number, band: number, p: Params): number {
  if (band === CAP_HARD) return clampMargin(p.aiFloorHard - ratio, p.aiFloorHard);
  if (band === CAP_SOFT) {
    const half = (p.aiFloorSoft - p.aiFloorHard) / 2;
    return clampMargin(Math.min(ratio - p.aiFloorHard, p.aiFloorSoft - ratio), half);
  }
  return clampMargin(ratio - p.aiFloorSoft, p.aiFloorSoft);
}

/** The level this cap reads: an actual cap for the two lower bands, the grid's top otherwise. */
function capLevel(context: CriterionContext, band: number, p: Params): GridLevel | undefined {
  if (band === NO_CAP) {
    const levels = orderedLevels(context.grid);
    return levels[levels.length - 1];
  }
  const rank = band === CAP_HARD ? p.rankCapHard : p.rankCapSoft;
  return levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
}

export const commitDiscipline: CriterionEvaluator = {
  id: 'commit-discipline',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const commits = context.profile.vcsActivity?.commits;
    if (commits === undefined) {
      return err(missingPiece(['vcsActivity'], 'no commit facts in the profile'));
    }
    const ratio = commits.aiCoauthoredRatio;
    if (ratio === undefined) {
      return err(missingPiece(['vcsActivity'], 'no AI-co-authored commit ratio in the profile'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const band = capBand(ratio, p);
    const level = capLevel(context, band, p);
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin: bandMargin(ratio, band, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(ratio, band),
    });
  },
};

function describe(ratio: number, band: number): Message {
  return msg('criterion.commit-discipline', {
    pct: Math.round(ratio * 1000) / 10,
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
