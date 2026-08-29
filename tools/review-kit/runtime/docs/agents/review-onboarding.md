---
title: Review onboarding
applies_to: "**"
read_when: installing the review pipeline in this repo, or adding an axis to it
---

# Review onboarding

How to make this repo's review pipeline actually fit this repo. The runtime is installed and
portable — the scripts, the workflow, the schemas, the contract. **What is missing is the only part
that cannot be copied: which axes exist here, what routes them, and what each one owns.**

Written for whoever does that, human or agent. `/review-kit` is the Claude Code entry point; any
other agent can execute this document directly.

The rule throughout: **the pipeline is a machine for turning rules that already exist into comments.
It does not invent standards.** If a convention is not written down and not visible in the code, it
is not an axis — it is an opinion, and reviewers that report opinions get muted.

## Before you touch anything {#invariants}

These are the properties that make the output worth reading. Everything else is negotiable; these
are not.

1. **Reviewers are blind to each other.** No reviewer sees another's findings, or is told what
   another was asked to look at. Two independent readings of the same diff are the product.
2. **One anchor, one owner.** Two axes citing the same rule produce two comments on the same line,
   and readers learn to skim. `review-ownership.json` is the register; `review-doctor.js` enforces it.
3. **Scripts post, agents don't.** In CI this is a property of the tokens: the jobs that hold a
   model get `contents: read`, the job that can write has no model. Do not "simplify" that away.
4. **Pins live in the agent file.** Model and effort are per-axis constants, never per-run choices.
5. **Nothing builds.** CI already compiles, formats and typechecks. A reviewer that runs the build
   is spending minutes to learn what a green check already said.
6. **Evidence is mandatory.** A finding carries a verbatim quote so nobody can report what they have
   not read.
7. **Silence is never coverage.** An excluded file, a skipped file, a failed axis and a missing
   metric are all stated in the output.
8. **Anchors are permanent.** Reword the heading, keep the anchor — it is what the ownership
   registry, the routing table and every past review comment point at.
9. **One invariant, one checker.** The doc tree belongs to `doc-lint`, the wiring to
   `review-doctor.js` → `#checkers`.

## Phase 1 — Survey the repo {#survey}

Read before you ask. Come out of this phase able to name the repo's shape in one paragraph.

- **Languages and build.** What compiles, what tests, what formats. Find the CI workflow and list
  the checks it already runs — that list is what the contract's `review-contract.md#no-builds` section must name.
- **Layout.** Modules, apps, packages. Where does backend end and frontend begin? Is there a shared
  tier? Are there twins (two apps that must change together)?
- **Generated and vendored output.** Look for generator configs, `gen/` directories, checked-in
  clients, lockfiles, snapshots. Every one of these is an `exclude` entry with a reason — and finding
  them by grep now is what stops a reviewer from spending its run on machine output later.
- **Existing written rules.** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/`, ADRs. These are
  the anchors the reviewers will cite. **This is the most important thing you find in this phase.**
  Note whether they are already anchored, and whether anything routes a coding agent to them
  → `#rules`.
- **The riskiest things that can go wrong here.** Read the last few post-mortems, reverts, or
  hotfix commits: `git log --grep -iE 'revert|hotfix|incident'`. A repo that has never leaked tenant
  data but has broken three migrations does not need the same axes as one where the reverse is true.
- **Default branch, and whether `gh` is available and authenticated.**

Say what you found, including the gaps. "There are no written conventions" is a finding that changes
the plan — it means Phase 4 comes before Phase 5.

## Phase 2 — Choose the axes {#axes}

An axis is a **question about a change that someone competent would ask**, narrow enough that one
reviewer can hold it whole. Not a topic. Not a checklist heading.

Two axes always exist:

| Axis | Question | Notes |
|------|----------|-------|
| `general` | does this do what it is supposed to do, and is it tested? | The **residual** axis: everything no specialist owns. Never skip it. |
| `complexity` | is this the simplest correct shape, in the right place, does it already exist? | Capped at `important` — structure never blocks a rollback. The noisiest axis; hold it to real cost. |

Plus `integration`, which is not an axis and reviews nothing → `#integration`.

The standard catalogue, each worth an axis **only if this repo has the risk and the rules**:

