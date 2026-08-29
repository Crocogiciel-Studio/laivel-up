import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  DeclaredProfile,
  Dossier,
  DossierSection,
  StaticAnalysis,
  ToolingContext,
  VcsActivity,
  WorkSession,
} from '../../core/model/dossier.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { DossierSource, SourceError } from '../../core/ports/io.js';
import { sourceError } from '../../core/ports/io.js';

const profileSchema = z.object({
  profile_id: z.string().min(1),
  role: z.string().optional(),
  experience_years: z.number().optional(),
  stack: z.array(z.string()).default([]),
  team_size: z.number().optional(),
  available: z.array(z.string()).default([]),
  note: z.string().optional(),
});

const sizeDistSchema = z.object({
  xs: z.number().default(0),
  s: z.number().default(0),
  m: z.number().default(0),
  l: z.number().default(0),
  xl: z.number().default(0),
});

const gitActivitySchema = z.object({
  pull_requests: z
    .object({
      total: z.number().optional(),
      size_distribution: sizeDistSchema.optional(),
      median_files_changed: z.number().optional(),
      median_lines_changed: z.number().optional(),
      median_correction_commits_after_open: z.number().optional(),
      merged_without_human_edit_after_open: z.number().optional(),
      reverted: z.number().optional(),
      median_review_comments_received: z.number().optional(),
    })
    .optional(),
  commits: z
    .object({
      total: z.number().optional(),
      median_per_pr: z.number().optional(),
      ai_coauthored_ratio: z.number().optional(),
      message_convention_compliance: z.number().optional(),
    })
    .optional(),
  tests: z
    .object({
      coverage_start: z.number().optional(),
      coverage_end: z.number().optional(),
      prs_with_tests_ratio: z.number().optional(),
    })
    .optional(),
  parallelism: z
    .object({
      max_concurrent_branches: z.number().optional(),
      median_concurrent_branches: z.number().optional(),
    })
    .optional(),
  ci: z
    .object({
      failure_rate: z.number().optional(),
      median_runs_to_green: z.number().optional(),
    })
    .optional(),
  context_files: z
    .object({
      agents_md: z.boolean().optional(),
      rules_count: z.number().optional(),
      skills_count: z.number().optional(),
      hooks_count: z.number().optional(),
      agents_count: z.number().optional(),
      auto_retry_loop: z.boolean().optional(),
      last_updated: z.string().nullish(),
    })
    .optional(),
  assistant_usage: z
    .object({
      declared_tools: z.array(z.string()).default([]),
      editor_integration: z.boolean().optional(),
      sessions_per_week: z.number().optional(),
      tokens_per_week: z.number().optional(),
    })
    .optional(),
});

const sonarSchema = z.object({
  component: z.object({
    measures: z.array(z.object({ metric: z.string(), value: z.string() })).default([]),
  }),
});

function issuesOf(error: z.ZodError, file: string): readonly string[] {
  return error.issues.map((issue) => {
    const path = [file, ...issue.path.map(String)].join('.');
    return `${path}: ${issue.message}`;
  });
}

function readJson(dir: string, name: string): Result<unknown, SourceError> {
  const path = join(dir, name);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    return err(sourceError(`cannot read ${name}`, [String(cause)]));
  }
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch (cause) {
    return err(sourceError(`${name} is not valid JSON`, [String(cause)]));
  }
}

function toNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildDeclared(
  profile: z.infer<typeof profileSchema>,
  declaratifText: string | undefined,
): DeclaredProfile {
  const notes: string[] = [];
  if (profile.note !== undefined) notes.push(profile.note);
  if (declaratifText !== undefined) notes.push(declaratifText.trim());
  return {
    stack: profile.stack,
    teamSize: profile.team_size,
    selfAssessedLevel: undefined,
    notes,
  };
}

function buildVcsActivity(ga: z.infer<typeof gitActivitySchema>): VcsActivity {
  return {
    pullRequests:
      ga.pull_requests === undefined
        ? undefined
        : {
            total: ga.pull_requests.total,
            sizeDistribution: ga.pull_requests.size_distribution,
            medianFilesChanged: ga.pull_requests.median_files_changed,
            medianLinesChanged: ga.pull_requests.median_lines_changed,
            medianCorrectionCommitsAfterOpen:
              ga.pull_requests.median_correction_commits_after_open,
            mergedWithoutHumanEditRatio: ratio(
              ga.pull_requests.merged_without_human_edit_after_open,
              ga.pull_requests.total,
            ),
            revertedRatio: ratio(ga.pull_requests.reverted, ga.pull_requests.total),
            medianReviewComments: ga.pull_requests.median_review_comments_received,
          },
    commits:
      ga.commits === undefined
        ? undefined
        : {
            aiCoauthoredRatio: ga.commits.ai_coauthored_ratio,
            messageConventionCompliance: ga.commits.message_convention_compliance,
            medianPerPr: ga.commits.median_per_pr,
          },
    tests:
      ga.tests === undefined
        ? undefined
        : {
            coverageStart: ga.tests.coverage_start,
            coverageEnd: ga.tests.coverage_end,
            prsWithTestsRatio: ga.tests.prs_with_tests_ratio,
          },
    parallelism:
      ga.parallelism === undefined
        ? undefined
        : {
            maxConcurrentBranches: ga.parallelism.max_concurrent_branches,
            medianConcurrentBranches: ga.parallelism.median_concurrent_branches,
          },
    ci:
      ga.ci === undefined
        ? undefined
        : {
            failureRate: ga.ci.failure_rate,
            medianRunsToGreen: ga.ci.median_runs_to_green,
          },
  };
}

