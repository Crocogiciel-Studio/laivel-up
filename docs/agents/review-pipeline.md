---
title: Review pipeline
applies_to: "**"
read_when: running or changing the pull request review
---

# Review pipeline

How a pull request review is produced. **What** the reviewers judge is not here — that is
`review-contract.md` and each reviewer's agent file. **Which** reviewers exist, what they are
routed by and what is excluded is `review.config.json`.

```
Pull Request → CI green
      │
      ▼
Structured context      stage 1
      │
      ▼
Routing                 stage 2
      │
      ├── always axes         one or more, every run
      └── conditional axes    routed by path        stage 3 — parallel, independent, blind to each other
      │
      ▼
Merged findings
      │
      ▼
Integration reviewer    stage 4 — dedupe and summary only. It adds no findings
      │
      ▼
Single GitHub review    stage 5 — many comments, posted by a script
```

## Who runs what {#executors}

| Stage | Target                                   | In CI                                    | Locally      |
|-------|------------------------------------------|------------------------------------------|--------------|
| 1     | script                                   | `.github/scripts/review-context.js`      | `/review-pr` |
| 2     | deterministic tool                       | `.github/scripts/review-context.js`      | `/review-pr` |
| 3     | orchestrating session spawns the agents  | one workflow job per axis                | `/review-pr` |
| 4     | agent — `integration-reviewer`           | agent, after `review-merge.js` mints ids | agent        |
| 5     | script — posts one review, many comments | `.github/scripts/review-publish.js`      | to chat      |

Two entry points: `.github/workflows/pull-request-review-pipeline.yml`, triggered by a comment on a
pull request, and the `/review-pr` skill. The skill does not depend on the scripts: it performs
stages 1, 2 and 5 itself, and it never posts → `.claude/skills/review-pr/SKILL.md`.

In CI, every job that runs a model is granted `contents: read` and nothing else, and the one job
holding `pull-requests: write` contains no model.

Locally the orchestrating role is **not a subagent**: it spawns the specialist reviewers, and a
subagent cannot spawn subagents, so it runs in the top-level session. In CI there is no orchestrating
session — the job matrix is the fan-out, and each reviewer *is* its session, pinned to the model and
effort its agent file declares and held to `schemas/review-output.schema.json` by structured output.

Whoever holds that role **does not review**: no findings of its own, no re-ranking, no dedupe, no
summary prose. Every judgement in the output came from a reviewer. Performing a stage that a script
will own means performing it *as the script would* — where that is impossible, the output says so
rather than approximating.

## Stage 1 — Structured context {#context}

Built once, so every reviewer diffs the same thing. Shape:
`schemas/review-input.schema.json` — that file is the authority.

- `base` — the **merge base**, computed once. Never `HEAD~1`, never the branch tip. The one
  exception is an explicitly given `<base>..<head>` range, which is used exactly as given.
- `head` — the sha under review.
- The unified diff on disk. Reviewers read the file; they do not re-run `git`.
- The changed-file list with status, and **the line ranges a comment may anchor to** — one pair per
  diff hunk, from its `@@` header → `schemas/review-input.schema.json`.
- PR number, title, description, and the linked ticket when the branch or title names one.

**The description is part of the context, not decoration.** It is what tells a reviewer the change
is intentional. Sources, in order: the PR body from `gh`, then a description supplied by the caller,
then nothing — and *nothing* is stated in the output, never passed over in silence. A reviewer
working without intent reports the change itself as the defect.

Then filter: everything `review.config.json`'s `exclude` list covers — generated output, lockfiles,
snapshots, vendored and binary files — leaves the file list and is recorded with its reason, so the
summary can state what was not reviewed. **A reviewer never sees an excluded file.**

An excluded file leaves `files`, but the run still records **why**. An axis marked
`routeIncludesExcluded` may be routed by such a path — that is how "this generated file looks
hand-edited rather than regenerated" stays reviewable without anyone reading the contents.

CI status is gathered and **recorded, never a gate**: a red or in-flight pipeline is stated in the
review's closing section and does not stop a review a human asked for. Any metric the run cannot
gather is declared in `coverageNotes` and printed as missing, rather than replaced by an ad-hoc
analysis.

## Stage 2 — Routing {#routing}

An axis is either `always` or routed by a path regex — both live in `review.config.json`, and that
file is the only place the repo's shape is written down.

Overlap is intended: one changed file may put several reviewers on the run, on different axes. When
a change plausibly reaches an axis, run that reviewer — **one that finds nothing costs a run, one
that never ran costs a defect.** Ties go to running the reviewer.

