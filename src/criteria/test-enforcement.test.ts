import { describe, expect, it } from 'vitest';
import { testEnforcement } from './test-enforcement.js';
import { evidenceText } from '../../test/support/evidence.js';
import { makeGrid, makeProfile } from '../../test/support/factories.js';
import type { TestFacts } from '../core/model/profile.js';

const grid = makeGrid();

function run(
  tests: Partial<TestFacts> | undefined,
  params: Record<string, number> = {},
): ReturnType<typeof testEnforcement.evaluate> {
  return testEnforcement.evaluate({
    profile: makeProfile({
      available: tests === undefined ? [] : ['vcsActivity'],
      vcsActivity: {
        pullRequests: undefined,
        rawPullRequests: undefined,
        commits: undefined,
        tests:
          tests === undefined
            ? undefined
            : {
                coverageStart: undefined,
                coverageEnd: undefined,
                prsWithTestsRatio: undefined,
                ...tests,
              },
        parallelism: undefined,
        ci: undefined,
      },
    }),
    grid,
    axisId: 'harness',
    params,
  });
}

describe('testEnforcement', () => {
  it('is a confidence-role helper: single-source, never leans on agreement', () => {
    const out = run({ prsWithTestsRatio: 0.9, coverageStart: 0.5, coverageEnd: 0.6 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.confidence.singleSource).toBe(true);
      expect(out.value.confidence.agreement).toBe(1);
      expect(out.value.confidence.sufficiency).toBe(1);
    }
  });

  it('perceval — 0.29 ratio / -0.03 coverage: reads "prompts", contradicts a high harness', () => {
    const out = run({ prsWithTestsRatio: 0.29, coverageStart: 0.44, coverageEnd: 0.41 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('prompts');
      expect(out.value.confidence.margin).toBeCloseTo(0.11 / 0.4, 5);
    }
  });

  it('bohort — 0.71 ratio / +0.21 coverage: reads "behavior", corroborates', () => {
    const out = run({ prsWithTestsRatio: 0.71, coverageStart: 0.47, coverageEnd: 0.68 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l4');
      expect(out.value.rawValue).toBe('behavior');
      expect(evidenceText(out.value.evidence)).toContain('+21%');
    }
  });

  it('leodagan — 0.93 ratio / +0.22 coverage: reads "behavior"', () => {
    const out = run({ prsWithTestsRatio: 0.93, coverageStart: 0.62, coverageEnd: 0.84 });
    expect(out.ok && out.value.levelId).toBe('l4');
    expect(out.ok && out.value.rawValue).toBe('behavior');
  });

  it('arthur — 0.88 ratio / +0.21 coverage: reads "behavior"', () => {
    const out = run({ prsWithTestsRatio: 0.88, coverageStart: 0.58, coverageEnd: 0.79 });
    expect(out.ok && out.value.levelId).toBe('l4');
    expect(out.ok && out.value.rawValue).toBe('behavior');
  });

  it('a strong test ratio cannot reach "behavior" while coverage falls past the drop', () => {
    const out = run({ prsWithTestsRatio: 0.8, coverageStart: 0.5, coverageEnd: 0.45 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l1');
      expect(out.value.rawValue).toBe('prompts');
      expect(out.value.confidence.margin).toBeCloseTo(1, 5);
    }
  });

  it('a strong test ratio with coverage flat-but-above-the-drop lands in "memory"', () => {
    const out = run({ prsWithTestsRatio: 0.8, coverageStart: 0.5, coverageEnd: 0.49 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.levelId).toBe('l2');
      expect(out.value.rawValue).toBe('memory');
    }
  });

  it('a mid ratio with rising coverage lands in "memory"', () => {
    const out = run({ prsWithTestsRatio: 0.5, coverageStart: 0.5, coverageEnd: 0.5 });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.rawValue).toBe('memory');
      expect(out.value.confidence.margin).toBeCloseTo(0.1 / 0.4, 5);
    }
  });

  it('margin is the normalised distance from the ratio to the crossed threshold', () => {
    const out = run({ prsWithTestsRatio: 0.9, coverageStart: 0.5, coverageEnd: 0.6 });
    expect(out.ok && out.value.confidence.margin).toBeCloseTo(0.2 / 0.7, 5);
  });

  it('honours the grid calibration for the tier ranks', () => {
    const out = run(
      { prsWithTestsRatio: 0.9, coverageStart: 0.5, coverageEnd: 0.6 },
      { rankBehavior: 5 },
    );
    expect(out.ok && out.value.levelId).toBe('l5');
  });

  it('honours the grid calibration for the high-ratio threshold', () => {
    const out = run(
      { prsWithTestsRatio: 0.71, coverageStart: 0.47, coverageEnd: 0.68 },
      { testsHigh: 0.95 },
    );
    expect(out.ok && out.value.rawValue).toBe('memory');
  });

  it('returns missing-piece when the profile carries no test facts', () => {
    const out = run(undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe('missing-piece');
      expect(out.error.needed).toContain('vcsActivity');
    }
  });

  it('returns missing-piece when the PR-with-tests ratio is absent', () => {
    const out = run({ coverageStart: 0.5, coverageEnd: 0.6 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });

  it('returns missing-piece when a coverage endpoint is absent', () => {
    const out = run({ prsWithTestsRatio: 0.8, coverageStart: 0.5 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe('missing-piece');
  });
});
