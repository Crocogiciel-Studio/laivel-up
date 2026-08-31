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
import type { ToolingContext } from '../../core/model/profile.js';

/**
 * Corroborating reading for the Harness axis (role `confidence`, never `level`).
 * `tooling-context-depth` places the subject on a tier from project-memory
 * presence plus a *count* of behavior artifacts; this criterion re-derives the
 * top of that ladder from one independent signal — the raw *density* of
 * behavior artifacts, `rulesCount + agentsCount + hooksCount + skillsCount` —
 * and reads:
 *
 *   density >= `densityStrong`      → behavior tier (`rankBehavior`)
 *   density in 1..`densityStrong`-1  → memory tier   (`rankMemory`)
 *   density 0                        → memory tier when project memory is present,
 *                                      else the prompts/nothing tier
 *
 * The engine (`applyContradictions` in `src/core/engine/bundle.ts`) only lets
 * this reading bite when its level differs from the one the axis elected: a
 * density of 0 against a "behavior"-or-above election pulls the axis confidence
 * down; an agreeing reading has no effect at all. It never moves the level.
 *
 * Tier → rank is grid calibration (`params`), so the same density yields a
 * different level under a different preset. Single-source: the agreement check
 * is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  densityStrong: 4,
  rankNothing: 0,
  rankPrompts: 1,
  rankMemory: 2,
  rankBehavior: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

const TIER_LABEL: Record<number, string> = {
  0: 'nothing/prompts',
  1: 'memory',
  2: 'behavior',
};

/** Which tier the density signal reads, plus the rank it maps to under the grid. */
function readTier(tc: ToolingContext, p: Params): { tier: number; rank: number } {
  const density = tc.rulesCount + tc.agentsCount + tc.hooksCount + tc.skillsCount;

  if (density >= p.densityStrong) return { tier: 2, rank: p.rankBehavior };
  if (density >= 1) return { tier: 1, rank: p.rankMemory };
  if (tc.projectMemoryPresent) return { tier: 1, rank: p.rankMemory };
  if (tc.declaredAssistantTools.length > 0) return { tier: 0, rank: p.rankPrompts };
  return { tier: 0, rank: p.rankNothing };
}

/** Distance of the density to the threshold that fixed its tier, normalized by `densityStrong`. */
function marginFor(density: number, p: Params): number {
  const distance =
    density >= p.densityStrong
      ? density - p.densityStrong
      : density >= 1
        ? Math.min(density - 1, p.densityStrong - density)
        : 1 - density;
  return Math.min(1, distance / Math.max(p.densityStrong, 1e-9));
}

function describe(tc: ToolingContext, density: number, tier: number, p: Params): Message {
  const parts: string[] = [];
  if (tc.rulesCount > 0) parts.push(`${String(tc.rulesCount)} rules`);
  if (tc.agentsCount > 0) parts.push(`${String(tc.agentsCount)} agents`);
  if (tc.hooksCount > 0) parts.push(`${String(tc.hooksCount)} hooks`);
  if (tc.skillsCount > 0) parts.push(`${String(tc.skillsCount)} skills`);
  const artifacts = parts.length > 0 ? parts.join(' + ') : 'no behavior artifacts';
  const comparison =
    density >= p.densityStrong ? `>= ${String(p.densityStrong)}` : `< ${String(p.densityStrong)}`;
  const memory = tc.projectMemoryPresent ? ', project memory present' : '';
  const detail = `${artifacts} = ${String(density)} (${comparison})${memory} => ${TIER_LABEL[tier] ?? String(tier)} tier`;
  return msg('criterion.behavior-artifact-density', { detail });
}

export const behaviorArtifactDensity: CriterionEvaluator = {
  id: 'behavior-artifact-density',
  needs: ['toolingContext'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const density = tc.rulesCount + tc.agentsCount + tc.hooksCount + tc.skillsCount;
    const { tier, rank } = readTier(tc, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['toolingContext'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: TIER_LABEL[tier] ?? String(tier),
      confidence: {
        agreement: 1,
        margin: marginFor(density, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(tc, density, tier, p),
    });
  },
};