### Deciding {#deciding}

Route on **what each changed file is**, never on a keyword in the diff:

1. Take the in-scope changed-file list from stage 1 — after exclusions, so generated output and
   snapshots cannot put a reviewer on the run.
2. Classify each file against the categories the axes name.
3. Map the classifications onto the routes. A file may select several reviewers; a reviewer needs
   only one file.
4. **Open the file when the path does not settle it.** Classification is a reading task, not a
   pattern match — this is exactly the judgement the deterministic router will not have.

Then state the decision before spawning anything: every selected conditional reviewer names at least
one file that put it there, and every skipped one says what was absent. A skipped specialist is a
stated decision, never a silence.

**In CI the router is one regex per axis**, and it deliberately over-selects: step 4's judgement is
then made by the reviewer itself, which opens the file and returns `findings: []`. That is the cost
model above, applied — and it is why a crude router is the right one here. `run.json` records both
the decision and, afterwards, how many findings each axis actually produced.

## Model and effort {#models}

Pinned in each agent's frontmatter (`model:` and `effort:`), not chosen per run — a review whose
depth varies with whoever launched it is not comparable to the last one.

Effort tracks *how much reasoning the axis needs*, not how much the consequence matters — a
structural axis has real consequences and can still run at `medium`, because its procedure is a
sequence of checks rather than an inference.

**Whoever fans out must not pass a model override.** An override takes precedence over the
frontmatter and silently un-pins the run. If a reviewer needs a different tier, change its agent
file.

## Stage 3 — Fan out {#fan-out}

The reviewers run in parallel and are independent by construction:

- No reviewer sees another's findings.
- No reviewer is told what another was asked to look at.
- Nobody relays, summarises or arbitrates between them.

Each gets its input and nothing else. Its agent file says what it owns; the contract says how it
reports. Restating rules in the prompt is reviewing — don't.

The diff is written once and passed by path. A reviewer that re-runs `git diff` has defeated the
single `base`: all of them must judge the same bytes.

Each returns JSON per `schemas/review-output.schema.json` — findings and coverage, nothing else. Ids,
token spend and timings are the run's business, recorded in `run.json`. Malformed JSON gets one
retry; a second failure is reported as a **failed axis**, never silently dropped.

## Stage 4 — Integration {#integration}

Every reviewer's findings are concatenated into one document and **an id is minted for each**, from
the axis prefix in `review.config.json`. The result goes to the integration reviewer, which does two
things: drops true duplicates and writes the summary → `.claude/agents/integration-reviewer.md`.

It is **not a review pass.** It adds no findings, verifies nothing, re-ranks nothing, and does not
need the diff. Its output is a `summary` and a `duplicates` list — nothing else can reach it, by
schema. A cross-file defect belongs to the reviewers who own the files → `#fan-out`.

Merging is concatenation plus ids. Nothing else touches a finding's text, ever.

## Stage 5 — Publish {#publish}

One GitHub review, many comments, posted by a script — never by an agent
→ `review-contract.md#output`.

- The integration reviewer's summary is the review body, **verbatim**.
- One comment per rendered finding: severity, the description, and the suggestion when there is one.
  Nothing added, nothing reformatted into prose.
- Anchored at `file:line`, or at `line..endLine` when the finding carries a range.

**A comment can only go on a line GitHub considers changed**, and GitHub rejects the whole review
when one is wrong. The anchorable ranges per file are in the input as `lines` → `#context`. A finding
outside those ranges is **listed in the review body**, never dropped, and does not use up one of the
inline nit slots.

A ```` ```suggestion ```` block is passed through verbatim. It replaces `line`..`endLine` wholesale,
so it need not have the same number of lines.

- **Every site of a repeated defect gets its own comment.** Six occurrences, six comments. Never a
  count in place of locations → `.claude/agents/integration-reviewer.md#dedupe`.
- All `blocking` and `important`, always.
- Nits inline up to `limits.nitsInline`; the remainder listed by `file:line` in the body.
- A finding listed in `duplicates` does not render as a comment. It goes in a trailing appendix with
  the reason and the id it duplicated — never deleted.
- Closing section: excluded files, skipped files, failed axes, metrics that could not be gathered.

## Changing any of this {#changing}

Run `node .github/scripts/review-doctor.js` after touching the config, an agent file, or a rule
anchor. It checks the wiring — every axis has a pinned agent file, every anchor exists and has
exactly one owner, the schemas still reduce, the workflow trigger still matches the config.
