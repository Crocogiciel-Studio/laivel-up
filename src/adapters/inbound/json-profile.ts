import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  DeclaredProfile,
  Profile,
  ProfileSection,
  RawPullRequest,
  StaticAnalysis,
  ToolingContext,
  VcsActivity,
  WorkSession,
} from '../../core/model/profile.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { ProfileSource, SourceError } from '../../core/ports/io.js';
import { sourceError } from '../../core/ports/io.js';

const profileSchema = z.object({
  profile_id: z.string().min(1),
  role: z.string().optional(),
  experience_years: z.number().optional(),
  stack: z.array(z.string()).default([]),
  team_size: z.number().optional(),
  available: z.array(z.string()).default([]),
  note: z.string().optional(),
  /** Explicit self-assessment: a grid level id, or a phrase the table below maps. */
  self_assessed_level: z.string().optional(),
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

/** One row of `pull-requests.json`: a GitHub-style PR object, extra keys ignored. */
const rawPullRequestsSchema = z.array(
  z.object({
    changed_files: z.number().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
    commits: z.number().optional(),
    review_comments: z.number().optional(),
  }),
);

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

/**
 * Obvious self-assessment phrasings from `declaratif.md`, each mapped to an AIDD
 * grid level id. Deliberately small and literal: a self-report is unverified
 * input that can only ever lower confidence, so a missed match (→ `undefined`,
 * the criterion abstains) is safer than a wrong one.
 */
const SELF_ASSESSMENT_PHRASES: readonly (readonly [RegExp, string])[] = [
  [/milieu de tableau|milieu du tableau|dans la moyenne|niveau moyen/i, 'blue'],
  [/haut du panier|plut[oô]t avanc[ée]|assez avanc[ée]|niveau avanc[ée]/i, 'green'],
  [/fa[cç]on par d[ée]faut de travailler|par d[ée]faut de travailler/i, 'green'],
  [/d[ée]butant|je d[ée]bute|novice|je commence tout juste/i, 'red'],
];

function mapSelfAssessmentPhrase(text: string): string | undefined {
  for (const [pattern, levelId] of SELF_ASSESSMENT_PHRASES) {
    if (pattern.test(text)) return levelId;
  }
  return undefined;
}

/**
 * An explicit `self_assessed_level` in `profile.json` wins (used verbatim when
 * it is not itself one of the mapped phrases); otherwise scan the free-text
 * self-report for an obvious phrasing.
 */
function extractSelfAssessedLevel(
  explicit: string | undefined,
  selfReportText: string | undefined,
): string | undefined {
  const trimmedExplicit = explicit?.trim();
  if (trimmedExplicit !== undefined && trimmedExplicit.length > 0) {
    return mapSelfAssessmentPhrase(trimmedExplicit) ?? trimmedExplicit;
  }
  if (selfReportText !== undefined) {
    return mapSelfAssessmentPhrase(selfReportText);
  }
  return undefined;
}

function buildDeclared(
  parsed: z.infer<typeof profileSchema>,
  selfReportText: string | undefined,
): DeclaredProfile {
  const notes: string[] = [];
  if (parsed.note !== undefined) notes.push(parsed.note);
  if (selfReportText !== undefined) notes.push(selfReportText.trim());
  return {
    stack: parsed.stack,
    teamSize: parsed.team_size,
    selfAssessedLevel: extractSelfAssessedLevel(parsed.self_assessed_level, selfReportText),
    notes,
  };
}

function buildRawPullRequests(
  parsed: z.infer<typeof rawPullRequestsSchema>,
): readonly RawPullRequest[] {
  return parsed.map((pr) => ({
    changedFiles: pr.changed_files,
    additions: pr.additions,
    deletions: pr.deletions,
    commits: pr.commits,
    reviewComments: pr.review_comments,
  }));
}

function buildVcsActivity(
  ga: z.infer<typeof gitActivitySchema>,
  rawPullRequests: readonly RawPullRequest[] | undefined,
): VcsActivity {
  return {
    rawPullRequests,
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

/**
 * Shallow heuristics read off a `session.md` transcript. The file is a single
 * prompt→commit session written as alternating role turns
 * (`**Personne**` / `**Assistant**`); three coarse signals come from its shape
 * and wording:
 *
 *  - `promptToCommitSteps`  number of human turns — how many prompt→response
 *    rounds it took to reach the commit. Falls back to counting `Étape`/`Step`
 *    headings when the transcript has no role headers.
 *  - `humanInterventionsMidTask`  count of explicit course-corrections in the
 *    human turns: « non, … », « je (te) reprends », « corrige ce … », « plutôt
 *    … », a signalled manual edit (« j'ai corrigé/édité/… »).
 *  - `framingOnly`  `true` when the transcript has turn structure but not one
 *    mid-task correction was detected — the human framed the task and let it run
 *    to the commit.
 *
 * Deliberately regex-based and forgiving. When the text shows no recognisable
 * turn structure every signal is left `undefined` and the criterion abstains.
 */
const HUMAN_TURN_HEADER =
  /^\s*\*\*(?:Personne|Humain|Utilisateur|User|Dev|Développeur)\*\*\s*$/i;
const ASSISTANT_TURN_HEADER =
  /^\s*\*\*(?:Assistant|IA|AI|Agent|Claude|Copilot|Bot)\*\*\s*$/i;
const STEP_HEADING = /^\s*#{1,4}\s+(?:[ÉE]tape|Step|Tour|Turn)\b/i;
const MID_TASK_INTERVENTION =
  /je te reprends|je repr(?:ends|is)|je corrige|corrige[- ](?:moi|ce|cet|cette|le|la|les|[çc]a)|non[,.]|plut[oô]t|j'ai (?:repris|corrig[ée]|[ée]dit[ée]|modifié|réécrit|refait)/gi;

function buildWorkSession(text: string): WorkSession {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);

  const humanLines: string[] = [];
  let humanTurns = 0;
  let inHumanTurn = false;
  for (const line of lines) {
    if (HUMAN_TURN_HEADER.test(line)) {
      humanTurns += 1;
      inHumanTurn = true;
      continue;
    }
    if (ASSISTANT_TURN_HEADER.test(line)) {
      inHumanTurn = false;
      continue;
    }
    if (inHumanTurn) humanLines.push(line);
  }

  const stepHeadings = lines.filter((line) => STEP_HEADING.test(line)).length;

  let promptToCommitSteps: number | undefined;
  if (humanTurns > 0) promptToCommitSteps = humanTurns;
  else if (stepHeadings > 0) promptToCommitSteps = stepHeadings;

  let humanInterventionsMidTask: number | undefined;
  if (promptToCommitSteps !== undefined) {
    const scanned = humanLines.length > 0 ? humanLines.join('\n') : trimmed;
    humanInterventionsMidTask = (scanned.match(MID_TASK_INTERVENTION) ?? []).length;
  }

  const framingOnly =
    humanInterventionsMidTask === undefined ? undefined : humanInterventionsMidTask === 0;

  return {
    promptToCommitSteps,
    humanInterventionsMidTask,
    framingOnly,
    rawText: trimmed,
  };
}

/** Parse a subject's profile directory (the `profiles/<name>/` layout) into a `Profile`. */
export function readProfileFromDirectory(dir: string): Result<Profile, SourceError> {
  const profileRead = readJson(dir, 'profile.json');
  if (!profileRead.ok) return profileRead;
  const profileParsed = profileSchema.safeParse(profileRead.value);
  if (!profileParsed.success) {
    return err(
      sourceError('profile.json is invalid', issuesOf(profileParsed.error, 'profile.json')),
    );
  }
  const parsed = profileParsed.data;
  const available: ProfileSection[] = ['declared'];

  let rawPullRequests: readonly RawPullRequest[] | undefined;
  if (existsSync(join(dir, 'pull-requests.json'))) {
    const prRead = readJson(dir, 'pull-requests.json');
    if (!prRead.ok) return prRead;
    const prParsed = rawPullRequestsSchema.safeParse(prRead.value);
    if (!prParsed.success) {
      return err(
        sourceError(
          'pull-requests.json is invalid',
          issuesOf(prParsed.error, 'pull-requests.json'),
        ),
      );
    }
    rawPullRequests = buildRawPullRequests(prParsed.data);
  }

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
    vcsActivity = buildVcsActivity(gaParsed.data, rawPullRequests);
    toolingContext = buildToolingContext(gaParsed.data);
    available.push('vcsActivity', 'toolingContext');
  } else if (rawPullRequests !== undefined) {
    vcsActivity = {
      pullRequests: undefined,
      rawPullRequests,
      commits: undefined,
      tests: undefined,
      parallelism: undefined,
      ci: undefined,
    };
    available.push('vcsActivity');
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

  const selfReportPath = join(dir, 'declaratif.md');
  const selfReportText = existsSync(selfReportPath)
    ? readFileSync(selfReportPath, 'utf8')
    : undefined;

  let workSession: WorkSession | undefined;
  const sessionPath = join(dir, 'session.md');
  if (existsSync(sessionPath)) {
    workSession = buildWorkSession(readFileSync(sessionPath, 'utf8'));
    available.push('workSession');
  }

  const profile: Profile = {
    subject: {
      id: parsed.profile_id,
      role: parsed.role,
      experienceYears: parsed.experience_years,
    },
    available,
    declared: buildDeclared(parsed, selfReportText),
    vcsActivity,
    staticAnalysis,
    toolingContext,
    workSession,
  };
  return ok(profile);
}

export function jsonProfileSource(dir: string): ProfileSource {
  return { load: () => readProfileFromDirectory(dir) };
}
