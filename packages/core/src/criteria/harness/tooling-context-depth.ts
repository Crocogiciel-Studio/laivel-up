import type {
  CriterionContext,
  CriterionEvaluator,
  CriterionOutput,
  MissingPiece,
} from '../../core/ports/criterion-evaluator.js';
import { missingPiece } from '../../core/ports/criterion-evaluator.js';
import type { Result } from '../../core/model/result.js';
import { msg } from '../../core/model/evaluation.js';
import { ok, err } from '../../core/model/result.js';
import { levelByRank, orderedLevels } from '../../core/model/grid.js';
import type { ToolingContext } from '../../core/model/profile.js';

/**
 * Walking-skeleton criterion. Reads one signal family — the scaffolding the
 * subject set up around their assistant — and places it on an ordinal tier:
 *   nothing → prompts only → project memory → + behavior artifacts → + auto-retry loop
 * Each tier maps to the highest grid level whose harness requirement it meets;
 * that mapping is grid calibration (`params`), so the same reading yields
 * different levels under different presets. Single-source: the agreement check
 * is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  rankNothing: 0,
  rankPrompts: 1,
  rankMemory: 2,
  rankBehavior: 4,
  rankLoop: 6,
} as const;

function tierRank(tc: ToolingContext, params: Readonly<Record<string, number>>): number {
  const p = { ...PARAM_DEFAULTS, ...params };
  const behaviorArtifacts = tc.rulesCount + tc.agentsCount + tc.hooksCount;

  if (tc.autoRetryLoopPresent === true) return p.rankLoop;
  if (tc.projectMemoryPresent && behaviorArtifacts >= 1) return p.rankBehavior;
  if (tc.projectMemoryPresent) return p.rankMemory;
  if (tc.declaredAssistantTools.length > 0) return p.rankPrompts;
  return p.rankNothing;
}

function describe(tc: ToolingContext): string {
  const parts: string[] = [];
  parts.push(tc.projectMemoryPresent ? 'project memory present' : 'no project memory');
  const artifacts: string[] = [];
  if (tc.rulesCount > 0) artifacts.push(`${String(tc.rulesCount)} rules`);
  if (tc.agentsCount > 0) artifacts.push(`${String(tc.agentsCount)} agents`);
  if (tc.hooksCount > 0) artifacts.push(`${String(tc.hooksCount)} hooks`);
  if (tc.skillsCount > 0) artifacts.push(`${String(tc.skillsCount)} skills`);
  parts.push(artifacts.length > 0 ? artifacts.join(', ') : 'no behavior artifacts');
  if (tc.autoRetryLoopPresent === true) parts.push('auto-retry loop in place');
  return parts.join('; ');
}

export const toolingContextDepth: CriterionEvaluator = {
  id: 'tooling-context-depth',
  needs: ['toolingContext'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const rank = tierRank(tc, context.params);
    const level = levelByRank(context.grid, rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['toolingContext'], 'grid declares no levels'));
    }

    const behaviorArtifacts = tc.rulesCount + tc.agentsCount + tc.hooksCount;
    // Decisive when the deciding signal sits well clear of its boundary (== 1).
    const margin =
      rank === 0
        ? 0.7
        : Math.min(1, 0.5 + Math.min(behaviorArtifacts, 4) / 8);
    const sufficiency = tc.autoRetryLoopPresent === undefined ? 0.7 : 1;

    return ok({
      levelId: level.id,
      rawValue: rank,
      confidence: {
        agreement: 1,
        margin,
        sufficiency,
        singleSource: true,
      },
      evidence: msg('criterion.tooling-context-depth', { detail: describe(tc) }),
    });
  },
};
