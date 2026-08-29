---
name: doc-lint
description: Check the agent documentation tree for broken invariants — dangling rule anchors, unowned rules, index rows pointing at files that no longer exist, references to missing anchors or files, routing entries that route nowhere, unpinned or invalid agent frontmatter, stray edit damage — and fix the mechanical ones. Use before opening a PR that touched the docs tree, the agent files or the skills, after renaming or moving a rule, or when a reference looks wrong. Not for reviewing prose quality.
allowed-tools: ["Bash", "Read", "Edit", "Grep", "Glob"]
---

# doc-lint

The rule tree has invariants no compiler checks: one anchor one owner, anchors permanent, every
reference resolving, every agent pinned. They break silently — a renamed anchor still reads fine and
just stops being enforced.

```bash
node .claude/skills/doc-lint/check.mjs          # human-readable
node .claude/skills/doc-lint/check.mjs --json   # machine-readable
```

Read-only. Exit 1 if there is anything to report. It scans the docs root, the agent files, the
skills and every scoped `CLAUDE.md` / `AGENTS.md` — **not** narrative guides elsewhere in `docs/`,
which have no invariants to enforce.

This is the **one authority** on those invariants. `review-doctor.js` checks whether the review
pipeline is wired — axes, pins, schemas, trigger — and defers the doc tree to this file, for the
same reason a rule anchor has one owner.

## The two classes

The checker labels every finding, and the label decides what you do with it.

**`fix` — one correct answer. Apply it, then re-run.**

| Class       | What it means                                                                   | The fix                                                                                                                       |
|-------------|---------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `ownership` | an agent's `## You own` block disagrees with `review-ownership.json`            | regenerate the block from the registry, sorted. **`review-ownership.json` is the source of truth**; the block is a view of it |
| `stray`     | content after `{#anchor}` on a heading, trailing whitespace, a non-kebab anchor | delete the junk. This is how an anchor breaks without anything visible breaking                                              |

**`ask` — needs a decision. Report it, propose the fix, stop.**

| Class                                                 | Why you must not guess                                                                                                |
|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `anchor` — a rule owned by nobody                     | which reviewer owns it is a design call. Wrong owner = a duplicate comment or a blind spot                            |
| `anchor` — listed but not defined                     | anchors are permanent, so this is usually a rename to revert — but it might be a deliberate deletion. Different fixes |
| `ref` — a reference to a missing anchor or file       | the target may have been renamed, moved, or never existed. Only the author knows which                                |
| `index` — an index row pointing at a missing file     | the map is a promise; whether the file moved or died is not the linter's call                                         |
| `routing` — a `read:` target that does not exist, or an entry with no `task`/`read` | the doc may be renamed or simply missing                                             |
| `frontmatter` — missing or invalid `model` / `effort` | pinning is deliberate → `review-pipeline.md#models`. Never invent a tier                                              |
| `parse` — JSON, `$ref` or `routing.yml` broken        | it may be mid-edit. Do not reformat someone's file to make it parse                                                   |

## How to run it

1. Run the checker.
2. **Clean?** Say so in one line and stop. Do not go looking for prose to improve.
3. Apply every `fix`. Use `Edit` — never regenerate a whole file to change one block.
4. **Re-run.** A fix that introduces a new finding is a fix that was wrong.
5. Report the `ask` items: what broke, and the fix you would make. One or two lines each. Then stop
   and let the user decide.

`--check` means step 3 does not happen: report both classes and stop.

## What it does not check

It reads structure, not meaning. It cannot tell you that a rule is wrong, that a doc contradicts the
code, or that an anchor is owned by the wrong reviewer — only that ownership is *stated somewhere*.
Those stay a human's job, and finding one mid-lint is worth saying out loud even though this skill
cannot fix it.

## Extending it

A new invariant goes in `check.mjs`, labelled `fix` only if there is exactly one correct outcome.
When in doubt, `ask`: a wrong auto-fix in the file that governs the reviewers is worse than a finding
someone has to read.
