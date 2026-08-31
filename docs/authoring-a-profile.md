# Authoring a profile

A profile is everything known about one developer. Two ways to author one:
a **directory of files** (the CLI, `pnpm viz`) or a **single JSON body**
(the studio's profile form, or a saved profile record). Both parse into the
same domain model, so anything valid in one runs the same in the other.

Every field everywhere is optional. A missing piece means the criteria that
need it read `unknown` — never a negative reading, never a guess.

## As a directory (CLI)

```
my-profile/
  profile.json          required — identity + which pieces are self-reported
  git-activity.json      pull requests, commits, tests, CI, tooling context
  pull-requests.json     raw per-PR rows (a cross-check on git-activity.json)
  sonar-measures.json    static-analysis measures
  declaratif.md          free-text self-report
  session.md             one prompt→commit session transcript
```

Only `profile.json` is required; every other file's presence is what turns on
its profile section. Point the CLI at the directory:

```bash
node packages/core/dist/cli/main.js --profile my-profile/
```

### `profile.json`

| Field | Meaning |
| --- | --- |
| `profile_id` | required — the subject's id |
| `role`, `experience_years`, `stack`, `team_size` | declared context |
| `self_assessed_level` | a grid level id, or a free phrasing (see below) |
| `note` | free text, carried through unchanged |

### `git-activity.json`

Pre-aggregated facts, grouped by concern — every leaf is optional:

- `pull_requests`: `total`, `size_distribution` (`xs`/`s`/`m`/`l`/`xl` counts),
  `median_files_changed`, `median_lines_changed`,
  `median_correction_commits_after_open`,
  `merged_without_human_edit_after_open`, `reverted`,
  `median_review_comments_received`
- `commits`: `total`, `median_per_pr`, `ai_coauthored_ratio`,
  `message_convention_compliance`
- `tests`: `coverage_start`, `coverage_end`, `prs_with_tests_ratio`
- `parallelism`: `max_concurrent_branches`, `median_concurrent_branches`
- `ci`: `failure_rate`, `median_runs_to_green`
- `context_files` (tooling context): `agents_md`, `rules_count`,
  `skills_count`, `hooks_count`, `agents_count`, `auto_retry_loop`,
  `last_updated`
- `assistant_usage`: `declared_tools`, `editor_integration`,
  `sessions_per_week`, `tokens_per_week`

### `pull-requests.json`

An array of raw PR rows — `changed_files`, `additions`, `deletions`,
`commits`, `review_comments` — a cross-check against `git-activity.json`'s
pre-aggregated histogram (see [`pr-raw-distribution`](criteria/size.md)).

### `sonar-measures.json`

A SonarQube-shaped export: `component.measures[]`, each `{ metric, value }`.
Feeds the Harness axis's quality/bug floors (see [criteria/harness.md](criteria/harness.md)).

### `declaratif.md`

Free text. A phrasing like *"je me sens plutôt avancé"* is mapped to a
grid-neutral band (`beginner` / `intermediate` / `advanced`); an explicit
`self_assessed_level` in `profile.json` is taken verbatim instead. Either way
this only ever *lowers* confidence when it disagrees with the evidence — see
[declaratif-contradiction](criteria/README.md#cross-cutting).

### `session.md`

One prompt→commit session transcript. When present it is the Intervention
axis's strongest signal — an eyewitness account of mid-task correction,
read by shallow heuristics rather than a pull-request proxy.

## As one JSON body (studio)

The same model, one object — this is what the studio's profile form reads
and writes, and what `POST /api/profiles` accepts:

```json
{
  "subject": { "id": "perceval", "role": "backend developer", "experienceYears": 4 },
  "available": ["declared", "vcsActivity", "toolingContext", "staticAnalysis"],
  "declared": { "stack": ["TypeScript"], "selfAssessedLevel": "advanced", "notes": ["..."] },
  "vcsActivity": { "pullRequests": { "...": "..." }, "commits": { "...": "..." } },
  "staticAnalysis": { "ncloc": 23124, "bugs": 212, "...": "..." },
  "toolingContext": { "projectMemoryPresent": false, "...": "..." }
}
```

`available` is derived from which sections you fill in, never authored by
hand — the form's toggles are the single source of truth, and the server
rejects a body where `available` disagrees with what is actually present.
