import { describe, expect, it } from 'vitest';
import { commitDiscipline } from './commit-discipline.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { CommitFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  commits: Partial<CommitFacts> | null,
  params: Record<string, number> = {},
): ReturnType<typeof commitDiscipline.evaluate> {
  return commitDiscipline.evaluate({
    profile: makeProfile({
      available: ['vcsActivity'],
      vcsActivity: {
        pullRequests: undefined,
        rawPullRequests: undefined,
        commits:
          commits === null
            ? undefined
            : {
                aiCoauthoredRatio: undefined,
                messageConventionCompliance: undefined,
                medianPerPr: undefined,
                ...commits,
              },
        tests: undefined,
        parallelism: undefined,
        ci: undefined,
      },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('commitDiscipline', () => {
  it('caps at prompts when the AI co-authored ratio is ridiculous — ratio 0.1', () => {
    const out = run({ aiCoauthoredRatio: 0.1 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('cap-hard');
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('caps at memory when the ratio clears aiFloorHard only — ratio 0.3', () => {
    const out = run({ aiCoauthoredRatio: 0.3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('cap-soft');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('does not cap when the ratio clears aiFloorSoft — ratio 0.6', () => {
    const out = run({ aiCoauthoredRatio: 0.6 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      // The grid's top level: a cap reading at the ceiling never sits below an
      // elected winner, so `applyCaps` ignores it.
      expect(out.value.levelId).toBe('l6');
      expect(out.value.rawValue).toBe('no-cap');
    }
  });

  it('caps perceval at prompts — ratio 0.04, well under aiFloorHard', () => {
    const out = run({ aiCoauthoredRatio: 0.04 });
    expect(out.ok && out.value.levelId).toBe('l1');
    expect(out.ok && out.value.rawValue).toBe('cap-hard');
  });

  it('does not cap bohort — ratio 0.58', () => {
    const out = run({ aiCoauthoredRatio: 0.58 });
    expect(out.ok && out.value.levelId).toBe('l6');
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap leodagan — ratio 0.87', () => {
    const out = run({ aiCoauthoredRatio: 0.87 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('does not cap arthur — ratio 0.91', () => {
    const out = run({ aiCoauthoredRatio: 0.91 });
    expect(out.ok && out.value.rawValue).toBe('no-cap');
  });

  it('reads the boundary value exactly at aiFloorHard as cap-soft', () => {
    const out = run({ aiCoauthoredRatio: 0.15 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('cap-soft');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('reads the boundary value exactly at aiFloorSoft as no-cap', () => {
    const out = run({ aiCoauthoredRatio: 0.35 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('no-cap');
      expect(out.value.confidence.margin).toBeGreaterThan(0);
    }
  });

  it('honours the grid calibration for the cap ranks', () => {
    const out = run({ aiCoauthoredRatio: 0.1 }, { rankCapHard: 0 });
    expect(out.ok && out.value.levelId).toBe('l0');
  });

  it('honours the grid calibration for the thresholds', () => {
    const out = run({ aiCoauthoredRatio: 0.3 }, { aiFloorHard: 0.4 });
    expect(out.ok && out.value.rawValue).toBe('cap-hard');
  });

  it('always flags single-source and never leans on agreement', () => {
    const out = run({ aiCoauthoredRatio: 0.3 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
    }
  });

  it('returns missing-piece when there are no commit facts', () => {
    const out = run(null);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('vcsActivity');
    }
  });

  it('returns missing-piece when the AI co-authored ratio is absent', () => {
    const out = run({ aiCoauthoredRatio: undefined });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
