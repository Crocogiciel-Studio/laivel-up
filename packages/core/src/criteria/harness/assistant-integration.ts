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
 * Corroborates `tooling-context-depth`: an assistant wired into the editor, more
 * than one tool declared, and a sustained usage volume together mean a harness
 * that is really in place — not merely claimed. As a `confidence` reading it can
 * only pull the Harness axis confidence down when it disagrees with the elected
 * level (`applyContradictions` in `src/core/engine/bundle.ts`); it never raises
 * or lowers the level itself.
 *
 * Four independent integration signals, each worth one point:
 *   - `editorIntegration === true`                        +1
 *   - `declaredAssistantTools.length >= 2`                +1
 *   - `tokensPerWeek >= tokensHigh`     (param, 1_000_000) +1
 *   - `sessionsPerWeek >= sessionsHigh` (param, 20)        +1
 *
 *   score >= 3 → "behavior" tier (`rankBehavior`, 4) — corroborates a high harness
 *   score 0    → "prompts"  tier (`rankPrompts`, 1) — contradicts a high read, confidence ↓
 *   otherwise  → "memory"   tier (`rankMemory`, 2)
 *
 * Tier → rank is grid calibration (`params`), so the same signal yields a
 * different level under a different preset. `margin` is `score / 4`.
 * Single-source: the agreement check is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  tokensHigh: 1_000_000,
  sessionsHigh: 20,
  rankPrompts: 1,
  rankMemory: 2,
  rankBehavior: 4,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

type TierLabel = 'behavior' | 'memory' | 'prompts';

interface Tier {
  readonly rank: number;
  readonly label: TierLabel;
}

function integrationScore(tc: ToolingContext, p: Params): number {
  let score = 0;
  if (tc.editorIntegration === true) score += 1;
  if (tc.declaredAssistantTools.length >= 2) score += 1;
  if (tc.tokensPerWeek !== undefined && tc.tokensPerWeek >= p.tokensHigh) score += 1;
  if (tc.sessionsPerWeek !== undefined && tc.sessionsPerWeek >= p.sessionsHigh) score += 1;
  return score;
}

function readTier(score: number, p: Params): Tier {
  if (score >= 3) return { rank: p.rankBehavior, label: 'behavior' };
  if (score === 0) return { rank: p.rankPrompts, label: 'prompts' };
  return { rank: p.rankMemory, label: 'memory' };
}

function describe(tc: ToolingContext, score: number, tier: Tier): Message {
  return msg('criterion.assistant-integration', {
    editor: tc.editorIntegration === true ? 'flag.yes' : 'flag.no',
    tools: tc.declaredAssistantTools.length,
    tokens: tc.tokensPerWeek === undefined ? '?' : String(tc.tokensPerWeek),
    sessions: tc.sessionsPerWeek === undefined ? '?' : String(tc.sessionsPerWeek),
    score,
    tier: `tier.${tier.label}`,
  });
}

export const assistantIntegration: CriterionEvaluator = {
  id: 'assistant-integration',
  needs: ['toolingContext'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const score = integrationScore(tc, p);
    const tier = readTier(score, p);

    const level = levelByRank(context.grid, tier.rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['toolingContext'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: tier.label,
      confidence: {
        agreement: 1,
        margin: score / 4,
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(tc, score, tier),
    });
  },
};