| Axis | Question | Add it when |
|------|----------|-------------|
| `security` | can this let one tenant see another's data, skip a check, leak a credential, execute untrusted content? | multi-tenant, auth code, user-rendered content, secrets in a client bundle |
| `database` | will this schema change deploy safely, roll back safely, survive the running version? | migrations exist — especially with `validate-on-migrate` off, where nothing else catches a rewritten migration |
| `api` | is this a well-formed contract, and does it break anyone already calling it? | a public or cross-team API, an OpenAPI spec, generated clients |
| `frontend` | does this run correctly in the browser, and does it sit where frontend code belongs? | a real frontend tree. Give it **both halves** — shape and correctness — or a React bug falls between two reviewers |
| `dependency` | does this bump break something this codebase actually calls? | dependency manifests change often. Needs `web: true` to read changelogs |
| `performance` | will this be slow at production scale? | there are known hot paths and a written budget to cite |

Repo-specific axes are the point, not the exception. An axis for a domain invariant your team
re-learns in every incident is worth more than three from the catalogue.

**Do not create an axis you cannot answer these four questions about:**

1. What does it own that no one else does?
2. What is explicitly *not* its business, and whose is it?
3. What does it read before judging?
4. What would it have caught in a real past defect?

If (4) has no answer, the axis is speculative. Start without it: axes are cheap to add and expensive
to un-teach once people are ignoring their comments.

**Sizing.** Four to seven axes is the working range. Under three and the residual axis is doing
everything alone; over eight and every diff spawns a crowd whose comments overlap.

Confirm the list with the user before writing anything. Name what you are *not* adding, and why.

## Phase 3 — Write the config {#config}

`review.config.json` is the only file that knows the repo's shape. Every entry needs evidence from
Phase 1 — a real path, not a guess.

```json
{
  "schemaVersion": 1,
  "docsRoot": "docs/agents",
  "agentsRoot": ".claude/agents",
  "reviewDir": ".review",
  "trigger": "@claude deep-review",
  "limits": { "nitsInline": 10, "maxComments": 50 },
  "coverageNotes": { "Coverage report": "not wired" },
  "exclude": [
    { "pattern": "^src/gen/", "reason": "generated client" },
    { "pattern": "(^|/)pnpm-lock\\.yaml$|\\.lock$", "reason": "lockfile" }
  ],
  "axes": [
    { "name": "general", "prefix": "gen", "always": true },
    { "name": "complexity", "prefix": "cx", "always": true },
    { "name": "security", "prefix": "sec", "route": "(Service|Repository|Controller)\\.(java|ts)$|/auth/" },
    { "name": "frontend", "prefix": "fe", "route": "^frontend/" },
    { "name": "dependency", "prefix": "dep", "route": "(^|/)pom\\.xml$", "web": true }
  ]
}
```

- **`prefix`** mints finding ids (`sec-1`). Two to four letters, unique, and **never renamed** once a
  run exists — integration's `duplicates` list points at them.
- **`route`** is a JavaScript regex over the changed paths. **Deliberately broad.** A reviewer that
  finds nothing costs a run; one that never ran costs a defect. The judgement a regex cannot make is
  made by the reviewer, which opens the file and returns `findings: []`.
- **`routeIncludesExcluded`** routes an axis on excluded paths too. One use: the api axis noticing
  that a generated file was hand-edited, without anyone reading its contents.
- **`web: true`** grants `WebFetch`/`WebSearch`. Only the dependency-style axes need it.
- **`coverageNotes`** are metrics you know you cannot gather. They print in the review as missing.
  **Declaring a gap beats substituting an ad-hoc analysis for it.**

Then fill the two `review-kit:repo-specific` blocks in `review-contract.md`: the commands CI already
runs, and anything this repo never wants reported.

## Phase 4 — The corpus the rules live in {#rules}

A `blocking` finding must cite a rule anchor or be a confirmed, reproducible defect. So the axes are
only as good as the written rules — and this phase is where most of the work is, whatever the axis
list looked like in Phase 2.

**The corpus has two consumers, and that is the whole point.** The same anchored rule is loaded by a
coding agent *before* it writes (`routing.yml` → the `dev-context` skill) and cited by a reviewer
*after* it wrote (`review-ownership.json` → the agent files). A rule written once is enforced twice;
a rule nobody wrote is enforced never. Skip the write-time half and you have built a machine that
tells people about rules they were never shown.

```
                 rule docs, anchored
                   │              │
     routing.yml ──┘              └── review-ownership.json
          │                                    │
     dev-context                       the reviewer agents
     (write time)                       (review time)
```

### Which shape is this corpus {#corpus}

Two shapes exist, and which one you have decides most of this phase. `corpus.sources` in
`review.config.json` declares it; `node .github/scripts/review-corpus.js` prints what that resolves
to.

