import type { Profile, PullRequestFacts, RawPullRequest } from '../../src/core/model/profile.js';
import type { Grid } from '../../src/core/model/grid.js';
import type { CriterionReading } from '../../src/core/model/evaluation.js';
import type {
  CriterionEvaluator,
  CriterionOutput,
} from '../../src/core/ports/criterion-evaluator.js';
import { ok } from '../../src/core/model/result.js';

export function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: 'test',
    label: 'Test grid',
    levels: [
      { id: 'l0', label: 'L0', rank: 0 },
      { id: 'l1', label: 'L1', rank: 1 },
      { id: 'l2', label: 'L2', rank: 2 },
      { id: 'l3', label: 'L3', rank: 3 },
      { id: 'l4', label: 'L4', rank: 4 },
      { id: 'l5', label: 'L5', rank: 5 },
      { id: 'l6', label: 'L6', rank: 6 },
    ],
    axes: [{ id: 'a', label: 'Axis A', bundle: [] }],
    axisAggregation: 'confidence-weighted-vote',
    globalAggregation: 'min-across-axes',
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    subject: { id: 'subj', role: undefined, experienceYears: undefined },
    available: [],
    declared: undefined,
    vcsActivity: undefined,
    staticAnalysis: undefined,
    toolingContext: undefined,
    workSession: undefined,
    ...overrides,
  };
}

/** A profile whose only section is `vcsActivity.pullRequests`, every fact `undefined` bar the given ones. */
export function makePrProfile(pr: Partial<PullRequestFacts> = {}): Profile {
  return makeProfile({
    available: ['vcsActivity'],
    vcsActivity: {
      pullRequests: {
        total: undefined,
        sizeDistribution: undefined,
        medianFilesChanged: undefined,
        medianLinesChanged: undefined,
        medianCorrectionCommitsAfterOpen: undefined,
        mergedWithoutHumanEditRatio: undefined,
        revertedRatio: undefined,
        medianReviewComments: undefined,
        ...pr,
      },
      rawPullRequests: undefined,
      commits: undefined,
      tests: undefined,
      parallelism: undefined,
      ci: undefined,
    },
  });
}

/** A profile whose only section is `vcsActivity.rawPullRequests`. */
export function makeRawPrProfile(rows: readonly Partial<RawPullRequest>[]): Profile {
  return makeProfile({
    available: ['vcsActivity'],
    vcsActivity: {
      pullRequests: undefined,
      rawPullRequests: rows.map((r) => ({
        changedFiles: undefined,
        additions: undefined,
        deletions: undefined,
        commits: undefined,
        reviewComments: undefined,
        ...r,
      })),
      commits: undefined,
      tests: undefined,
      parallelism: undefined,
      ci: undefined,
    },
  });
}

export function makeReading(overrides: Partial<CriterionReading> = {}): CriterionReading {
  return {
    criterionId: 'c',
    axisId: 'a',
    status: 'read',
    role: 'level',
    levelId: 'l1',
    levelRank: 1,
    rawValue: undefined,
    confidence: 1,
    limitingFactor: 'none',
    evidence: 'test',
    ...overrides,
  };
}

/** A criterion that always reads the given level with full confidence. */
export function fixedEvaluator(
  id: string,
  output: Pick<CriterionOutput, 'levelId'> & Partial<CriterionOutput>,
): CriterionEvaluator {
  return {
    id,
    needs: [],
    evaluate: () =>
      ok({
        levelId: output.levelId,
        rawValue: output.rawValue ?? 0,
        confidence: output.confidence ?? {
          agreement: 1,
          margin: 1,
          sufficiency: 1,
          singleSource: true,
        },
        evidence: output.evidence ?? `fixed ${id}`,
      }),
  };
}
