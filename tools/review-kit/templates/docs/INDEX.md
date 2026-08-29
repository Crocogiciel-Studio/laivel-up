---
title: Documentation index
applies_to: "**"
read_when: starting any task, unsure which docs apply
---

# Index

Map of the agent documentation. Read by coding agents and review agents.

## Rules

- One rule = one file. Everywhere else = a link.
- Every rule has a stable anchor. Agents cite it as `ruleId: "<file>#<anchor>"`.
- Anchors are permanent. Reword the heading, keep the anchor.
- Task not covered? Read the architecture doc and the nearest `CLAUDE.md` / `AGENTS.md`, then add
  the routing entry.

## Files

<!-- review-kit:todo — one row per rule doc. "Read when", not "what it contains": this column is
     what a coding agent matches its task against. -->

| File            | Read when |
|-----------------|-----------|
| `glossary.md`   | encountering unfamiliar domain vocabulary, or a word that seems to mean two things |

Review system, not rule docs:

| File                                | What it is                                                                     |
|-------------------------------------|--------------------------------------------------------------------------------|
| `review-pipeline.md`                | the five stages, and what is a script versus an agent                          |
| `review-contract.md`                | rules every reviewer obeys — how to review, what to skip, severity, I/O        |
| `review-onboarding.md`              | how the axes were chosen here, and how to add one                              |
| `review.config.json`                | the axes, what routes them, what is excluded                                   |
| `review-ownership.json`             | rule anchor → owning reviewer. One anchor, one owner                           |
| `schemas/review-*.json`             | three shapes: reviewer input, reviewer output, integration output              |
| `.claude/agents/*-reviewer.md`      | one axis each. Scope and owned anchors declared in the file                    |
| `.claude/skills/review-pr/SKILL.md` | `/review-pr` — run a review from a session                                     |

Those process docs hold no reviewable rules, so their anchors are not owned by a reviewer.

The invariants on this page — one anchor one owner, anchors permanent, every reference resolving —
are checked by `.claude/skills/doc-lint/check.mjs`. Run it before a PR that touched this tree.

## Routing

`routing.yml` — task type → docs to read, paths touched, gotchas.

Data, not prose. One entry at a time, never loaded whole into a prompt:

- A coding agent matches its task to one entry and reads that entry's `read` docs.
- `touch` patterns are globs (`dir/**`), not bare directory names, so a changed-file list can be
  matched against them.
- Review specialists do not route through it. Their scope and docs are declared in their own agent
  file; they use the table above when an investigation takes them outside their axis.

**Consumer:** the `dev-context` skill. A coding agent invokes it on its own before touching code; a
human can invoke it as `/dev-context <task>`. It reads the `task:` lines as a menu, extracts the one
matching entry, loads that entry's `read` docs, and reports what constrains the work. Read-only — it
stops before editing. No match → it proposes a new entry instead of forcing a fit.

Adding an entry is part of the change that needed it. Keep `read` short: what the work would break
without, not everything related.

## Deep dives

<!-- review-kit:todo — narrative guides that are not rule docs, and where they live. Nothing here
     is anchored or owned; it is a map for humans. -->

| Topic | Where |
|-------|-------|