| | **anchored** | **filed** |
|---|---|---|
| Shape | one doc per topic, one rule per heading | one rule per file |
| Cited as | `<doc>.md#<anchor>` | the rule file's path |
| Scope | not declared; the routing table maps tasks to docs | declared **in the rule's own frontmatter** — `paths`, `globs` or `applyTo` |
| Written by | hand, in this repo | usually a generator: AIDD, or a per-tool rule surface |
| Owned by the kit | yes — it scaffolds and lints them | **no** — read-only, never edited here |

**A filed rule already carries the globs it applies to, and that is the useful part.** The run
matches those globs against the changed files and hands each reviewer the rules its axis owns that
this diff actually engages → `review-contract.md#rules`. Nobody has to maintain a second mapping,
and a reviewer never has to go looking for the rule that governs a file it was given.

### A generated corpus {#generated}

When the rules come from a generator — `--corpus aidd` sets this up — the corpus is **input, not
territory**:

- **Nothing in this pipeline writes to it.** No scaffolding, no index, no routing table, and
  `doc-lint` proposes no `fix` inside it. An edit there is gone at the next regeneration, exactly as
  a review comment on generated code is wasted → `review-contract.md#do-not-report`.
- **Own it by pattern, not by file.** `".claude/rules/03-security/**"` survives a regeneration; a
  line per file does not, and you will re-register the whole corpus every time it runs.
- **The drift is what you monitor.** After a regeneration, `doc-lint` reports a rule that no axis
  owns (new or moved) and a pattern that now matches nothing (deleted or renamed). Those two
  findings are the whole maintenance burden, and they are why the check runs in CI
  → `#ci`.
- **A rule you disagree with is fixed upstream**, in the generator's input. Say so and stop; do not
  patch the output.

The memory documents a generator also produces — architecture, codebase map, project brief — are
**descriptive, not normative**. They are background a reviewer may read, never something it cites.
Keep them as `kind: "memory"` sources so they are listed and never mistaken for rules.

### The four files {#corpus-files}

An **anchored** corpus is four files. A **filed** one is the first and the last: the rules carry
their own scope, so there is nothing to route and nothing to index.

| File | What it is | Consumer | Filed corpus? |
|------|------------|----------|----------------|
| the rules | one rule per heading with a permanent `{#anchor}`, or one rule per file | both | yes — generated |
| `INDEX.md` | the map: which doc to read when | both, and humans | no |
| `routing.yml` | task type → docs to read, paths touched, gotchas. **Data, never pasted whole into a prompt** | `dev-context` | no — the globs route |
| `review-ownership.json` | rule → owning reviewer. One rule, one owner | the reviewers | yes — by pattern |

### Writing the rules {#writing-rules}

If the repo already has conventions written down, **use those files as-is**. Anchor them: give each
rule a heading with an explicit `{#anchor}`, and cite it as `<file>.md#<anchor>`.

If it does not, write the minimum — one doc per axis that needs one, from
`review-templates/rules-doc.md`, each rule a heading with an anchor and two or three lines of body:

```markdown
## Tenant scoping {#tenant-scoping}

Every query against a tenant-owned table filters by `tenantId`. The filter belongs in the
repository, not the caller. Reference: `OrderRepository.findByTenant`.
```

**Write only rules the team already follows.** Read the code and describe it; do not import a style
guide. A rule the codebase violates everywhere is not a rule, and citing it produces a review that
argues with the repo instead of with the diff.

**Anchors are permanent.** Reword the heading freely; never rename the anchor. It is the identifier
two other files and every past review comment point at.

An axis with no anchors is legitimate — it reports unanchored correctness defects, at `important` or
below unless the defect is confirmed and reproducible. Say so in its agent file rather than
inventing anchors to give it.

### Filling the routing table {#routing-table}

One entry per kind of work someone actually does here, keyed by how a model would recognise it.
`read` is what the work would break without — not everything related. `touch` globs need their
`/**`; a bare directory matches nothing.

Adding an entry is part of the change that needed it. An entry that routes to a doc which does not
cover the work is a bug in `routing.yml`, not a reason for the agent to guess.

### One invariant, one checker {#checkers}

Two tools, and the split is deliberate:

- **`doc-lint`** (`.claude/skills/doc-lint/check.mjs`) owns the **doc tree**: anchors defined and
  owned, one owner each, every reference resolving, index rows pointing at real files, routing
  targets existing, agents pinned, no stray edit damage. It labels each finding `fix` (one correct
  answer — apply it) or `ask` (a decision — report it and stop).
- **`review-doctor.js`** owns the **wiring**: every configured axis has an agent file, the schemas
  still reduce, the workflow trigger and the config still agree.

