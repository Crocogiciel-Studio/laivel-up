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
import type { StaticAnalysis } from '../../core/model/profile.js';

/**
 * Caps the Harness axis. "Quality is a prerequisite" (AIDD reference): a harness
 * that ships code riddled with duplication and code smells is not at level,
 * whatever scaffolding `tooling-context-depth` credits. Exists for the hidden
 * profile with a shiny harness and a dirty result.
 *
 * Role `cap` (see `applyCaps` in `src/core/engine/bundle.ts`): the reading only
 * ever pulls the elected level *down*, never up. Reads one signal family — the
 * project's static-analysis measures — normalized to size:
 *
 *   smellsPerKloc      = codeSmells / max(ncloc / 1000, 1)
 *   complexityDensity  = cognitiveComplexity / max(ncloc, 1)
 *
 *   duplicatedLinesDensity >= dupHigh (default 12)      → cap at `rankCapPoor`
 *   or smellsPerKloc       >= smellsHigh (default 10)      (default 2 = memory)
 *   or complexityDensity   >= complexityHigh (default 0.05)
 *   otherwise                                            → no cap: reads the
 *     grid's top level, which `applyCaps` ignores because a cap reading never
 *     sits below an elected winner.
 *
 * `err(missingPiece(['staticAnalysis'], ...))` when the section is absent, or
 * when none of the three checks has the measures it needs.
 *
 * Single-source: `agreement` is disabled and flagged. `margin` is the distance
 * to the worst of the thresholds that were crossed (the narrowest overshoot),
 * or — when nothing is crossed — the nearest threshold's clearance;
 * `sufficiency` is 1 whenever a reading is produced. Thresholds and the cap rank
 * are grid calibration (`params`), so the same reading caps differently under a
 * different preset.
 */

const PARAM_DEFAULTS = {
  dupHigh: 12,
  smellsHigh: 10,
  complexityHigh: 0.05,
  rankCapPoor: 2,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Cap band: 0 no cap, 1 cap at the poor-quality floor. */
const BAND_LABEL: Record<number, string> = { 0: 'no-cap', 1: 'cap-poor' };
const NO_CAP = 0;
const CAP_POOR = 1;

/** A reading sitting anywhere inside its band still carries some confidence. */
const MIN_MARGIN = 0.15;

/** Distance-to-threshold, normalized to `[MIN_MARGIN, 1]`. */
function clampMargin(distance: number, span: number): number {
  return Math.max(MIN_MARGIN, Math.min(1, Math.max(0, distance) / Math.max(span, 1e-9)));
}

/** One quality check: its normalized signed distance past its threshold (>= 0 when crossed). */
interface Check {
  readonly label: string;
  /** `(value - threshold) / threshold` — the fraction by which the threshold is over/undershot. */
  readonly ratio: number;
}

/** Build the checks the available measures allow. */
function checksOf(sa: StaticAnalysis, p: Params): Check[] {
  const checks: Check[] = [];
  const ncloc = sa.ncloc;

  if (sa.duplicatedLinesDensity !== undefined) {
    checks.push({
      label: `duplication ${String(sa.duplicatedLinesDensity)}%`,
      ratio: (sa.duplicatedLinesDensity - p.dupHigh) / Math.max(p.dupHigh, 1e-9),
    });
  }
  if (sa.codeSmells !== undefined && ncloc !== undefined) {
    const smellsPerKloc = sa.codeSmells / Math.max(ncloc / 1000, 1);
    checks.push({
      label: `${String(Math.round(smellsPerKloc * 10) / 10)} smells/kloc`,
      ratio: (smellsPerKloc - p.smellsHigh) / Math.max(p.smellsHigh, 1e-9),
    });
  }
  if (sa.cognitiveComplexity !== undefined && ncloc !== undefined) {
    const complexityDensity = sa.cognitiveComplexity / Math.max(ncloc, 1);
    checks.push({
      label: `complexity density ${String(Math.round(complexityDensity * 1000) / 1000)}`,
      ratio: (complexityDensity - p.complexityHigh) / Math.max(p.complexityHigh, 1e-9),
    });
  }
  return checks;
}

/**
 * Cap when any check crosses its threshold. `margin` is the narrowest overshoot
 * among the crossed thresholds ("worst of the thresholds crossed"); with none
 * crossed it is the nearest threshold's clearance.
 */
function readChecks(checks: readonly Check[]): { band: number; margin: number } {
  const crossed = checks.filter((c) => c.ratio >= 0);
  if (crossed.length > 0) {
    const worst = Math.min(...crossed.map((c) => clampMargin(c.ratio, 1)));
    return { band: CAP_POOR, margin: worst };
  }
  const nearest = Math.min(...checks.map((c) => clampMargin(-c.ratio, 1)));
  return { band: NO_CAP, margin: nearest };
}

/** The level this cap reads: the poor-quality floor when it bites, the grid's top otherwise. */
function capLevel(context: CriterionContext, band: number, p: Params): GridLevel | undefined {
  if (band === NO_CAP) {
    const levels = orderedLevels(context.grid);
    return levels[levels.length - 1];
  }
  return levelByRank(context.grid, p.rankCapPoor) ?? orderedLevels(context.grid)[0];
}

export const codeQualityFloor: CriterionEvaluator = {
  id: 'code-quality-floor',
  needs: ['staticAnalysis'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const sa = context.profile.staticAnalysis;
    if (sa === undefined) {
      return err(missingPiece(['staticAnalysis'], 'no static-analysis measures in the profile'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const checks = checksOf(sa, p);
    if (checks.length === 0) {
      return err(
        missingPiece(
          ['staticAnalysis'],
          'no duplication, code-smell or complexity measure to judge code quality',
        ),
      );
    }

    const { band, margin } = readChecks(checks);
    const level = capLevel(context, band, p);
    if (level === undefined) {
      return err(missingPiece(['staticAnalysis'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: BAND_LABEL[band] ?? String(band),
      confidence: {
        agreement: 1,
        margin,
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(checks, band),
    });
  },
};

function describe(checks: readonly Check[], band: number): Message {
  return msg('criterion.code-quality-floor', {
    signals: checks.map((c) => c.label).join(', '),
    band: `band.${BAND_LABEL[band] ?? String(band)}`,
  });
}
