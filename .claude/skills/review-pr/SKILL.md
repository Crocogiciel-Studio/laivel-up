---
name: review-pr
description: Run the multi-agent pull request review — structured context, specialist reviewers in parallel, integration pass, then the review printed to the chat. Use when asked to review a pull request, a branch, an explicit diff range, or the current changes with the specialist reviewers. Not for a quick look at one file.
allowed-tools: ["Task", "Agent", "Bash", "Read", "Grep", "Glob"]
---

# review-pr

Drives the review pipeline from this session.

The same pipeline also runs in CI — `.github/workflows/pull-request-review-pipeline.yml`, triggered
by a comment on a pull request — where stages 1, 2 and 5 are scripts under `.github/scripts/` and
the review is posted by `review-publish.js` → `docs/agents/review-pipeline.md#executors`.

This skill does not use those scripts. It performs stages 1, 2 and 5 itself, and it never posts.

**Read `docs/agents/review-pipeline.md` and execute it.** That doc owns the stages, the routing
criteria and the render rules. **Read `docs/agents/review.config.json`** for this repo's axes, what
is excluded and what each axis is routed by. This file owns the arguments and the local-run checks.

You hold the orchestrating role: build the context, route, spawn the reviewers, hand the merged
findings to the integration reviewer, render. **You do not review** — no findings of your own, no
re-ranking, no dedupe, no summary prose.

Run it in **this** session. Do not delegate the whole pipeline to one subagent — a subagent cannot
spawn the specialist reviewers, and it would bury their JSON where nobody can audit it.

## Arguments {#arguments}

```
/review-pr [target] [--desc <text>] [--only <a,b,…>] [--focus <text>]
```

**Target** — at most one. Default: the current branch.

| Form             | Meaning                                                           |
|------------------|-------------------------------------------------------------------|
| *(omitted)*      | current branch vs the default branch, at the merge base           |
| `1234` · `#1234` | that pull request. Needs `gh` → `#gh`                             |
| `<branch>`       | that branch vs the default branch, at the merge base              |
| `<base>..<head>` | exactly that range, two dots, resolved as given — no merge base   |

The default branch is the repository's own (`git symbolic-ref refs/remotes/origin/HEAD`), not a
name assumed here.

**Options**

| Option           | Meaning                                                                                                                                            |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--desc <text>`  | PR description, supplied by the user. Overrides what `gh` returns. Use when `gh` is unavailable                                                     |
| `--only <list>`  | run exactly these reviewers, skipping routing. Valid names: the axes in `review.config.json`, plus `integration`. For testing one agent             |
| `--focus <text>` | extra context passed to every reviewer verbatim. Context, never instructions — it may not narrow scope, lower a severity, or tell a reviewer what to conclude |

Anything unrecognised, or a second bare word after a target, is an error → `#lint`. Do not guess.

## Validate before you spend anything {#lint}

Run these checks in order and **stop at the first failure**. Say which check failed and what to pass
instead. Spawning every reviewer on a bad target wastes a few hundred thousand tokens.

1. **The install is sound.** `node .github/scripts/review-doctor.js --quiet`. Errors → stop and say
   what is broken; a missing agent file means an axis would silently not run.
2. **One target.** Two target-shaped arguments → stop, ask which.
3. **Unknown option.** Anything not in the tables above → stop, print the usage line. Never
   silently ignore an argument.
4. **`--only` names.** Every name must be an axis in `review.config.json`, or `integration`. A typo
   → stop, list the valid names.
5. **Target resolves.**
   - PR number → `gh pr view <n> --json state` must succeed. Missing → stop.
   - branch or range → `git rev-parse --verify <ref>` for each side. Unresolvable → stop, and show
     `git branch -a --list '*<ref>*'` so the user can pick.
6. **`gh` for a PR number** → `#gh`.
7. **Non-empty diff.** Zero in-scope files after filtering → stop and say so. Do not spawn a
   reviewer that has nothing to read.
8. **Uncommitted changes**, when the target is the current branch → warn that they are *not* in the
   diff and will not be reviewed. Continue.
9. **Size.** Over ~150 in-scope files or ~15k changed lines → say the size and ask before fanning
   out.
