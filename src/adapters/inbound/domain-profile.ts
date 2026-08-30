import { z } from 'zod';
import type {
  CiFacts,
  CommitFacts,
  DeclaredProfile,
  ParallelismFacts,
  Profile,
  ProfileSection,
  PrSizeDistribution,
  PullRequestFacts,
  RawPullRequest,
  StaticAnalysis,
  TestFacts,
  ToolingContext,
  VcsActivity,
  WorkSession,
} from '../../core/model/profile.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { SourceError } from '../../core/ports/io.js';
import { sourceError } from '../../core/ports/io.js';

/**
 * Inbound adapter for a profile authored in the studio: the domain `Profile`
 * itself, stored as one JSON object (a table row's `body`). The file-tree
 * adapter (`readProfileFromDirectory`) reduces a forge export down to this same
 * shape -- this one just validates a body that already has it.
 *
 * `available` is derived from which sections are present, so the form's
 * present/absent toggles are the single source of truth. An explicit
 * `available` is accepted only when it agrees with the sections supplied.
 */

// Order matches what `readProfileFromDirectory` pushes onto `available`, so a
// forge-exported Profile round-trips through the studio unchanged.
const SECTIONS = [
  'declared',
  'vcsActivity',
  'toolingContext',
  'staticAnalysis',
  'workSession',
] as const;

const num = z.number().optional();
const bool = z.boolean().optional();

const subjectSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1).optional(),
  experienceYears: z.number().optional(),
});

const declaredSchema = z.object({
  stack: z.array(z.string()).default([]),
  teamSize: num,
  selfAssessedLevel: z.string().min(1).optional(),
  notes: z.array(z.string()).default([]),
});

const sizeDistributionSchema = z.object({
  xs: z.number(),
  s: z.number(),
  m: z.number(),
  l: z.number(),
  xl: z.number(),
});

const pullRequestFactsSchema = z.object({
  total: num,
  sizeDistribution: sizeDistributionSchema.optional(),
  medianFilesChanged: num,
  medianLinesChanged: num,
  medianCorrectionCommitsAfterOpen: num,
  mergedWithoutHumanEditRatio: num,
  revertedRatio: num,
  medianReviewComments: num,
});

const rawPullRequestSchema = z.object({
  changedFiles: num,
  additions: num,
  deletions: num,
  commits: num,
  reviewComments: num,
});

const commitFactsSchema = z.object({
  aiCoauthoredRatio: num,
  messageConventionCompliance: num,
  medianPerPr: num,
});

const testFactsSchema = z.object({
  coverageStart: num,
  coverageEnd: num,
  prsWithTestsRatio: num,
});

const parallelismFactsSchema = z.object({
  maxConcurrentBranches: num,
  medianConcurrentBranches: num,
});

const ciFactsSchema = z.object({
  failureRate: num,
  medianRunsToGreen: num,
});

const vcsActivitySchema = z.object({
  pullRequests: pullRequestFactsSchema.optional(),
  rawPullRequests: z.array(rawPullRequestSchema).optional(),
  commits: commitFactsSchema.optional(),
  tests: testFactsSchema.optional(),
  parallelism: parallelismFactsSchema.optional(),
  ci: ciFactsSchema.optional(),
});

const staticAnalysisSchema = z.object({
  ncloc: num,
  coverage: num,
  complexity: num,
  cognitiveComplexity: num,
  codeSmells: num,
  bugs: num,
  duplicatedLinesDensity: num,
  sqaleIndex: num,
});

const toolingContextSchema = z.object({
  projectMemoryPresent: z.boolean(),
  projectMemoryLastUpdated: z.string().min(1).optional(),
  rulesCount: z.number().int().nonnegative(),
  skillsCount: z.number().int().nonnegative(),
  agentsCount: z.number().int().nonnegative(),
  hooksCount: z.number().int().nonnegative(),
  autoRetryLoopPresent: bool,
  declaredAssistantTools: z.array(z.string()).default([]),
  editorIntegration: bool,
  sessionsPerWeek: num,
  tokensPerWeek: num,
});

const workSessionSchema = z.object({
  promptToCommitSteps: num,
  humanInterventionsMidTask: num,
  framingOnly: bool,
  rawText: z.string().optional(),
});

const profileSchema = z.object({
  subject: subjectSchema,
  available: z.array(z.enum(SECTIONS)).optional(),
  declared: declaredSchema.optional(),
  vcsActivity: vcsActivitySchema.optional(),
  staticAnalysis: staticAnalysisSchema.optional(),
  toolingContext: toolingContextSchema.optional(),
  workSession: workSessionSchema.optional(),
});

function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

function declaredOf(v: z.infer<typeof declaredSchema>): DeclaredProfile {
  return {
    stack: v.stack,
    teamSize: v.teamSize,
    selfAssessedLevel: v.selfAssessedLevel,
    notes: v.notes,
  };
}

function sizeDistributionOf(
  v: z.infer<typeof sizeDistributionSchema> | undefined,
): PrSizeDistribution | undefined {
  return v === undefined ? undefined : { xs: v.xs, s: v.s, m: v.m, l: v.l, xl: v.xl };
}

function pullRequestFactsOf(
  v: z.infer<typeof pullRequestFactsSchema> | undefined,
): PullRequestFacts | undefined {
  if (v === undefined) return undefined;
  return {
    total: v.total,
    sizeDistribution: sizeDistributionOf(v.sizeDistribution),
    medianFilesChanged: v.medianFilesChanged,
    medianLinesChanged: v.medianLinesChanged,
    medianCorrectionCommitsAfterOpen: v.medianCorrectionCommitsAfterOpen,
    mergedWithoutHumanEditRatio: v.mergedWithoutHumanEditRatio,
    revertedRatio: v.revertedRatio,
    medianReviewComments: v.medianReviewComments,
  };
}