`review-doctor.js --all` runs both. When `doc-lint` is installed the doctor defers the tree to it
and says so; when it is not, the doctor falls back to a shallow anchor check and warns that it is
shallow. Never add the same invariant to both — a check that lives in two places is a check that
will disagree with itself.

**`review-ownership.json` is the source of truth; an agent's `## You own` block is a view of it.**
That is why the mismatch is a `fix` and not an `ask`: regenerate the block from the registry.

## Phase 5 — Write the agent files {#agents}

One file per axis at `<agentsRoot>/<name>-reviewer.md`, from `_axis-template.md`. Read the template;
it carries the section order and what each section is for.

What separates an agent file that works from one that produces noise:

- **The axis is one question**, stated in one line at the top.
- **"Not yours" is as long as "You own."** Every neighbouring axis is named, with what it takes.
  This is the section that prevents duplicate comments, and the one people skip.
- **The procedure is ordered and concrete** — what to open, what to grep, what to compare against.
  "Review for security issues" is not a procedure.
- **It names the reference implementation** to compare against, so the reviewer checks the pattern
  before calling it wrong.
- **It sets a severity ceiling** where one applies (structural axes never block).
- **It repeats nothing from the contract.** The contract is read first, every time.

Pin `model` and `effort` by how much *reasoning* the axis needs, not how much the consequence
matters: a sequence of structural checks runs at `medium`; an axis that must infer a failure across
files runs `high`. The integration agent is the cheapest thing in the pipeline — it dedupes and
counts.

The `integration` agent file ships portable → `#integration`. Copy it, change nothing but the
summary conventions if you must.

## Phase 6 — Register the ownership {#ownership}

`review-ownership.json` maps every rule anchor to exactly one axis. Build it from the agent files you
just wrote, then run `doc-lint`: an anchor claimed by two agents, or claimed by one and registered to
another, is a finding, not a matter of taste.

The registry is the source of truth and each agent's `## You own` block is a view of it — so a
mismatch is `doc-lint`'s to fix, by regenerating the block sorted from the registry
→ `#checkers`.

Anchors that deliberately belong to nobody (process docs, this file) go in `excluded` with a reason,
so the register stays a complete account rather than a partial one. A doc whose anchors are cited
but written as plain headings goes in `looseAnchors`, declared rather than assumed.

## Phase 7 — Calibrate before trusting it {#calibrate}

Run both checkers first — `node .github/scripts/review-doctor.js --all` — and get them clean.
Calibrating a pipeline whose anchors do not resolve measures the wrong thing.

**Run it on a pull request whose review you already know**, ideally a merged one where a human found
something real. Locally: `/review-pr <n>`. Then read the output as a reader, not as its author:

- Did it find the thing the human found? If not, which axis should have, and what in its file stopped
  it?
- How many comments would you have dismissed? More than a third is a calibration failure, and the fix
  is in the agent file — a tighter "not yours", a lower ceiling, a `review-contract.md#do-not-report` entry — never in
  the publish step.
- Did two axes say the same thing? That is an ownership bug → `#ownership`.
- Did an axis return nothing? Check `run.json`: routed and empty is fine and expected; never routed
  is a `route` regex that is too narrow.

Two or three passes on real diffs. An uncalibrated pipeline is worse than no pipeline: it teaches
the team that the comments are noise, and that lesson survives every later improvement.

## Phase 8 — Wire the CI {#ci}

1. `CLAUDE_CODE_OAUTH_TOKEN` as a repository secret.
2. Check the trigger phrase in the workflow matches `trigger` in the config — the doctor checks this.
3. Confirm the permission split survived: no job that runs a model may hold `pull-requests: write`.
4. Trigger it on a real pull request by commenting the trigger phrase, and read the run summary.

## The integration agent {#integration}

It is not a reviewer, and the schema is what enforces that: its output has a `summary` and a
`duplicates` list and no `findings` array, so it *cannot* add a comment. Two findings are duplicates
only when they make **the same claim about the same code**. The same defect at six sites is six
findings and six comments — collapsing them hides five unfixed sites.

Do not give this agent more to do. Every job added here is a judgement made without the diff.

## Adding an axis later {#adding}

Phases 2, 3, 4, 5, 6, 7 — in that order, for the one axis. Phase 4 is not optional for a new axis:
an axis with no anchors can never report a blocking finding it can justify. Then run the doctor and one calibration pass.
Adding an axis is cheap; the expensive part is the ownership boundary you now have to redraw in the
neighbouring agents' "Not yours" sections. Do that in the same change, or you have just bought
yourself duplicate comments.
