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
 * `tooling-context-depth` credits the "memory" tier the moment a project-context
 * file exists. This criterion checks the memory is *kept*: a context file that
 * was written once and never touched again is weaker evidence than a maintained
 * one.
 *
 *   projectMemoryPresent === false        → "nothing" tier (`rankNone`, 0)
 *   present with a recorded last-updated  → "memory"  tier (`rankMemory`, 2) — corroborates
 *   present with no recorded update       → "prompts" tier (`rankPrompts`, 1) — contradicts
 *
 * A "prompts" reading sits one tier below the "memory"+ level `tooling-context-depth`
 * elects, so `applyContradictions` in `src/core/engine/bundle.ts` pulls the axis
 * confidence down. An agreeing reading has no effect; the level never moves.
 *
 * Tier → rank is grid calibration (`params`), so the same signal yields a
 * different level under a different preset. The signal is binary, so `margin` is
 * a fixed `0.7`. Single-source: the agreement check is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  rankNone: 0,
  rankPrompts: 1,
  rankMemory: 2,
} as const;

type Params = Record<keyof typeof PARAM_DEFAULTS, number>;

/** Fixed decisiveness: `projectMemoryLastUpdated` is present or it is not. */
const BINARY_MARGIN = 0.7;

interface Tier {
  rank: number;
  label: 'nothing' | 'prompts' | 'memory';
}

function readTier(tc: ToolingContext, p: Params): Tier {
  if (!tc.projectMemoryPresent) return { rank: p.rankNone, label: 'nothing' };

  const lastUpdated = tc.projectMemoryLastUpdated;
  const hasRecordedUpdate = lastUpdated !== undefined && lastUpdated.trim().length > 0;
  return hasRecordedUpdate
    ? { rank: p.rankMemory, label: 'memory' }
    : { rank: p.rankPrompts, label: 'prompts' };
}

function describe(tc: ToolingContext, tier: Tier): Message {
  const state = !tc.projectMemoryPresent
    ? msg('criterion.memory-maintenance.absent')
    : tier.label === 'memory'
      ? msg('criterion.memory-maintenance.present-updated', {
          date: String(tc.projectMemoryLastUpdated),
        })
      : msg('criterion.memory-maintenance.present-stale');
  return msg('criterion.memory-maintenance', { state, tier: `tier.${tier.label}` });
}

export const memoryMaintenance: CriterionEvaluator = {
  id: 'memory-maintenance',
  needs: ['toolingContext'],

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const tc = context.profile.toolingContext;
    if (tc === undefined) {
      return err(missingPiece(['toolingContext'], 'toolingContext section is empty'));
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const tier = readTier(tc, p);
    const level = levelByRank(context.grid, tier.rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['toolingContext'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: tier.label,
      confidence: { agreement: 1, margin: BINARY_MARGIN, sufficiency: 1, singleSource: true },
      evidence: describe(tc, tier),
    });
  },
};
