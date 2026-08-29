import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../core/ports/criterion-evaluator.js';
import { missingPiece } from '../core/ports/criterion-evaluator.js';
import type { Result } from '../core/model/result.js';
import { ok, err } from '../core/model/result.js';
import { levelByRank, orderedLevels } from '../core/model/grid.js';
import type { ToolingContext } from '../core/model/profile.js';

/**
 * A second `harness` criterion, role `confidence`. Reads an independent
 * signal — the raw count of behavior artifacts, skills included — and only
 * pulls the axis's confidence down when its own tier disagrees with the level
 * `tooling-context-depth` already elected (`applyContradictions` in
 * `src/core/engine/bundle.ts`); it never changes the elected level itself.
 *
 * Below the "behavior" threshold this deliberately mirrors
 * `tooling-context-depth`'s own memory/prompts/nothing fallback chain, so the
 * two criteria only disagree in the one scenario the density signal is meant
 * to catch: thin artifact density while `tooling-context-depth`'s own
 * presence-only, skills-excluded gate has already crossed into "behavior".
 */

const PARAM_DEFAULTS = {
  rankNothing: 0,
  rankPrompts: 1,
  rankMemory: 2,
  rankBehavior: 4,
  densityStrong: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

function density(tc: ToolingContext): number {
  return tc.rulesCount + tc.agentsCount + tc.hooksCount + tc.skillsCount;
}

function tierRank(tc: ToolingContext, d: number, p: Params): number {
  if (d >= p.densityStrong) return p.rankBehavior;
  if (tc.projectMemoryPresent) return p.rankMemory;
  if (tc.declaredAssistantTools.length > 0) return p.rankPrompts;
  return p.rankNothing;
}

function tierLabel(d: number, p: Params): string {
  if (d >= p.densityStrong) return 'behavior';
  return 'below-behavior';
}

export const behaviorArtifactDensity: CriterionEvaluator = {
  id: 'behavior-artifact-density',
  needs: ['toolingContext'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const d = density(tc);

    const rank = tierRank(tc, d, p);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['toolingContext'], 'grid declares no levels'));
    }

    const distance = d >= p.densityStrong ? d - p.densityStrong : p.densityStrong - d;
    const margin = Math.min(1, 0.5 + distance / (p.densityStrong * 2));

    return ok({
      levelId: level.id,
      rawValue: d,
      confidence: {
        agreement: 1,
        margin,
        sufficiency: 1,
        singleSource: true,
      },
      evidence: `artifact density ${String(d)} (rules ${String(tc.rulesCount)}, agents ${String(tc.agentsCount)}, hooks ${String(tc.hooksCount)}, skills ${String(tc.skillsCount)}) => tier ${tierLabel(d, p)}`,
    });
  },
};
