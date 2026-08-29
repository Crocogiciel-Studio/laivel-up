---
name: dev-context
description: Load the repository rules that govern a coding task before any code is written — routed through the task routing table when there is one, or through the rule corpus's own scope globs. Use BEFORE writing or changing code here. Also use when deciding where new code belongs, when a change may need a twin elsewhere, or when a domain term is unfamiliar. Skip for read-only questions and trivial one-line edits.
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
---

# dev-context

Prime the session with the documentation that governs the task **before** any code is written.

The rules you load here are the same rules the review agents cite back at you
→ `review-contract.md#rules`. That is the point: one corpus, read at write time and enforced at
review time. A rule you were not shown is a comment you will get later.

**This skill reads. It never edits, writes, or commits.** It ends with a brief and stops.

## 1. Find out how this repo routes {#modes}

```bash
node .github/scripts/review-corpus.js        # the rule inventory, and the scope each rule declares
```

Two shapes, and the repo has already chosen one → `review-onboarding.md#corpus`:

- **A routing table** — `routing.yml` in the docs root. Rules are hand-written and grouped by topic;
  the table maps a *kind of work* to the docs that govern it. Go to `#routing`.
- **A filed corpus** — one rule per file, each declaring the paths it applies to in its own
  frontmatter, usually generated (AIDD, `.claude/rules`, `.cursor/rules`, `.github/instructions`).
  Nothing maps tasks to docs, because each rule already says where it applies. Go to `#globs`.

Both can be present. Then the routing table is the menu and the corpus is the detail: take the
entry, then match the paths as well.

## 2a. Route by task {#routing}

Read the `task:` lines only — never load the table whole:

```bash
grep -nE '^[a-z][a-z0-9-]*:$|^  task:' docs/agents/routing.yml
```

Match the task to one entry — the most specific single one; take a second only when the work
genuinely spans two. Extract just that entry:

```bash
awk '/^<key>:/,/^$/' docs/agents/routing.yml
```

**Nothing matches?** Do not force a fit. Brief from the architecture doc and the nearest
`CLAUDE.md` / `AGENTS.md`, and end by proposing a new entry as a YAML block for the user to
approve — `task` / `read` / `touch` / `gotchas`, in the file's existing style. Do not write it
yourself.

## 2b. Route by path {#globs}

Name the files the work will land in — from the task, or from `git status --porcelain` if it has
already started. Then ask the corpus which rules those files engage:

```bash
node .github/scripts/review-corpus.js --match src/api/Orders.ts src/ui/Button.tsx
```

That is the same computation the review pipeline runs to decide which rules to hand each reviewer,
so what comes back is exactly what you will be held to.

- **Guessing the paths is the skill here.** A vague guess loads the wrong rules; `**`-scoped rules
  come back either way, which is correct — they always apply.
- Add the durable project context for the area you are touching: the memory documents listed by
  `review-corpus.js` with kind `memory`. Descriptive, not normative — background, never a rule to
  cite.

## 3. Read them

Read every rule the routing produced, whole. They are short, and the reasoning is the part you need.

- The root `CLAUDE.md` / `AGENTS.md` and the nearest scoped one are auto-loaded already. Skip
  anything you have.
- **Never edit a generated rule.** If one is wrong, say so and name the generator — the fix belongs
  upstream, and an edit here is gone at the next regeneration.
- Then read the code the docs name as the reference implementation, if the task extends an existing
  pattern. Docs describe; the reference file shows.

## 4. Report

Under 25 lines. A briefing, not a summary of what you read.

```
**Task** — one line, restated as you understood it
**Routed by** — `<entry key>`, or the paths you matched
**Read** — file · file · file
**Lands in** — the paths
```

**Applies here** — 3 to 6 bullets. Only rules that bear on *this* task; a rule you list must be one
the work could plausibly break. Each ends with the id to cite, exactly as the corpus prints it.
Quote any root-level non-negotiable the task touches verbatim — those are the ones that leak data
or block a rollback.

**Watch for** — the gotchas from the routing entry, or the sharp edges in the rules you read, one
line each, as questions to answer while working.

**Unresolved** — any `TODO:` in what you read that this task depends on. Say what is not decided and
what you will assume. Omit if there are none.

**Twins** — if the work touches one half of a pair (two apps, two products, a client and its
server), name the other and say whether it needs the same change. Never silently assume one-sided.

## Keeping it honest

A rule that governs this work but was not routed to you is a bug in the routing, not a reason to
guess: an entry missing from the table, or a scope glob in the corpus that is too narrow. Say which,
and propose the fix. In a generated corpus, that fix is a change to the generator's input, not to
the file you were handed.
