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

/**
 * Corroborating reading for the Harness axis (role `confidence`, never `level`).
 * A harness that *counts* makes the assistant test: a strong share of pull
 * requests ship with tests and line coverage trends up. In the AIDD grid code
 * quality is not its own axis, so this reading can only move the Harness axis
 * confidence — `applyContradictions` in `src/core/engine/bundle.ts` — never its
 * level.
 *
 * Two signals from `vcsActivity.tests`:
 *   - `prsWithTestsRatio`
 *   - `coverageDelta = coverageEnd - coverageStart`
 *
 *   ratio >= testsHigh (0.7) AND coverageDelta >= 0
 *       → "behavior" tier (`rankBehavior`, 4) — corroborates a high harness
 *   ratio < testsLow (0.4) OR coverageDelta <= coverageDrop (-0.02)
 *       → "prompts"  tier (`rankPrompts`, 1) — contradicts a high read, confidence ↓
 *   otherwise
 *       → "memory"   tier (`rankMemory`, 2)
 *
 * Tier → rank is grid calibration (`params`), so the same signal yields a
 * different level under a different preset. `margin` is the normalised distance
 * from `prsWithTestsRatio` to the threshold it was judged against. Single-source:
 * the agreement check is disabled and flagged.
 */

const PARAM_DEFAULTS = {
  testsHigh: 0.7,
  testsLow: 0.4,
  coverageDrop: -0.02,
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

function readTier(ratio: number, coverageDelta: number, p: Params): Tier {
  if (ratio >= p.testsHigh && coverageDelta >= 0) {
    return { rank: p.rankBehavior, label: 'behavior' };
  }
  if (ratio < p.testsLow || coverageDelta <= p.coverageDrop) {
    return { rank: p.rankPrompts, label: 'prompts' };
  }
  return { rank: p.rankMemory, label: 'memory' };
}

/** Normalised distance from the PR-with-tests ratio to the threshold it crossed. */
function marginFor(ratio: number, tier: Tier, p: Params): number {
  const threshold =
    tier.label === 'behavior'
      ? p.testsHigh
      : tier.label === 'prompts'
        ? p.testsLow
        : ratio - p.testsLow <= p.testsHigh - ratio
          ? p.testsLow
          : p.testsHigh;
  return Math.min(1, Math.abs(ratio - threshold) / Math.max(Math.abs(threshold), 1e-9));
}

function describe(
  ratio: number,
  coverageStart: number,
  coverageEnd: number,
  coverageDelta: number,
  tier: Tier,
): Message {
  const p = (n: number): number => Math.round(n * 100);
  const signed = coverageDelta >= 0 ? `+${String(p(coverageDelta))}%` : `-${String(p(Math.abs(coverageDelta)))}%`;
  return msg('criterion.test-enforcement', {
    ratio: p(ratio),
    start: p(coverageStart),
    end: p(coverageEnd),
    signed,
    tier: `tier.${tier.label}`,
  });
}

export const testEnforcement: CriterionEvaluator = {
  id: 'test-enforcement',
  needs: ['vcsActivity'],
  paramDefaults: PARAM_DEFAULTS,

  evaluate(context: CriterionContext): Result<CriterionOutput, MissingPiece> {
    const facts = context.profile.vcsActivity?.tests;
    if (facts === undefined) {
      return err(missingPiece(['vcsActivity'], 'no test facts in the profile'));
    }

    const { prsWithTestsRatio: ratio, coverageStart, coverageEnd } = facts;
    if (ratio === undefined || coverageStart === undefined || coverageEnd === undefined) {
      return err(
        missingPiece(['vcsActivity'], 'need the PR-with-tests ratio and both coverage endpoints'),
      );
    }

    const p: Params = { ...PARAM_DEFAULTS, ...context.params };
    const coverageDelta = coverageEnd - coverageStart;
    const tier = readTier(ratio, coverageDelta, p);

    const level = levelByRank(context.grid, tier.rank) ?? orderedLevels(context.grid)[0];
    if (level === undefined) {
      return err(missingPiece(['vcsActivity'], 'grid declares no levels'));
    }

    return ok({
      levelId: level.id,
      rawValue: tier.label,
      confidence: {
        agreement: 1,
        margin: marginFor(ratio, tier, p),
        sufficiency: 1,
        singleSource: true,
      },
      evidence: describe(ratio, coverageStart, coverageEnd, coverageDelta, tier),
    });
  },
};