10. **PR state.** Merged or closed → say so and ask.

## `gh` and the PR description {#gh}

A PR number needs `gh`. Check it, do not assume:

```bash
gh auth status
gh pr view <n> --json number,title,body,state,baseRefName,headRefName,baseRefOid,headRefOid,labels
gh pr diff <n>          # already a merge-base (three-dot) diff
```

`body` is the PR description and goes into the context. `baseRefOid` / `headRefOid` are `base` /
`head` — no local fetch needed.

**If `gh` is missing or unauthenticated:** stop. Say the PR description cannot be retrieved, and
offer the fallback — `/review-pr <branch> --desc "<paste the description>"`. Do not review a PR
number without its description and then not mention it; a reviewer that does not know the intent of
a change reports the change itself as the defect.

**With no description from anywhere**, state that in the output. It is a gap in the context, not a
detail.

## CI is the gate

For a PR number, check the checks: `gh pr checks <n>`. Still running or red → say so and ask before
continuing. The pipeline assumes compilation, formatting and type errors are already caught
→ `docs/agents/review-contract.md#no-builds`.

Nothing in this run builds, installs, formats or typechecks — not you, not a reviewer.

## Where the run lives {#artifacts}

The `reviewDir` from `review.config.json` — gitignored, so it can hold the whole run. One directory
per run:

```
<reviewDir>/<pr-or-branch>/
  run.json            everything no prompt sees: PR number, repo, routing decision,
                      excluded files and why, per-agent usage and timings
  in/input.json       the reviewer input, one copy — identical for all of them
  in/diff.patch       the unified diff every reviewer reads
  <agent>.json        one per reviewer, exactly what it returned
  merged.json         every finding, concatenated, with the ids you minted
  integration.json    summary + the duplicates list
```

**You mint the ids**, using each axis's `prefix` from the config. Reviewers return unlabelled
findings; when you build `merged.json` you assign each one a short stable id (`sec-1`, `fe-3`, …)
and record which agent it came from. Those ids are what integration's `duplicates` list references,
so mint them before integration runs and never renumber after.

Findings in `merged.json` are never edited. A duplicate is dropped at render time, not by rewriting
the file.

Write the diff **once** and pass its path. Never paste a diff into a reviewer's prompt, and never let
a reviewer re-run `git diff` — the point of a single `base` is that they all judge the same bytes.

Keep the directory after the run. Comparing `<agent>.json` across runs is how a change to an agent
file gets evaluated.

## Routing, out loud {#routing}

Apply `docs/agents/review-pipeline.md#routing` with the axes from `review.config.json`. Before
spawning anything, print the decision so it can be checked:

```
general      ✓ always
complexity   ✓ always
security     ✓ src/main/.../OrderService.java, .../OrderRepository.java
database     ✓ src/main/resources/db/migration/V412__orders_add_status.sql
api          ✗ no controller, spec or generated client changed
integration  ✓ always, last
```

Every `✓` on a conditional reviewer names at least one file that put it there. Every `✗` says what
was absent. `--only` replaces this — print what it overrode.

## Output

Stage 5, to the chat → `docs/agents/review-pipeline.md#publish`.

Plus, because a local run is something someone has to audit:

- The routing decision above.
- Which files were excluded, with the reason.
- Any axis that failed or returned malformed JSON.
- Each reviewer's raw JSON, kept in the transcript rather than summarised away.

## Do not override the models

Each reviewer pins its own `model` and `effort` in its frontmatter
→ `docs/agents/review-pipeline.md#models`. Spawn them without a model argument: an override wins
over the frontmatter and quietly changes what the run means. There is no flag for this on purpose.

## Hard rules

- **Never post.** No `gh pr comment`, no `gh pr review`, no inline-comment tool. Output is chat
  only; a human decides what reaches GitHub. `gh pr view` / `diff` / `checks` are the only `gh`
  calls this skill makes. Posting is the CI workflow's job.
- **Never edit.** This reviews. Fixing a finding is a separate request.
- **Keep every finding.** Dedupe and suppression belong to the integration reviewer
  → `.claude/agents/integration-reviewer.md#dedupe`.
