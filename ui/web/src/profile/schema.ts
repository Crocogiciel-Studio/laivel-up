// The five profile sections as form descriptors. The engine's domain `Profile`
// is the contract (src/core/model/profile.ts); the backend derives `available`
// from which sections are present, so the form just omits an absent section.

export type FieldKind = 'text' | 'number' | 'int' | 'bool' | 'stringList' | 'textarea';

export interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
}

export interface GroupDef {
  readonly key: string;
  readonly label: string;
  readonly fields: readonly FieldDef[];
}

export type SectionKey =
  | 'declared'
  | 'vcsActivity'
  | 'staticAnalysis'
  | 'toolingContext'
  | 'workSession';

export interface SectionDef {
  readonly key: SectionKey;
  readonly label: string;
  readonly fields?: readonly FieldDef[];
  readonly groups?: readonly GroupDef[];
  /** vcsActivity only: a repeatable list of raw pull requests. */
  readonly rawPullRequests?: boolean;
}

const n = (key: string, label: string): FieldDef => ({ key, label, kind: 'number' });
const i = (key: string, label: string): FieldDef => ({ key, label, kind: 'int' });
const b = (key: string, label: string): FieldDef => ({ key, label, kind: 'bool' });

export const SUBJECT_FIELDS: readonly FieldDef[] = [
  { key: 'id', label: 'Subject id', kind: 'text' },
  { key: 'role', label: 'Role', kind: 'text' },
  n('experienceYears', 'Experience (years)'),
];

export const SECTIONS: readonly SectionDef[] = [
  {
    key: 'declared',
    label: 'Declared (self-reported, unverified)',
    fields: [
      { key: 'stack', label: 'Stack', kind: 'stringList' },
      n('teamSize', 'Team size'),
      { key: 'selfAssessedLevel', label: 'Self-assessed level', kind: 'text' },
      { key: 'notes', label: 'Notes (one per line)', kind: 'textarea' },
    ],
  },
  {
    key: 'vcsActivity',
    label: 'VCS activity',
    rawPullRequests: true,
    groups: [
      {
        key: 'pullRequests',
        label: 'Pull requests',
        fields: [
          n('total', 'Total'),
          i('sd_xs', 'Size xs'),
          i('sd_s', 'Size s'),
          i('sd_m', 'Size m'),
          i('sd_l', 'Size l'),
          i('sd_xl', 'Size xl'),
          n('medianFilesChanged', 'Median files changed'),
          n('medianLinesChanged', 'Median lines changed'),
          n('medianCorrectionCommitsAfterOpen', 'Median correction commits after open'),
          n('mergedWithoutHumanEditRatio', 'Merged w/o human edit (ratio)'),
          n('revertedRatio', 'Reverted (ratio)'),
          n('medianReviewComments', 'Median review comments'),
        ],
      },
      {
        key: 'commits',
        label: 'Commits',
        fields: [
          n('aiCoauthoredRatio', 'AI co-authored (ratio)'),
          n('messageConventionCompliance', 'Message convention compliance'),
          n('medianPerPr', 'Median commits per PR'),
        ],
      },
      {
        key: 'tests',
        label: 'Tests',
        fields: [
          n('coverageStart', 'Coverage start'),
          n('coverageEnd', 'Coverage end'),
          n('prsWithTestsRatio', 'PRs with tests (ratio)'),
        ],
      },
      {
        key: 'parallelism',
        label: 'Parallelism',
        fields: [
          n('maxConcurrentBranches', 'Max concurrent branches'),
          n('medianConcurrentBranches', 'Median concurrent branches'),
        ],
      },
      {
        key: 'ci',
        label: 'CI',
        fields: [n('failureRate', 'Failure rate'), n('medianRunsToGreen', 'Median runs to green')],
      },
    ],
  },
  {
    key: 'staticAnalysis',
    label: 'Static analysis',
    fields: [
      n('ncloc', 'ncloc'),
      n('coverage', 'Coverage'),
      n('complexity', 'Complexity'),
      n('cognitiveComplexity', 'Cognitive complexity'),
      n('codeSmells', 'Code smells'),
      n('bugs', 'Bugs'),
      n('duplicatedLinesDensity', 'Duplicated lines density'),
      n('sqaleIndex', 'SQALE index'),
    ],
  },
  {
    key: 'toolingContext',
    label: 'Tooling context',
    fields: [
      b('projectMemoryPresent', 'Project memory present'),
      { key: 'projectMemoryLastUpdated', label: 'Project memory last updated', kind: 'text' },
      i('rulesCount', 'Rules count'),
      i('skillsCount', 'Skills count'),
      i('agentsCount', 'Agents count'),
      i('hooksCount', 'Hooks count'),
      b('autoRetryLoopPresent', 'Auto-retry loop present'),
      { key: 'declaredAssistantTools', label: 'Declared assistant tools', kind: 'stringList' },
      b('editorIntegration', 'Editor integration'),
      n('sessionsPerWeek', 'Sessions per week'),
      n('tokensPerWeek', 'Tokens per week'),
    ],
  },
  {
    key: 'workSession',
    label: 'Work session',
    fields: [
      i('promptToCommitSteps', 'Prompt-to-commit steps'),
      i('humanInterventionsMidTask', 'Human interventions mid-task'),
      b('framingOnly', 'Framing only'),
      { key: 'rawText', label: 'Raw text', kind: 'textarea' },
    ],
  },
];

export const RAW_PR_FIELDS: readonly FieldDef[] = [
  i('changedFiles', 'Changed files'),
  i('additions', 'Additions'),
  i('deletions', 'Deletions'),
  i('commits', 'Commits'),
  i('reviewComments', 'Review comments'),
];
