import { describe, expect, it } from 'vitest';
import { loopConvergence } from './loop-convergence.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { CiFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  opts: { loop?: boolean | undefined; ci?: Partial<CiFacts> | null },
  params: Record<string, number> = {},
): ReturnType<typeof loopConvergence.evaluate> {
  const loop = 'loop' in opts ? opts.loop : true;
  const ci = 'ci' in opts ? opts.ci : {};
  return loopConvergence.evaluate({
    profile: makeProfile({
      available: ['toolingContext', 'vcsActivity'],
      toolingContext: {
        projectMemoryPresent: false,
        projectMemoryLastUpdated: undefined,
        rulesCount: 0,
        skillsCount: 0,
        agentsCount: 0,
        hooksCount: 0,
        autoRetryLoopPresent: loop,
        declaredAssistantTools: [],
        editorIntegration: undefined,
        sessionsPerWeek: undefined,
        tokensPerWeek: undefined,
      },
      vcsActivity: {
        pullRequests: undefined,
        rawPullRequests: undefined,
        commits: undefined,
        tests: undefined,
        parallelism: undefined,
        ci:
          ci === null
            ? undefined
            : { failureRate: undefined, medianRunsToGreen: undefined, ...ci },
      },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('loopConvergence', () => {
  it('does not cap when no auto-retry loop is claimed — the criterion only judges loops', () => {
    const out = run({ loop: false, ci: { medianRunsToGreen: 9, failureRate: 0.9 } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The grid's top level: a cap reading at the ceiling never sits below an
      // elected winner, so `applyCaps` ignores it.
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-loop');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('does not cap when autoRetryLoopPresent is undefined', () => {
    const out = run({ loop: undefined, ci: { medianRunsToGreen: 9 } });
    expect(out.ok && out.value.rawValue).toBe('no-loop');
    expect(out.ok && out.value.levelId).toBe('l6');
  });

  it('caps non-converging (Copper) when the loop re-runs but CI is slow to green — runsToGreen 6', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 6 } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('non-converging');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps non-converging (Copper) when the loop re-runs but CI fails too often — failureRate 0.4', () => {
    const out = run({ loop: true, ci: { failureRate: 0.4 } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('non-converging');
    }
  });

  it('does not cap when the loop is present and CI converges — runsToGreen 1, failureRate 0.03', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 1, failureRate: 0.03 } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('converging');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads runsToGreen exactly at runsHigh as non-converging', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 4 } });
    expect(out.ok && out.value.rawValue).toBe('non-converging');
  });

  it('reads failureRate exactly at failHigh as non-converging', () => {
    const out = run({ loop: true, ci: { failureRate: 0.3 } });
    expect(out.ok && out.value.rawValue).toBe('non-converging');
  });

  it('honours the grid calibration for the cap rank', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 6 } }, { rankCapNonConverging: 2 });
    expect(out.ok && out.value.levelId).toBe('l2');
  });

  it('honours the grid calibration for the thresholds', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 3 } }, { runsHigh: 3 });
    expect(out.ok && out.value.rawValue).toBe('non-converging');
  });

  it('returns missing-piece when a loop is claimed but there are no CI facts', () => {
    const out = run({ loop: true, ci: null });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('vcsActivity');
    }
  });

  it('returns missing-piece when a loop is claimed but every CI signal is absent', () => {
    const out = run({ loop: true, ci: {} });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when the toolingContext section is absent', () => {
    const out = loopConvergence.evaluate({
      profile: makeProfile({ available: ['vcsActivity'] }),
      grid,
      axisId: 'harness',
      params: {},
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('toolingContext');
    }
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ loop: true, ci: { medianRunsToGreen: 6 } });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });
});
