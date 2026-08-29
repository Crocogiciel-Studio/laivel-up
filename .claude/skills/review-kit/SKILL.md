---
name: review-kit
description: Install, configure or extend this repo's multi-agent pull request review — survey the repo, choose the axes, write the config and the reviewer agent files, validate and calibrate. Use when setting the review pipeline up for the first time, adding or removing a reviewer axis, or when the review is producing noise and the agent files need tuning. Not for running a review — that is /review-pr.
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "AskUserQuestion"]
---

# review-kit

Makes the review pipeline fit **this** repo.

**Read `docs/agents/review-onboarding.md` and execute it.** That document owns the procedure — the
survey, the axis catalogue, the config format, how an agent file is written, how to calibrate. This
file owns the arguments and how to talk to the user while doing it.

Read it in full before the first tool call. It is short, and skipping to Phase 5 produces reviewers
that report opinions.

## Arguments

```
/review-kit                 install, or resume where the install stopped
/review-kit add <axis>      add one axis to a working pipeline
/review-kit tune [<axis>]   recalibrate agent files against a real run
/review-kit check           run the doctor and report, change nothing
```

With no argument, work out which of these applies: no `review.config.json` → install; config
present and sound → say so and ask what to change.

## How to run it

**Survey first, ask second.** Arrive at the questions with the repo already read — languages,
layout, generated output, existing rule docs, what has broken here before. Questions you could have
answered by reading are questions that make the user do your work.

**One decision per question.** Use `AskUserQuestion` for the axis list, and for anything where two
readings of the repo lead to materially different pipelines. Recommend an option and say why.

**Show the config before writing it.** It is the file the user will edit for years.

**Never invent rules.** Anchors come from what is written down or visibly practised
→ `review-onboarding.md#rules`. If a doc has to be created, say plainly that you are describing
existing practice, and keep it to what the code actually does.

**Stop at the first phase you cannot complete.** A pipeline with three good axes beats one with
seven where four were guessed. Say which phase you stopped at and what is needed to continue.

## What must be true when you finish

- `node .github/scripts/review-doctor.js` exits 0.
- Every axis in the config has an agent file with `model` and `effort` pinned, a "You own" block and
  a "Not yours" block that names the neighbouring axes.
- Every anchor in an agent file exists in a real doc and is owned by exactly one axis.
- The two `review-kit:repo-specific` blocks in `review-contract.md` are filled in.
- `reviewDir` is gitignored.
- At least one calibration run has been done on a real diff, and its outcome reported
  → `review-onboarding.md#calibrate`.

Report anything on that list you could not do, rather than leaving it implied.

## Do not

- **Do not run the build, the tests, the formatter or the typechecker.** Not during the install
  either → `review-contract.md#no-builds`.
- **Do not post anything to GitHub.** Installing is not reviewing.
- **Do not copy another repo's axes wholesale.** The catalogue in the onboarding doc is a menu, and
  an axis with no local risk behind it produces comments people learn to skip.
- **Do not weaken the invariants** in `review-onboarding.md#invariants` to make an install simpler.
  They are the whole reason the output is readable.
