import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { ok, err } from '../core/model/result.js';
import type { GridLevel } from '../core/model/grid.js';
import { levelByRank, orderedLevels } from '../core/model/grid.js';

/**
 * Caps the Harness axis on the Sonar **bug** count — the sibling of
 * `code-quality-floor`, which watches duplication, code smells and complexity.
 * A harness that lets a stream of real defects through is not at level,
 * whatever scaffolding `tooling-context-depth` credits.
 *
 * Role `cap` (see `applyCaps` in `src/core/engine/bundle.ts`): the reading only
 * ever pulls the elected level *down*, never up. Reads one signal family — the
 * project's static-analysis bug count, normalized to size:
 *
 *   bugsPerKloc = bugs / max(ncloc / 1000, 1)
 *
 *   bugsPerKloc >= bugsHigh (default 2)   → cap at `rankCapBuggy` (default 2 = memory)
 *   bugsPerKloc >= bugsMid  (default 0.5) → cap at `rankCapMid`   (default 3 = behavior)
 *   otherwise                             → no cap: reads the grid's top level,
 *     which `applyCaps` ignores because a cap reading never sits below an
 *     elected winner.
 *
 * `err(missingPiece(['staticAnalysis'], ...))` when the section is absent, or
 * when `bugs` or `ncloc` is missing.
 *
 * Single-source: `agreement` is disabled and flagged. `margin` is the distance
 * from `bugsPerKloc` to the boundary of the band it landed in; `sufficiency` is
 * 1 whenever a reading is produced. The thresholds and the cap ranks are grid
 * calibration (`params`), so the same reading caps differently under a
 * different preset.
 */

const PARAM_DEFAULTS = {
  bugsHigh: 2,
  bugsMid: 0.5,
  rankCapBuggy: 2,
  rankCapMid: 3,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Cap band: 0 no cap, 1 cap at the mid floor, 2 cap at the buggy floor. */
const BAND_LABEL: Record<number, string> = { 0: 'no-cap', 1: 'cap-mid', 2: 'cap-buggy' };
const NO_CAP = 0;
const CAP_MID = 1;
const CAP_BUGGY = 2;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

/** Distance-to-boundary, normalized to `[MIN_MARGIN, 1]`. */
function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/** Which band `bugsPerKloc` lands in, and how clear of its boundary it sits. */
function readBugs(bugsPerKloc: number, p: Params): { band: number; margin: number } {
  if (bugsPerKloc >= p.bugsHigh) {
    return { band: CAP_BUGGY, margin: clampMargin(bugsPerKloc - p.bugsHigh, p.bugsHigh) };
  }
  if (bugsPerKloc >= p.bugsMid) {
    const span = p.bugsHigh - p.bugsMid;
    const clearance = Math.min(bugsPerKloc - p.bugsMid, p.bugsHigh - bugsPerKloc);
    return { band: CAP_MID, margin: clampMargin(clearance, span) };
  }
  return { band: NO_CAP, margin: clampMargin(p.bugsMid - bugsPerKloc, p.bugsMid) };
}

/** The level this cap reads: the band's floor when it bites, the grid's top otherwise. */
function capLevel(context: CriterionContext, band: number, p: Params): GridLevel | undefined {
  if (band === NO_CAP) {
    const levels = orderedLevels(context.grid);
    return levels[levels.length - 1];
  }
  const rank = band === CAP_BUGGY ? p.rankCapBuggy : p.rankCapMid;
  return levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
}

export const bugsFloor: CriterionEvaluator = {
  id: 'bugs-floor',
  needs: ['staticAnalysis'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const sa = context.profile.staticAnalysis;
    if (sa === undefined) {
      return err(missingPiece(['staticAnalysis'], 'no static-analysis measures in the profile'));
    }
    if (sa.bugs === undefined || sa.ncloc === undefined) {
      return err(
        missingPiece(['staticAnalysis'], 'need both a bug count and ncloc to judge bug density'),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const bugsPerKloc = sa.bugs / Math.max(sa.ncloc / 1000, 1);

    const { band, margin } = readBugs(bugsPerKloc, p);
    const level = capLevel(context, band, p);
    if (level === undefined) {
      return err(missingPiece(['staticAnalysis'], 'grid declares no levels'));
    }

    const rounded = Math.round(bugsPerKloc * 10) / 10;
    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin,
        sufficiency: 1,
        singleSource: true,
      },
      evidence: `bugs floor: ${String(sa.bugs)} bugs over ${String(sa.ncloc)} ncloc = ${String(rounded)} bugs/kloc => ${BAND_LABEL[band] ?? String(band)}`,
    });
  },
};