function ratio(part: number | undefined, whole: number | undefined): number | undefined {
  if (part === undefined || whole === undefined || whole === 0) return undefined;
  return part / whole;
}

function buildToolingContext(ga: z.infer<typeof gitActivitySchema>): ToolingContext {
  const cf = ga.context_files;
  const au = ga.assistant_usage;
  return {
    projectMemoryPresent: cf?.agents_md ?? false,
    projectMemoryLastUpdated: cf?.last_updated ?? undefined,
    rulesCount: cf?.rules_count ?? 0,
    skillsCount: cf?.skills_count ?? 0,
    agentsCount: cf?.agents_count ?? 0,
    hooksCount: cf?.hooks_count ?? 0,
    autoRetryLoopPresent: cf?.auto_retry_loop,
    declaredAssistantTools: au?.declared_tools ?? [],
    editorIntegration: au?.editor_integration,
  };
}

function buildStaticAnalysis(sonar: z.infer<typeof sonarSchema>): StaticAnalysis {
  const measures = new Map<string, number>();
  for (const m of sonar.component.measures) {
    const n = toNumber(m.value);
    if (n !== undefined) measures.set(m.metric, n);
  }
  return {
    ncloc: measures.get('ncloc'),
    coverage: measures.get('coverage'),
    complexity: measures.get('complexity'),
    cognitiveComplexity: measures.get('cognitive_complexity'),
    codeSmells: measures.get('code_smells'),
    bugs: measures.get('bugs'),
    duplicatedLinesDensity: measures.get('duplicated_lines_density'),
    sqaleIndex: measures.get('sqale_index'),
  };
}

function buildWorkSession(text: string): WorkSession {
  return {
    promptToCommitSteps: undefined,
    humanInterventionsMidTask: undefined,
    framingOnly: undefined,
    rawText: text.trim(),
  };
}

/** Parse a subject profile directory (the `profiles/<name>/` layout) into a dossier. */
export function readDossierFromDirectory(dir: string): Result<Dossier, SourceError> {
  const profileRead = readJson(dir, 'profile.json');
  if (!profileRead.ok) return profileRead;
  const profileParsed = profileSchema.safeParse(profileRead.value);
  if (!profileParsed.success) {
    return err(
      sourceError('profile.json is invalid', issuesOf(profileParsed.error, 'profile.json')),
    );
  }
  const profile = profileParsed.data;
  const available: DossierSection[] = ['declared'];

  let vcsActivity: VcsActivity | undefined;
  let toolingContext: ToolingContext | undefined;
  if (existsSync(join(dir, 'git-activity.json'))) {
    const gaRead = readJson(dir, 'git-activity.json');
    if (!gaRead.ok) return gaRead;
    const gaParsed = gitActivitySchema.safeParse(gaRead.value);
    if (!gaParsed.success) {
      return err(
        sourceError(
          'git-activity.json is invalid',
          issuesOf(gaParsed.error, 'git-activity.json'),
        ),
      );
    }
    vcsActivity = buildVcsActivity(gaParsed.data);
    toolingContext = buildToolingContext(gaParsed.data);
    available.push('vcsActivity', 'toolingContext');
  }

  let staticAnalysis: StaticAnalysis | undefined;
  if (existsSync(join(dir, 'sonar-measures.json'))) {
    const sonarRead = readJson(dir, 'sonar-measures.json');
    if (!sonarRead.ok) return sonarRead;
    const sonarParsed = sonarSchema.safeParse(sonarRead.value);
    if (!sonarParsed.success) {
      return err(
        sourceError(
          'sonar-measures.json is invalid',
          issuesOf(sonarParsed.error, 'sonar-measures.json'),
        ),
      );
    }
    staticAnalysis = buildStaticAnalysis(sonarParsed.data);
    available.push('staticAnalysis');
  }

  const declaratifPath = join(dir, 'declaratif.md');
  const declaratifText = existsSync(declaratifPath)
    ? readFileSync(declaratifPath, 'utf8')
    : undefined;

  let workSession: WorkSession | undefined;
  const sessionPath = join(dir, 'session.md');
  if (existsSync(sessionPath)) {
    workSession = buildWorkSession(readFileSync(sessionPath, 'utf8'));
    available.push('workSession');
  }

  const dossier: Dossier = {
    subject: {
      id: profile.profile_id,
      role: profile.role,
      experienceYears: profile.experience_years,
    },
    available,
    declared: buildDeclared(profile, declaratifText),
    vcsActivity,
    staticAnalysis,
    toolingContext,
    workSession,
  };
  return ok(dossier);
}

export function jsonDossierSource(dir: string): DossierSource {
  return { load: () => readDossierFromDirectory(dir) };
}