function rawPullRequestsOf(
  v: readonly z.infer<typeof rawPullRequestSchema>[] | undefined,
): readonly RawPullRequest[] | undefined {
  return v?.map((pr) => ({
    changedFiles: pr.changedFiles,
    additions: pr.additions,
    deletions: pr.deletions,
    commits: pr.commits,
    reviewComments: pr.reviewComments,
  }));
}

function commitFactsOf(
  v: z.infer<typeof commitFactsSchema> | undefined,
): CommitFacts | undefined {
  if (v === undefined) return undefined;
  return {
    aiCoauthoredRatio: v.aiCoauthoredRatio,
    messageConventionCompliance: v.messageConventionCompliance,
    medianPerPr: v.medianPerPr,
  };
}

function testFactsOf(v: z.infer<typeof testFactsSchema> | undefined): TestFacts | undefined {
  if (v === undefined) return undefined;
  return {
    coverageStart: v.coverageStart,
    coverageEnd: v.coverageEnd,
    prsWithTestsRatio: v.prsWithTestsRatio,
  };
}

function parallelismFactsOf(
  v: z.infer<typeof parallelismFactsSchema> | undefined,
): ParallelismFacts | undefined {
  if (v === undefined) return undefined;
  return {
    maxConcurrentBranches: v.maxConcurrentBranches,
    medianConcurrentBranches: v.medianConcurrentBranches,
  };
}

function ciFactsOf(v: z.infer<typeof ciFactsSchema> | undefined): CiFacts | undefined {
  if (v === undefined) return undefined;
  return { failureRate: v.failureRate, medianRunsToGreen: v.medianRunsToGreen };
}

function vcsActivityOf(
  v: z.infer<typeof vcsActivitySchema> | undefined,
): VcsActivity | undefined {
  if (v === undefined) return undefined;
  return {
    pullRequests: pullRequestFactsOf(v.pullRequests),
    rawPullRequests: rawPullRequestsOf(v.rawPullRequests),
    commits: commitFactsOf(v.commits),
    tests: testFactsOf(v.tests),
    parallelism: parallelismFactsOf(v.parallelism),
    ci: ciFactsOf(v.ci),
  };
}

function staticAnalysisOf(
  v: z.infer<typeof staticAnalysisSchema> | undefined,
): StaticAnalysis | undefined {
  if (v === undefined) return undefined;
  return {
    ncloc: v.ncloc,
    coverage: v.coverage,
    complexity: v.complexity,
    cognitiveComplexity: v.cognitiveComplexity,
    codeSmells: v.codeSmells,
    bugs: v.bugs,
    duplicatedLinesDensity: v.duplicatedLinesDensity,
    sqaleIndex: v.sqaleIndex,
  };
}

function toolingContextOf(
  v: z.infer<typeof toolingContextSchema> | undefined,
): ToolingContext | undefined {
  if (v === undefined) return undefined;
  return {
    projectMemoryPresent: v.projectMemoryPresent,
    projectMemoryLastUpdated: v.projectMemoryLastUpdated,
    rulesCount: v.rulesCount,
    skillsCount: v.skillsCount,
    agentsCount: v.agentsCount,
    hooksCount: v.hooksCount,
    autoRetryLoopPresent: v.autoRetryLoopPresent,
    declaredAssistantTools: v.declaredAssistantTools,
    editorIntegration: v.editorIntegration,
    sessionsPerWeek: v.sessionsPerWeek,
    tokensPerWeek: v.tokensPerWeek,
  };
}

function workSessionOf(
  v: z.infer<typeof workSessionSchema> | undefined,
): WorkSession | undefined {
  if (v === undefined) return undefined;
  return {
    promptToCommitSteps: v.promptToCommitSteps,
    humanInterventionsMidTask: v.humanInterventionsMidTask,
    framingOnly: v.framingOnly,
    rawText: v.rawText,
  };
}

export function parseProfile(input: unknown): Result<Profile, SourceError> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return err(sourceError('profile is invalid', issuesOf(parsed.error)));
  }
  const v = parsed.data;

  const declared = v.declared === undefined ? undefined : declaredOf(v.declared);
  const vcsActivity = vcsActivityOf(v.vcsActivity);
  const staticAnalysis = staticAnalysisOf(v.staticAnalysis);
  const toolingContext = toolingContextOf(v.toolingContext);
  const workSession = workSessionOf(v.workSession);

  const present = SECTIONS.filter((section) => {
    switch (section) {
      case 'declared':
        return declared !== undefined;
      case 'vcsActivity':
        return vcsActivity !== undefined;
      case 'staticAnalysis':
        return staticAnalysis !== undefined;
      case 'toolingContext':
        return toolingContext !== undefined;
      case 'workSession':
        return workSession !== undefined;
    }
  });

  if (v.available !== undefined) {
    const listed = new Set<ProfileSection>(v.available);
    const presentSet = new Set<ProfileSection>(present);
    const mismatch: string[] = [];
    for (const section of listed) {
      if (!presentSet.has(section)) {
        mismatch.push(`available lists "${section}" but that section is absent`);
      }
    }
    for (const section of presentSet) {
      if (!listed.has(section)) {
        mismatch.push(`section "${section}" is present but missing from available`);
      }
    }
    if (mismatch.length > 0) {
      return err(sourceError('profile is invalid', mismatch));
    }
  }

  return ok({
    subject: {
      id: v.subject.id,
      role: v.subject.role,
      experienceYears: v.subject.experienceYears,
    },
    available: present,
    declared,
    vcsActivity,
    staticAnalysis,
    toolingContext,
    workSession,
  });
}
