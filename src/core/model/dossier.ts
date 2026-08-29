/**
 * The dossier is the engine's normalized view of everything known about one
 * subject. It speaks a portable vocabulary of developer-activity facts — nothing
 * here names a grid, an axis, or "AIDD". Inbound adapters parse raw sources and
 * fill it; a field left `undefined` means "not observed", never "absent / false".
 */

export type DossierSection =
  | 'declared'
  | 'vcsActivity'
  | 'staticAnalysis'
  | 'toolingContext'
  | 'workSession';

export interface SubjectRef {
  readonly id: string;
  readonly role: string | undefined;
  readonly experienceYears: number | undefined;
}

/** Self-reported, explicitly unverified. Can lower confidence, never raise a level. */
export interface DeclaredProfile {
  readonly stack: readonly string[];
  readonly teamSize: number | undefined;
  readonly selfAssessedLevel: string | undefined;
  readonly notes: readonly string[];
}

export interface PrSizeDistribution {
  readonly xs: number;
  readonly s: number;
  readonly m: number;
  readonly l: number;
  readonly xl: number;
}

export interface PullRequestFacts {
  readonly total: number | undefined;
  readonly sizeDistribution: PrSizeDistribution | undefined;
  readonly medianFilesChanged: number | undefined;
  readonly medianLinesChanged: number | undefined;
  readonly medianCorrectionCommitsAfterOpen: number | undefined;
  readonly mergedWithoutHumanEditRatio: number | undefined;
  readonly revertedRatio: number | undefined;
  readonly medianReviewComments: number | undefined;
}

export interface CommitFacts {
  readonly aiCoauthoredRatio: number | undefined;
  readonly messageConventionCompliance: number | undefined;
  readonly medianPerPr: number | undefined;
}

export interface TestFacts {
  readonly coverageStart: number | undefined;
  readonly coverageEnd: number | undefined;
  readonly prsWithTestsRatio: number | undefined;
}

export interface ParallelismFacts {
  readonly maxConcurrentBranches: number | undefined;
  readonly medianConcurrentBranches: number | undefined;
}

export interface CiFacts {
  readonly failureRate: number | undefined;
  readonly medianRunsToGreen: number | undefined;
}

export interface VcsActivity {
  readonly pullRequests: PullRequestFacts | undefined;
  readonly commits: CommitFacts | undefined;
  readonly tests: TestFacts | undefined;
  readonly parallelism: ParallelismFacts | undefined;
  readonly ci: CiFacts | undefined;
}

export interface StaticAnalysis {
  readonly ncloc: number | undefined;
  readonly coverage: number | undefined;
  readonly complexity: number | undefined;
  readonly cognitiveComplexity: number | undefined;
  readonly codeSmells: number | undefined;
  readonly bugs: number | undefined;
  readonly duplicatedLinesDensity: number | undefined;
  readonly sqaleIndex: number | undefined;
}

/** What the subject has set up around their assistant. */
export interface ToolingContext {
  readonly projectMemoryPresent: boolean;
  readonly projectMemoryLastUpdated: string | undefined;
  readonly rulesCount: number;
  readonly skillsCount: number;
  readonly agentsCount: number;
  readonly hooksCount: number;
  readonly autoRetryLoopPresent: boolean | undefined;
  readonly declaredAssistantTools: readonly string[];
  readonly editorIntegration: boolean | undefined;
}

export interface WorkSession {
  readonly promptToCommitSteps: number | undefined;
  readonly humanInterventionsMidTask: number | undefined;
  readonly framingOnly: boolean | undefined;
  readonly rawText: string | undefined;
}

export interface Dossier {
  readonly subject: SubjectRef;
  /** Fact groups the source declared as available and that parsed successfully. */
  readonly available: readonly DossierSection[];
  readonly declared: DeclaredProfile | undefined;
  readonly vcsActivity: VcsActivity | undefined;
  readonly staticAnalysis: StaticAnalysis | undefined;
  readonly toolingContext: ToolingContext | undefined;
  readonly workSession: WorkSession | undefined;
}

export function hasSection(dossier: Dossier, section: DossierSection): boolean {
  return dossier.available.includes(section);
}

export function missingSections(
  dossier: Dossier,
  needed: readonly DossierSection[],
): readonly DossierSection[] {
  return needed.filter((section) => !hasSection(dossier, section));
}
