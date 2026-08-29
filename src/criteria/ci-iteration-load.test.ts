import { describe, expect, it } from 'vitest';
import { ciIterationLoad } from './ci-iteration-load.js';
import { makeProfile, makeGrid } from '../../test/support/factories.js';
import type { CiFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  ci: Partial<CiFacts> | null,
  params: Record<string, number> = {},
): ReturnType<typeof ciIterationLoad.evaluate> {
  return ciIterationLoad.evaluate({
    profile: makeProfile({
      available: ['vcsActivity'],
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
    axisId: 'intervention',
    params,
  });
}

describe('ciIterationLoad', () => {
  it('reads band 0 (after most) like perceval — 3 runs to green, 34% failure', () => {
    const out = run({ medianRunsToGreen: 3, failureRate: 0.34 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('after-most');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads band 1 (after some) like bohort — 2 runs to green, 12% failure', () => {
    const out = run({ medianRunsToGreen: 2, failureRate: 0.12 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('after-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads band 2 (key stages) like leodagan — 1 run to green, 4% failure', () => {
    const out = run({ medianRunsToGreen: 1, failureRate: 0.04 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('key-stages');
    }
  });

  it('lets the worst signal win like arthur — 2 runs (after some) but 7% failure (key stages)', () => {
    const out = run({ medianRunsToGreen: 2, failureRate: 0.07 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('after-some');
    }
  });

  it('lets a bad failure rate drag down a clean runs-to-green', () => {
    const out = run({ medianRunsToGreen: 1, failureRate: 0.5 });
    expect(out.ok && out.value.rawValue).toBe('after-most');
    expect(out.ok && out.value.levelId).toBe('l1');
  });

  it('reads a single signal when the other is absent — runs only', () => {
    const out = run({ medianRunsToGreen: 1 });
    expect(out.ok && out.value.rawValue).toBe('key-stages');
  });

  it('reads a single signal when the other is absent — failure only', () => {
    const out = run({ failureRate: 0.34 });
    expect(out.ok && out.value.rawValue).toBe('after-most');
  });

  it('honours the grid calibration for the band ranks', () => {
    const out = run({ medianRunsToGreen: 3, failureRate: 0.34 }, { rankAfterMost: 5 });
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('honours the grid calibration for the thresholds', () => {
    const out = run({ medianRunsToGreen: 2 }, { runsAfterMost: 2 });
    expect(out.ok && out.value.rawValue).toBe('after-most');
  });

  it('reads the boundary value exactly at runsAfterSome as band 1', () => {
    const out = run({ medianRunsToGreen: 2 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('after-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads the boundary value exactly at failAfterSome as band 1', () => {
    const out = run({ failureRate: 0.08 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('after-some');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('is more confident at the centre of band 1 than at either of its edges', () => {
    const lowerEdge = run({ failureRate: 0.1 });
    const centre = run({ failureRate: 0.165 }); // band 1's centre ([0.08, 0.25])
    const upperEdge = run({ failureRate: 0.24 });
    expect(lowerEdge.ok && centre.ok && upperEdge.ok).toBe(true);
    if (lowerEdge.ok && centre.ok && upperEdge.ok) {
      expect(lowerEdge.value.rawValue).toBe('after-some');
      expect(centre.value.rawValue).toBe('after-some');
      expect(upperEdge.value.rawValue).toBe('after-some');
      expect(centre.value.confidence.margin).toBeGreaterThan(lowerEdge.value.confidence.margin);
      expect(centre.value.confidence.margin).toBeGreaterThan(upperEdge.value.confidence.margin);
    }
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ medianRunsToGreen: 1, failureRate: 0.04 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('returns missing-piece when the CI section is absent', () => {
    const out = run(null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('vcsActivity');
    }
  });

  it('returns missing-piece when every CI iteration signal is absent', () => {
    const out = run({});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
